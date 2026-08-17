/**
 * Artistic Text — Affinity-style drag-to-size, type, place as vector.
 * Drag sets baseline + font size; release starts typing; finish traces
 * glyphs to paths via potrace (same vector merge as brush/shape).
 */
import paper from "paper";
import type { Point, CanvasConfig } from "../geometry/types";
import { pixelToViewport } from "../geometry/coords";
import type { PaperRenderer } from "../render/paper-renderer";
import type { ChromeLayer } from "../render/chrome-layer";
import type { Camera } from "../render/camera";
import { setSnapGuides, snapScreenPoint, type SnapGuide } from "./snap";
import { extractPaths } from "../render/paper/svg-io";
import {
  configStore,
  colorStore,
  toolSettingsStore,
} from "../state/index";
import type { PaintMode } from "../tools/paint-mode";
import { artisticTextFontStore, cssFont } from "../tools/artistic-text-font";
import type { Tracer } from "../tracing/potrace-tracer";

const DEFAULT_FONT_PX = 48;
const MIN_DRAG_PX = 4;
const RENDER_SCALE = 3;
const PREVIEW_LETTER = "A";

type Phase = "idle" | "dragging" | "typing";

export class ArtisticTextController {
  private config: CanvasConfig;
  private paperRenderer: PaperRenderer;
  private camera: Camera;
  private chromeLayer: ChromeLayer;
  private tracer: Tracer;
  private snapGuides: SnapGuide[] = [];
  private onSnapshot?: () => void;

  private phase: Phase = "idle";
  private dragStartScreen: Point | null = null;
  private dragEndScreen: Point | null = null;
  private baselineScreen: Point | null = null;
  private fontSize = DEFAULT_FONT_PX;
  private text = "";
  private insideClip: paper.PathItem | null | undefined = undefined;
  private caretOn = true;
  private caretTimer: ReturnType<typeof setInterval> | null = null;
  private committing = false;

  private readonly input = document.createElement("textarea");

