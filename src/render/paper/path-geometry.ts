import paper from "paper";

export function getContainmentPoint(path: paper.Path): paper.Point | null {
  try {
    const interior = (path as { getInteriorPoint?: () => paper.Point | null }).getInteriorPoint?.();
    if (interior) return interior;
  } catch {}

  if (path.segments.length > 0) {
    let sx = 0;
    let sy = 0;
    for (const segment of path.segments) {
      sx += segment.point.x;
      sy += segment.point.y;
    }
    const centroid = new paper.Point(sx / path.segments.length, sy / path.segments.length);
    try {
      if (path.contains(centroid)) return centroid;
    } catch {}
  }

  const len = path.length;
  if (len > 0) {
    const minDim = Math.min(path.bounds.width, path.bounds.height);
    const eps = Math.max(0.05, minDim * 0.05);
    for (const t of [0.125, 0.375, 0.625, 0.875]) {
      const offset = len * t;
      const point = path.getPointAt(offset);
      const normal = path.getNormalAt(offset);
      if (!point || !normal) continue;
      for (const probe of [point.add(normal.multiply(eps)), point.subtract(normal.multiply(eps))]) {
        try {
          if (path.contains(probe)) return probe;
        } catch {}
      }
    }
  }

  try {
    if (path.contains(path.bounds.center)) return path.bounds.center;
  } catch {}

  return null;
}

const AREA_EPS = 1e-4;
const SLIVER_FRAC = 0.05;
const BOOLEAN_INSERT = { insert: false as const };

function pathAbsArea(item: paper.PathItem): number {
  if (!(item instanceof paper.Path) && !(item instanceof paper.CompoundPath)) {
    return 0;
  }
  try {
    return Math.abs(item.area);
  } catch {
    return 0;
  }
}

function eachTargetPath(target: paper.PathItem, visit: (path: paper.Path) => boolean): boolean {
  if (target instanceof paper.Path) return visit(target);
  if (target instanceof paper.CompoundPath) {
    for (const child of target.children) {
      if (child instanceof paper.Path && !visit(child)) return false;
    }
    return true;
  }
  return false;
}

function hasClosedFill(item: paper.PathItem): boolean {
  if (item instanceof paper.Path) return item.closed && item.segments.length >= 3;
  if (item instanceof paper.CompoundPath) {
    for (const child of item.children) {
      if (child instanceof paper.Path && child.closed && child.segments.length >= 3) {
        return true;
      }
    }
  }
  return false;
}

function isUsableFill(item: paper.PathItem): boolean {
  if (item.isEmpty()) return false;
  if (!hasClosedFill(item)) return false;
  return pathAbsArea(item) > AREA_EPS;
}

function pointIn(cutter: paper.PathItem, point: paper.Point): boolean {
  try {
    return cutter.contains(point);
  } catch {
    return false;
  }
}

/** Cutter AABB contains target, and every target vertex / AABB corner is inside. */
export function strictlyCovered(cutter: paper.PathItem, target: paper.PathItem): boolean {
  try {
    if (!cutter.bounds.contains(target.bounds)) return false;
  } catch {
    return false;
  }
  if (pathAbsArea(target) <= 0) return false;

  const b = target.bounds;
  const corners = [
    b.topLeft,
    b.topRight,
    b.bottomLeft,
    b.bottomRight,
    b.center,
  ];
  for (const corner of corners) {
    if (!pointIn(cutter, corner)) return false;
  }

  let anyVertex = false;
  const allInside = eachTargetPath(target, (path) => {
    for (const seg of path.segments) {
      anyVertex = true;
      if (!pointIn(cutter, seg.point)) return false;
    }
    return true;
  });
  return allInside && anyVertex;
}

function forceEvenOdd(item: paper.PathItem | null): void {
  if (item instanceof paper.CompoundPath) item.fillRule = "evenodd";
}

/**
 * After vertex edits (simplify/smooth): clip holes that extend outside
 * their containing outer path.
 */
export function sanitizePathItemTopology(item: paper.PathItem): void {
  if (!item.parent) return;
  if (!(item instanceof paper.CompoundPath)) return;

  const live = () =>
    item.children.filter(
      (child): child is paper.Path => child instanceof paper.Path && !!child.parent,
    );

  for (const hole of [...live()]) {
    if (!hole.parent) continue;

    const interior = getContainmentPoint(hole);
    if (!interior) continue;

    let outer: paper.Path | null = null;
    let bestArea = Infinity;
    const holeArea = Math.abs(hole.area);
    for (const candidate of live()) {
      if (candidate === hole || !candidate.parent) continue;
      try {
        if (!candidate.contains(interior)) continue;
      } catch {
        continue;
      }
      const area = Math.abs(candidate.area);
      if (area <= holeArea + 1e-6) continue;
      if (area < bestArea) {
        bestArea = area;
        outer = candidate;
      }
    }
    if (!outer) continue;

    if (holeFullyInside(hole, outer)) continue;

    const holeClone = hole.clone({ insert: false }) as paper.PathItem;
    const outerClone = outer.clone({ insert: false }) as paper.PathItem;
    const clipped = tryIntersect(holeClone, outerClone);
    holeClone.remove();
    outerClone.remove();

    if (!clipped || clipped.isEmpty()) {
      clipped?.remove();
      continue;
    }

    const replacement =
      clipped instanceof paper.Path
        ? clipped
        : clipped instanceof paper.CompoundPath
          ? largestChildPath(clipped)
          : null;

    if (!replacement) {
      clipped.remove();
      continue;
    }

    hole.removeSegments();
    for (const seg of replacement.segments) {
      hole.add(seg.clone());
    }
    hole.closed = true;
    clipped.remove();
  }

  forceEvenOdd(item);
}

