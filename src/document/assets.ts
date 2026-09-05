/**
 * Content-addressed media assets (image / audio).
 *
 * Document JSON stores asset ids + metadata. Bytes live in IndexedDB.
 */
import { Store } from "../state/index";
import type { AssetMeta } from "./document";

export const DB_NAME = "flipcel";
export const DB_VERSION = 2;
export const DOC_STORE = "documents";
export const ASSET_STORE = "assets";
export const AUTOSAVE_KEY = "autosave";

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOC_STORE)) {
        db.createObjectStore(DOC_STORE);
      }
      if (!db.objectStoreNames.contains(ASSET_STORE)) {
        db.createObjectStore(ASSET_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  return /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(file.name);
}

export function pickMediaFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    document.body.appendChild(input);
    const cleanup = () => input.remove();
    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    });
    input.addEventListener("cancel", () => {
      cleanup();
      resolve(null);
    });
    input.click();
  });
}

export async function putAsset(file: File): Promise<{ id: string; meta: AssetMeta }> {
  const buf = await file.arrayBuffer();
  const id = await sha256Hex(buf);
  const blob = new Blob([buf], { type: file.type || "application/octet-stream" });
  const meta: AssetMeta = {
    name: file.name || "asset",
    mime: file.type || blob.type,
    size: blob.size,
  };
  if (file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)) {
    try {
      const bmp = await createImageBitmap(blob);
      meta.width = bmp.width;
      meta.height = bmp.height;
      bmp.close();
    } catch {
      // Dimensions optional.
    }
  }
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, "readwrite");
      tx.objectStore(ASSET_STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  return { id, meta };
}

export async function getAssetBlob(id: string): Promise<Blob | null> {
  const db = await openDatabase();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, "readonly");
      const request = tx.objectStore(ASSET_STORE).get(id);
      request.onsuccess = () => {
        const value = request.result;
        resolve(value instanceof Blob ? value : null);
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function hasAsset(id: string): Promise<boolean> {
  return (await getAssetBlob(id)) != null;
}

export type AssetLoadStatus = "loading" | "ready" | "missing";

export const assetStatusStore = new Store<Record<string, AssetLoadStatus>>({});

export type DecodedAudio = { buffer: AudioBuffer; peaks: Float32Array };

let sharedAudioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  return (sharedAudioCtx ??= new AudioContext());
}

function computePeaks(buffer: AudioBuffer, buckets = 256): Float32Array {
  const peaks = new Float32Array(buckets * 2);
  const ch0 = buffer.getChannelData(0);
  const bucketSize = Math.max(1, Math.floor(ch0.length / buckets));
  for (let i = 0; i < buckets; i++) {
    let min = 1;
    let max = -1;
    const start = i * bucketSize;
    const end = Math.min(ch0.length, start + bucketSize);
    for (let s = start; s < end; s++) {
      const v = ch0[s];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks[i * 2] = min;
    peaks[i * 2 + 1] = max;
  }
  return peaks;
}

export class AssetCache {
  private images = new Map<string, HTMLImageElement>();
  private audio = new Map<string, DecodedAudio>();
  private inflight = new Map<string, Promise<void>>();
  onChange: ((id: string) => void) | null = null;

  getImage(id: string): HTMLImageElement | null {
    return this.images.get(id) ?? null;
  }

  getAudio(id: string): DecodedAudio | null {
    return this.audio.get(id) ?? null;
  }

  private setStatus(id: string, status: AssetLoadStatus): void {
    const prev = assetStatusStore.get();
    if (prev[id] === status) return;
    assetStatusStore.set({ ...prev, [id]: status });
  }

  async ensureImage(id: string): Promise<HTMLImageElement | null> {
    const hit = this.images.get(id);
    if (hit) return hit;
    await this.load(id, "image");
    return this.images.get(id) ?? null;
  }

  async ensureAudio(id: string): Promise<DecodedAudio | null> {
    const hit = this.audio.get(id);
    if (hit) return hit;
    await this.load(id, "audio");
    return this.audio.get(id) ?? null;
  }

  async prime(refs: Array<{ id: string; kind: "image" | "audio" }>): Promise<void> {
    await Promise.all(refs.map((ref) => this.ensure(ref.id, ref.kind)));
  }

  private ensure(id: string, kind: "image" | "audio"): Promise<void> {
    if (kind === "image" && this.images.has(id)) return Promise.resolve();
    if (kind === "audio" && this.audio.has(id)) return Promise.resolve();
    return this.load(id, kind);
  }

  private load(id: string, kind: "image" | "audio"): Promise<void> {
    const existing = this.inflight.get(`${kind}:${id}`);
    if (existing) return existing;
    const p = this.loadNow(id, kind);
    this.inflight.set(`${kind}:${id}`, p);
    return p.finally(() => this.inflight.delete(`${kind}:${id}`));
  }

  private async loadNow(id: string, kind: "image" | "audio"): Promise<void> {
    this.setStatus(id, "loading");
    const blob = await getAssetBlob(id);
    if (!blob) {
      this.setStatus(id, "missing");
      this.onChange?.(id);
      return;
    }
    try {
      if (kind === "image") {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.src = url;
        await img.decode();
        this.images.set(id, img);
      } else {
        const ctx = getAudioContext();
        const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
        this.audio.set(id, { buffer, peaks: computePeaks(buffer) });
      }
      this.setStatus(id, "ready");
    } catch {
      this.setStatus(id, "missing");
    }
    this.onChange?.(id);
  }
}

export const assetCache = new AssetCache();