  constructor(
    paperRenderer: PaperRenderer,
    camera: Camera,
    chromeLayer: ChromeLayer,
    tracer: Tracer,
  ) {
    this.paperRenderer = paperRenderer;
    this.camera = camera;
    this.chromeLayer = chromeLayer;
    this.tracer = tracer;
    this.config = configStore.get();
    configStore.subscribe((config) => {
      this.config = config;
      if (this.phase !== "idle") this.drawUI();
    });
    artisticTextFontStore.subscribe(() => {
      if (this.phase !== "idle") this.drawUI();
    });

    this.input.setAttribute("aria-label", "Artistic text");
    this.input.autocomplete = "off";
    this.input.spellcheck = false;
    this.input.tabIndex = -1;
    Object.assign(this.input.style, {
      position: "fixed",
      left: "-9999px",
      top: "0",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
      resize: "none",
      border: "none",
      padding: "0",
      margin: "0",
      overflow: "hidden",
    } as CSSStyleDeclaration);
    document.body.appendChild(this.input);

    this.input.addEventListener("input", () => {
      if (this.phase !== "typing") return;
      this.text = this.input.value;
      this.drawUI();
    });
    this.input.addEventListener("keydown", (e) => {
      if (this.phase !== "typing") return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.clearDraft();
        return;
      }
      // Enter commits; Shift+Enter inserts a line (Affinity uses Enter for newline —
      // click-away / Enter-without-shift is the cheap finish gesture here).
      if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        void this.commit();
      }
    });
  }

  setSnapshotCallback(callback: () => void): void {
    this.onSnapshot = callback;
  }

  hasDraft(): boolean {
    return this.phase !== "idle";
  }

  isTyping(): boolean {
    return this.phase === "typing";
  }

  handleStart(point: Point): void {
    if (this.committing) return;

    if (this.phase === "typing") {
      void this.commit().then(() => this.beginDrag(point));
      return;
    }

    this.beginDrag(point);
  }

  handleMove(point: Point): void {
    if (this.phase !== "dragging" || !this.dragStartScreen) return;
    this.dragEndScreen = this.snapScreen(point);
    this.applyDragSize();
    this.drawUI();
  }

  handleEnd(): void {
    if (this.phase !== "dragging" || !this.dragStartScreen) return;

    const end = this.dragEndScreen ?? this.dragStartScreen;
    const dx = end.x - this.dragStartScreen.x;
    const dy = end.y - this.dragStartScreen.y;
    if (Math.hypot(dx, dy) < MIN_DRAG_PX) {
      this.fontSize = DEFAULT_FONT_PX;
      this.baselineScreen = { ...this.dragStartScreen };
    } else {
      this.applyDragSize();
    }

    this.dragStartScreen = null;
    this.dragEndScreen = null;
    this.snapGuides = [];
    setSnapGuides([]);
    this.enterTyping();
  }

  handleCancel(): void {
    this.clearDraft();
  }

  /** Tool switch: commit non-empty text, else discard. */
  async flushOrClear(): Promise<void> {
    if (this.phase === "typing" && this.text.trim().length > 0) {
      await this.commit();
      return;
    }
    this.clearDraft();
  }

  clearDraft(): void {
    this.stopCaret();
    this.blurInput();
    this.phase = "idle";
    this.dragStartScreen = null;
    this.dragEndScreen = null;
    this.baselineScreen = null;
    this.fontSize = DEFAULT_FONT_PX;
    this.text = "";
    this.insideClip = undefined;
    this.input.value = "";
    this.snapGuides = [];
    setSnapGuides([]);
    this.chromeLayer.clear();
  }

  drawUI(): void {
    this.chromeLayer.clear();
    if (this.phase === "idle" || !this.baselineScreen) {
      setSnapGuides([]);
      return;
    }
    setSnapGuides(this.snapGuides);

    const ctx = this.chromeLayer.getContext();
    const color = colorStore.get();
    const fontFamily = this.fontFamily();
    const display =
      this.phase === "dragging" ? PREVIEW_LETTER : this.text.length > 0 ? this.text : "";

    if (this.phase === "dragging" && this.fontSize < 1) return;

    ctx.save();
    ctx.font = cssFont(this.fontSize, fontFamily);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = color;
    ctx.globalAlpha = this.phase === "dragging" ? 0.55 : 1;

    const lines = (display.length > 0 ? display : "").split("\n");
    const lineHeight = this.fontSize * 1.2;
    let y = this.baselineScreen.y;
    for (const line of lines) {
      if (line.length > 0) {
        ctx.fillText(line, this.baselineScreen.x, y);
      }
      y += lineHeight;
    }

    if (this.phase === "typing" && this.caretOn) {
      const last = lines[lines.length - 1] ?? "";
      const caretX =
        this.baselineScreen.x + (last ? ctx.measureText(last).width : 0);
      const caretY = this.baselineScreen.y + lineHeight * (lines.length - 1);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, this.fontSize / 24);
      ctx.beginPath();
      ctx.moveTo(caretX, caretY - this.fontSize * 0.85);
      ctx.lineTo(caretX, caretY + this.fontSize * 0.15);
      ctx.stroke();
    }

    ctx.restore();
  }

  private beginDrag(point: Point): void {
    this.clearDraft();
    const screen = this.snapScreen(point);
    this.phase = "dragging";
    this.dragStartScreen = screen;
    this.dragEndScreen = screen;
    this.baselineScreen = { ...screen };
    this.fontSize = 0;
    this.text = "";

    if (this.paintMode() === "inside") {
      this.insideClip = this.paperRenderer.hitToClipPathItem(
        this.paperRenderer.hitTest(screen),
      );
    } else {
      this.insideClip = undefined;
    }

    this.drawUI();
  }

  private applyDragSize(): void {
    if (!this.dragStartScreen || !this.dragEndScreen) return;
    const a = this.dragStartScreen;
    const b = this.dragEndScreen;
    const h = b.y - a.y;
    this.fontSize = Math.abs(h);
    // Origin stays at press; only vertical delta sets size.
    this.baselineScreen = { x: a.x, y: h >= 0 ? a.y + this.fontSize : a.y };
  }

  private enterTyping(): void {
    this.phase = "typing";
    this.text = "";
    this.input.value = "";
    this.startCaret();
    this.drawUI();
    // Focus after pointer-up so the gesture doesn't steal it.
    requestAnimationFrame(() => {
      this.input.focus({ preventScroll: true });
    });
  }

  async commit(): Promise<void> {
    if (this.committing || this.phase !== "typing") return;
    const text = this.text;
    if (!text.trim() || !this.baselineScreen) {
      this.clearDraft();
      return;
    }

    this.committing = true;
    this.stopCaret();
    this.blurInput();

    const baseline = { ...this.baselineScreen };
    const fontSize = this.fontSize;
    const fontFamily = this.fontFamily();
    const paint = this.paintMode();
    const clip = this.insideClip;

    // Clear draft chrome before async trace so it doesn't linger.
    this.phase = "idle";
    this.baselineScreen = null;
    this.text = "";
    this.input.value = "";
    this.insideClip = undefined;
    this.chromeLayer.clear();

    try {
      const path = await this.traceTextToPath(text, fontFamily, fontSize, baseline);
      if (!path) return;

      const color = colorStore.get();
      if (paint === "subtract") {
        this.paperRenderer.subtractShape(path);
      } else if (paint === "inside") {
        this.paperRenderer.addShapeIntersectClip(path, color, clip ?? null);
      } else {
        this.paperRenderer.addShape(path, color);
      }
      this.onSnapshot?.();
    } catch (error) {
      console.error("Artistic text commit failed:", error);
    } finally {
      this.committing = false;
    }
  }

  private async traceTextToPath(
    text: string,
    fontFamily: string,
    fontSize: number,
    baseline: Point,
  ): Promise<paper.PathItem | null> {
    const measure = document.createElement("canvas").getContext("2d");
    if (!measure) return null;
    measure.font = cssFont(fontSize, fontFamily);
    measure.textBaseline = "alphabetic";

    const lines = text.split("\n");
    const lineHeight = fontSize * 1.2;
    let maxW = 0;
    for (const line of lines) {
      maxW = Math.max(maxW, measure.measureText(line).width);
    }
    const metrics = measure.measureText(lines[0] || "M");
    const ascent =
      metrics.actualBoundingBoxAscent > 0
        ? metrics.actualBoundingBoxAscent
        : fontSize * 0.8;
    const descent =
      metrics.actualBoundingBoxDescent > 0
        ? metrics.actualBoundingBoxDescent
        : fontSize * 0.2;
    const pad = Math.ceil(fontSize * 0.15);
    const cssW = Math.max(1, Math.ceil(maxW + pad * 2));
    const cssH = Math.max(
      1,
      Math.ceil(ascent + descent + lineHeight * (lines.length - 1) + pad * 2),
    );

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(cssW * RENDER_SCALE);
    canvas.height = Math.ceil(cssH * RENDER_SCALE);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.font = cssFont(fontSize, fontFamily);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#000000";

    let y = pad + ascent;
    for (const line of lines) {
      if (line.length > 0) ctx.fillText(line, pad, y);
      y += lineHeight;
    }

    const svg = await this.tracer.trace(canvas);
    if (!svg) return null;

    const imported = paper.project.importSVG(svg) as paper.Item | null;
    if (!imported) return null;

    const paths = extractPaths(imported);
    if (
      imported.parent &&
      !(imported instanceof paper.Path) &&
      !(imported instanceof paper.CompoundPath)
    ) {
      imported.remove();
    }
    if (paths.length === 0) return null;

    for (const p of paths) p.remove();

    let shape: paper.PathItem;
    if (paths.length === 1) {
      shape = paths[0];
    } else {
      const compound = new paper.CompoundPath({ insert: false });
      for (const p of paths) {
        if (p instanceof paper.CompoundPath) {
          for (const child of [...p.children]) compound.addChild(child);
          p.remove();
        } else {
          compound.addChild(p);
        }
      }
      shape = compound;
    }

    // Canvas px → screen px, then place so first baseline matches drag origin.
    shape.scale(1 / RENDER_SCALE, new paper.Point(0, 0));
    const screenLeft = baseline.x - pad;
    const screenTop = baseline.y - ascent - pad;
    shape.translate(new paper.Point(screenLeft, screenTop));
    return shape;
  }

  private fontFamily(): string {
    return artisticTextFontStore.get().family || "sans-serif";
  }

  private paintMode(): PaintMode {
    const mode = (toolSettingsStore.get()["artistic-text"] as { mode?: string } | undefined)
      ?.mode;
    if (mode === "subtract" || mode === "inside") return mode;
    return "add";
  }

  private toScreen(point: Point): Point {
    return pixelToViewport(point, this.config);
  }

  private snapScreen(point: Point): Point {
    const snapped = snapScreenPoint(
      this.toScreen(point),
      this.camera,
      this.paperRenderer,
      new Set(),
    );
    this.snapGuides = snapped.guides;
    return snapped.screen;
  }

  private startCaret(): void {
    this.stopCaret();
    this.caretOn = true;
    this.caretTimer = setInterval(() => {
      this.caretOn = !this.caretOn;
      if (this.phase === "typing") this.drawUI();
    }, 530);
  }

  private stopCaret(): void {
    if (this.caretTimer != null) {
      clearInterval(this.caretTimer);
      this.caretTimer = null;
    }
    this.caretOn = true;
  }

  private blurInput(): void {
    if (document.activeElement === this.input) this.input.blur();
  }
}
