/**
 * Direct SVG import helpers (no tracer). Strokes are expanded to filled outlines.
 */
import paper from "paper";
import { nearestDocumentColor } from "./image-import";
import { tryBooleanOp } from "../render/paper/path-geometry";

export type SvgImportOptions = {
  snapToDocumentColors: boolean;
};

export const DEFAULT_SVG_IMPORT_OPTIONS: SvgImportOptions = {
  snapToDocumentColors: false,
};

const PREVIEW_COLOR_ATTRS = ["fill", "stroke", "stop-color", "flood-color"] as const;

/**
 * Remap paint colors in an SVG string to the nearest document color (preview only).
 * Leaves `none` / `currentColor` / urls alone.
 */
export function remapSvgColorsForPreview(svgText: string, palette: string[]): string {
  if (palette.length === 0) return svgText;
  try {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    if (doc.querySelector("parsererror")) return svgText;

    const snap = (value: string | null): string | null => {
      if (!value) return value;
      const v = value.trim();
      if (!v || v === "none" || v === "transparent" || v.startsWith("url(")) return value;
      if (v === "currentColor" || v === "inherit") return value;
      if (!v.startsWith("#") && !/^(rgb|hsl)/i.test(v)) return value;
      // Canvas can resolve named/rgb via a throwaway element.
      const hex = cssColorToHex(v);
      if (!hex) return value;
      return nearestDocumentColor(hex, palette);
    };

    for (const el of doc.querySelectorAll("*")) {
      for (const attr of PREVIEW_COLOR_ATTRS) {
        if (!el.hasAttribute(attr)) continue;
        const next = snap(el.getAttribute(attr));
        if (next != null) el.setAttribute(attr, next);
      }
      const style = el.getAttribute("style");
      if (style) {
        const nextStyle = style.replace(
          /(^|;)\s*(fill|stroke|stop-color|flood-color)\s*:\s*([^;]+)/gi,
          (_m, sep: string, prop: string, val: string) => {
            const snapped = snap(val);
            return `${sep}${prop}:${snapped ?? val}`;
          },
        );
        el.setAttribute("style", nextStyle);
      }
    }

    const root = doc.documentElement;
    return new XMLSerializer().serializeToString(root);
  } catch {
    return svgText;
  }
}

let cssColorCanvas: HTMLCanvasElement | null = null;

function cssColorToHex(value: string): string | null {
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) {
    if (v.length === 4) {
      return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
    }
    if (v.length >= 7) return v.slice(0, 7).toLowerCase();
  }
  cssColorCanvas ??= document.createElement("canvas");
  const ctx = cssColorCanvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#000000";
  ctx.fillStyle = v;
  const resolved = ctx.fillStyle;
  if (typeof resolved !== "string" || !resolved.startsWith("#")) return null;
  return resolved.slice(0, 7).toLowerCase();
}

export function isSvgFile(file: File): boolean {
  if (file.type === "image/svg+xml") return true;
  return /\.svg$/i.test(file.name);
}

/** Native file picker for a single SVG. */
export function pickSvgFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".svg,image/svg+xml";
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

export function fileToSvgText(file: File): Promise<string> {
  return file.text();
}

/**
 * Replace stroke geometry with filled outlines. Keeps existing fills.
 * Returns the new path list (originals are removed).
 */
export function convertStrokesToFills(paths: paper.PathItem[]): paper.PathItem[] {
  const out: paper.PathItem[] = [];
  for (const item of paths) {
    if (item instanceof paper.CompoundPath) {
      out.push(...convertCompoundStrokesToFills(item));
      continue;
    }
    if (item instanceof paper.Path) {
      out.push(...convertPathStrokesToFills(item));
      continue;
    }
    out.push(item);
  }
  return out;
}

function convertCompoundStrokesToFills(compound: paper.CompoundPath): paper.PathItem[] {
  const strokeColor = compound.strokeColor;
  const strokeWidth = compound.strokeWidth;
  const hasStroke = !!(strokeColor && strokeWidth > 0);
  const fillColor = compound.fillColor;
  const parent = compound.parent;
  const index = compound.index;

  // Clone before remove — CompoundPath.remove() takes children with it.
  const childClones = [...compound.children]
    .filter((c): c is paper.Path => c instanceof paper.Path)
    .map((c) => c.clone({ insert: false }) as paper.Path);
  compound.remove();

  const out: paper.PathItem[] = [];

  if (fillColor && childClones.length > 0) {
    const fillClone = new paper.CompoundPath({
      children: childClones.map((c) => c.clone({ insert: false })),
      insert: false,
      fillColor,
      strokeWidth: 0,
      strokeColor: null,
    });
    if (parent) parent.insertChild(index, fillClone);
    out.push(fillClone);
  }

  if (hasStroke) {
    for (const child of childClones) {
      child.strokeColor = strokeColor;
      child.strokeWidth = strokeWidth;
      child.strokeCap = "round";
      child.strokeJoin = "round";
      const expanded = expandStrokePath(child);
      if (expanded) {
        if (parent) parent.addChild(expanded);
        out.push(expanded);
      }
    }
  }

  return out;
}

