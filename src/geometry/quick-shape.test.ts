import { recognizeQuickShape } from "./quick-shape";
import type { Point } from "./types";

function eq(name: string, got: unknown, want: unknown): void {
  if (got !== want) throw new Error(`${name}: got ${String(got)}, want ${String(want)}`);
}

function densify(poly: Point[], step = 3): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(d / step));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  out.push({ ...poly[poly.length - 1] });
  return out;
}

function circle(cx: number, cy: number, r: number, n = 48): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
  }
  out.push({ ...out[0] });
  return out;
}

function semi(cx: number, cy: number, r: number, n = 32): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = Math.PI * (i / n);
    out.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
  }
  return out;
}

function shallowArc(chord: number, height: number, n = 24): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = t * chord;
    const y = 4 * height * t * (1 - t);
    out.push({ x, y });
  }
  return out;
}

function lumpyLoop(): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const r = 40 + 25 * Math.cos(3 * t);
    out.push({ x: 100 + Math.cos(t) * r, y: 100 + Math.sin(t) * r });
  }
  out.push({ ...out[0] });
  return out;
}

function quarterArc(): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = (Math.PI / 2) * (i / 24);
    out.push({ x: 100 + Math.cos(t) * 50, y: 100 + Math.sin(t) * 50 });
  }
  return out;
}

eq("circle", recognizeQuickShape(circle(100, 100, 40))?.kind, "circle");

const lumpy = recognizeQuickShape(lumpyLoop());
if (lumpy?.kind === "circle") throw new Error("lumpy loop should not be circle");

eq("semi", recognizeQuickShape(semi(100, 100, 50))?.kind, "curves");

const shallow = recognizeQuickShape(shallowArc(80, 4), { curveStyle: 0 });
if (shallow?.kind === "curves") {
  throw new Error("shallow arc should not snap to a curve when straight");
}

eq(
  "quarter straight",
  recognizeQuickShape(quarterArc(), { curveStyle: 0 })?.kind,
  "line",
);
eq(
  "quarter curvy stroke",
  recognizeQuickShape(quarterArc(), { allowShapes: false, curveStyle: 1 })
    ?.kind,
  "curves",
);

eq(
  "L",
  recognizeQuickShape(densify([{ x: 0, y: 0 }, { x: 0, y: 60 }, { x: 60, y: 60 }]))
    ?.kind,
  "polyline",
);

eq(
  "Z",
  recognizeQuickShape(
    densify([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 0, y: 50 },
      { x: 50, y: 50 },
    ]),
  )?.kind,
  "polyline",
);

eq(
  "strokes-only L",
  recognizeQuickShape(
    densify([{ x: 0, y: 0 }, { x: 0, y: 60 }, { x: 60, y: 60 }]),
    { allowShapes: false },
  )?.kind,
  "polyline",
);

if (recognizeQuickShape(circle(100, 100, 40), { allowShapes: false })?.kind === "circle") {
  throw new Error("shapes-off circle should not snap to a circle");
}
eq(
  "shapes-off semi straight",
  recognizeQuickShape(semi(100, 100, 50), { allowShapes: false, curveStyle: 0 })
    ?.kind,
  "line",
);
eq(
  "shapes-off semi curvy",
  recognizeQuickShape(semi(100, 100, 50), { allowShapes: false, curveStyle: 1 })
    ?.kind,
  "curves",
);

const asymmetric: Point[] = [];
for (let i = 0; i <= 32; i++) {
  const t = i / 32;
  asymmetric.push({
    x: t * 80,
    y: 36 * Math.sin(Math.PI * t ** 0.55),
  });
}
const stroked = recognizeQuickShape(asymmetric, {
  allowShapes: false,
  curveStyle: 1,
});
if (!stroked) throw new Error("asymmetric bowl should snap as a stroke");
{
  const a = stroked.path[0];
  const b = stroked.path[stroked.path.length - 1];
  const chord = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / chord;
  const ny = (b.x - a.x) / chord;
  let peakI = 0;
  let peakH = -1;
  for (let i = 0; i < stroked.path.length; i++) {
    const p = stroked.path[i];
    const h = Math.abs((p.x - a.x) * nx + (p.y - a.y) * ny);
    if (h > peakH) {
      peakH = h;
      peakI = i;
    }
  }
  const peakT = peakI / Math.max(stroked.path.length - 1, 1);
  if (peakT > 0.42 && peakT < 0.58) {
    throw new Error("shapes-off curvy must keep the drawn bulge, not a symmetric semi");
  }
}

console.log("quick-shape tests ok");