function holeFullyInside(hole: paper.Path, outer: paper.Path): boolean {
  try {
    if (hole.intersects(outer)) return false;
  } catch {
    return false;
  }
  for (const seg of hole.segments) {
    if (!pointIn(outer, seg.point)) return false;
  }
  return true;
}

function largestChildPath(compound: paper.CompoundPath): paper.Path | null {
  let best: paper.Path | null = null;
  let bestArea = -1;
  for (const child of compound.children) {
    if (!(child instanceof paper.Path)) continue;
    const area = Math.abs(child.area);
    if (area > bestArea) {
      bestArea = area;
      best = child;
    }
  }
  return best;
}

/** AABB + crossings. Throws fail open so merge still tries the boolean. */
function cheapOverlap(a: paper.PathItem, b: paper.PathItem): boolean {
  if (!a.bounds.intersects(b.bounds)) return false;
  try {
    return a.intersects(b);
  } catch {
    return true;
  }
}

/** cheapOverlap, plus nested-without-crossing (extract / intersect). */
export function pathsCollide(a: paper.PathItem, b: paper.PathItem): boolean {
  if (cheapOverlap(a, b)) return true;
  try {
    return a.contains(b.bounds.center) || b.contains(a.bounds.center);
  } catch {
    return false;
  }
}

const POLYLINE_FLATNESS = 0.5;

function cloneAsPolyline(item: paper.PathItem): paper.PathItem | null {
  const clone = item.clone({ insert: false }) as paper.PathItem;
  try {
    eachTargetPath(clone, (path) => {
      path.flatten(POLYLINE_FLATNESS);
      return true;
    });
  } catch {
    clone.remove();
    return null;
  }
  if (!isUsableFill(clone)) {
    clone.remove();
    return null;
  }
  return clone;
}

function paperBoolean(
  target: paper.PathItem,
  other: paper.PathItem,
  op: "unite" | "subtract" | "intersect",
): paper.PathItem | null {
  let result: paper.PathItem | null = null;
  try {
    result =
      op === "unite"
        ? target.unite(other, BOOLEAN_INSERT)
        : op === "subtract"
          ? target.subtract(other, BOOLEAN_INSERT)
          : target.intersect(other, BOOLEAN_INSERT);
  } catch {
    result?.remove();
    return null;
  }
  forceEvenOdd(result);

  if (!result || !isUsableFill(result)) {
    result?.remove();
    return null;
  }
  const area = pathAbsArea(result);
  if (
    op === "unite" &&
    area + AREA_EPS < Math.max(pathAbsArea(target), pathAbsArea(other))
  ) {
    result.remove();
    return null;
  }
  if (op === "subtract") {
    const targetArea = pathAbsArea(target);
    if (targetArea > AREA_EPS && area + AREA_EPS < targetArea * SLIVER_FRAC) {
      result.remove();
      return null;
    }
  }
  return result;
}

export function tryBooleanOp(
  target: paper.PathItem,
  other: paper.PathItem,
  op: "unite" | "subtract" | "intersect",
): paper.PathItem | null {
  const cubic = paperBoolean(target, other, op);
  if (cubic) return cubic;

  const left = cloneAsPolyline(target);
  const right = cloneAsPolyline(other);
  try {
    if (!left || !right) return null;
    return paperBoolean(left, right, op);
  } finally {
    left?.remove();
    right?.remove();
  }
}

export function tryUnite(a: paper.PathItem, b: paper.PathItem): paper.PathItem | null {
  if (!cheapOverlap(a, b)) return null;
  return tryBooleanOp(a, b, "unite");
}

/**
 * Unite without the overlap gate (symmetry copies that only meet on the axis).
 * Failed unites stay as siblings.
 */
export function forceUniteFamily(items: paper.PathItem[]): paper.PathItem[] {
  const live = items.filter((it) => it && !it.isEmpty());
  if (live.length <= 1) return live;

  let acc = live[0]!;
  const leftovers: paper.PathItem[] = [];
  for (let i = 1; i < live.length; i++) {
    const next = live[i]!;
    const united = tryBooleanOp(acc, next, "unite");
    if (united) {
      acc.remove();
      next.remove();
      acc = united;
    } else {
      leftovers.push(next);
    }
  }
  return [acc, ...leftovers].filter(isUsableFill);
}

export function trySubtract(
  target: paper.PathItem,
  cutter: paper.PathItem,
): paper.PathItem | null {
  if (!cheapOverlap(target, cutter)) return null;
  return tryBooleanOp(target, cutter, "subtract");
}

export function tryIntersect(
  target: paper.PathItem,
  clip: paper.PathItem,
): paper.PathItem | null {
  if (!pathsCollide(target, clip)) return null;
  const intersected = tryBooleanOp(target, clip, "intersect");
  if (intersected) return intersected;

  if (strictlyCovered(clip, target)) {
    return target.clone({ insert: false }) as paper.PathItem;
  }
  if (strictlyCovered(target, clip)) {
    return clip.clone({ insert: false }) as paper.PathItem;
  }
  return null;
}