function convertPathStrokesToFills(path: paper.Path): paper.PathItem[] {
  const fillColor = path.fillColor;
  const hasStroke = !!(path.strokeColor && path.strokeWidth > 0);

  if (!hasStroke) {
    path.strokeWidth = 0;
    path.strokeColor = null;
    if (fillColor) return [path];
    path.remove();
    return [];
  }

  const out: paper.PathItem[] = [];
  const parent = path.parent;
  const index = path.index;

  if (fillColor) {
    const fillOnly = path.clone({ insert: false }) as paper.Path;
    fillOnly.strokeWidth = 0;
    fillOnly.strokeColor = null;
    fillOnly.fillColor = fillColor;
    if (parent) parent.insertChild(index, fillOnly);
    out.push(fillOnly);
  }

  const expanded = expandStrokePath(path);
  if (expanded) {
    if (parent) parent.addChild(expanded);
    out.push(expanded);
  }

  path.remove();
  return out;
}

/** Expand a stroked centerline into a filled outline (round caps). */
function expandStrokePath(path: paper.Path): paper.PathItem | null {
  const color = path.strokeColor;
  const width = path.strokeWidth;
  if (!color || !(width > 0)) return null;

  const len = path.length;
  if (!(len > 1e-6)) {
    // Degenerate: just a dot.
    const pt = path.firstSegment?.point ?? path.bounds.center;
    const dot = new paper.Path.Circle({
      center: pt,
      radius: width / 2,
      insert: false,
      fillColor: color,
      strokeWidth: 0,
    });
    return dot;
  }

  const half = width / 2;
  const step = Math.max(0.35, Math.min(3, half * 0.45));
  const steps = Math.max(path.closed ? 12 : 8, Math.ceil(len / step));

  if (path.closed) {
    return expandClosedStroke(path, half, color, steps);
  }
  return expandOpenStroke(path, half, color, steps, len);
}

function expandClosedStroke(
  path: paper.Path,
  half: number,
  color: paper.Color,
  steps: number,
): paper.PathItem | null {
  const len = path.length;
  const outer = new paper.Path({ insert: false });
  const inner = new paper.Path({ insert: false });
  for (let i = 0; i < steps; i++) {
    const loc = path.getLocationAt((i / steps) * len);
    if (!loc) continue;
    outer.add(loc.point.add(loc.normal.multiply(half)));
    inner.add(loc.point.add(loc.normal.multiply(-half)));
  }
  outer.closed = true;
  inner.closed = true;
  outer.fillColor = color;
  inner.fillColor = color;

  let ring = tryBooleanOp(outer, inner, "subtract");
  if (!ring) ring = tryBooleanOp(inner, outer, "subtract");
  outer.remove();
  inner.remove();
  if (!ring) return null;
  ring.fillColor = color;
  ring.strokeWidth = 0;
  ring.strokeColor = null;
  if (ring.parent) ring.remove();
  return ring;
}

function expandOpenStroke(
  path: paper.Path,
  half: number,
  color: paper.Color,
  steps: number,
  len: number,
): paper.PathItem | null {
  const left: paper.Point[] = [];
  const right: paper.Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const loc = path.getLocationAt((i / steps) * len);
    if (!loc) continue;
    left.push(loc.point.add(loc.normal.multiply(half)));
    right.push(loc.point.add(loc.normal.multiply(-half)));
  }
  if (left.length < 2) return null;

  const outline = new paper.Path({ insert: false });
  for (const p of left) outline.add(p);
  for (let i = right.length - 1; i >= 0; i--) outline.add(right[i]);
  outline.closed = true;
  outline.fillColor = color;
  outline.strokeWidth = 0;

  const start = path.getPointAt(0);
  const end = path.getPointAt(len);
  const c1 = new paper.Path.Circle({
    center: start,
    radius: half,
    insert: false,
    fillColor: color,
  });
  const c2 = new paper.Path.Circle({
    center: end,
    radius: half,
    insert: false,
    fillColor: color,
  });

  let united = tryBooleanOp(outline, c1, "unite");
  c1.remove();
  if (united) outline.remove();
  else united = outline;

  const result = tryBooleanOp(united, c2, "unite");
  c2.remove();
  if (result) {
    if (result !== united) united.remove();
    united = result;
  }

  united.fillColor = color;
  united.strokeWidth = 0;
  united.strokeColor = null;
  if (united.parent) united.remove();
  return united;
}
