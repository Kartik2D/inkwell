import { hexToRgb, rgbToHex } from "../color/spaces";
import { normalizeDocumentHex } from "../document/colors";

/** Potrace options used for image import (and defaults for stroke tracing). */
export type PotraceTraceOptions = {
  turdsize: number;
  turnpolicy: number;
  alphamax: number;
  opticurve: boolean;
  opttolerance: number;
  threshold: number;
  extractcolors: boolean;
  posterizelevel: number;
  posterizationalgorithm: 0 | 1;
};

export type ImageImportOptions = PotraceTraceOptions & {
  snapToDocumentColors: boolean;
};

export const DEFAULT_POTRACE_OPTIONS: PotraceTraceOptions = {
  turdsize: 2,
  turnpolicy: 4,
  alphamax: 1,
  opticurve: true,
  opttolerance: 0.2,
  threshold: 0.5,
  extractcolors: true,
  posterizelevel: 4,
  posterizationalgorithm: 0,
};

export const DEFAULT_IMAGE_IMPORT_OPTIONS: ImageImportOptions = {
  ...DEFAULT_POTRACE_OPTIONS,
  snapToDocumentColors: false,
};

export const TURN_POLICY_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Black" },
  { value: 1, label: "White" },
  { value: 2, label: "Left" },
  { value: 3, label: "Right" },
  { value: 4, label: "Minority" },
  { value: 5, label: "Majority" },
];

export const MAX_POTRACE_PIXELS = 1_200_000;

export function isImageFile(file: File): boolean {
  // SVGs use the direct import path (no tracer).
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) return false;
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
}

/** Native file picker for a single image. */
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
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

/** Decode an image file onto a canvas, downscaling if above potrace's safe size. */
export async function fileToTraceCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  try {
    let { width, height } = bitmap;
    const pixels = width * height;
    if (pixels > MAX_POTRACE_PIXELS) {
      const scale = Math.sqrt(MAX_POTRACE_PIXELS / pixels);
      width = Math.max(1, Math.floor(width * scale));
      height = Math.max(1, Math.floor(height * scale));
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

export function nearestDocumentColor(hex: string, palette: string[]): string {
  if (palette.length === 0) return normalizeDocumentHex(hex);
  const [r, g, b] = hexToRgb(normalizeDocumentHex(hex));
  let best = palette[0];
  let bestDist = Infinity;
  for (const candidate of palette) {
    const [cr, cg, cb] = hexToRgb(normalizeDocumentHex(candidate));
    const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return normalizeDocumentHex(best);
}

export function paperColorToHex(color: {
  red: number;
  green: number;
  blue: number;
}): string {
  return normalizeDocumentHex(rgbToHex(color.red * 255, color.green * 255, color.blue * 255));
}

export function toPotraceWasmOptions(options: PotraceTraceOptions): Record<string, unknown> {
  const opts: Record<string, unknown> = {
    turdsize: options.turdsize,
    turnpolicy: options.turnpolicy,
    alphamax: options.alphamax,
    opticurve: options.opticurve ? 1 : 0,
    opttolerance: options.opttolerance,
    pathonly: false,
    extractcolors: options.extractcolors,
  };
  if (options.extractcolors) {
    opts.posterizelevel = options.posterizelevel;
    opts.posterizationalgorithm = options.posterizationalgorithm;
  } else {
    opts.threshold = options.threshold;
  }
  return opts;
}
