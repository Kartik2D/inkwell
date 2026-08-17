import paper from "paper";

/**
 * Sample a handful of points likely inside the path to make robust containment checks.
 */
export function samplePoints(path: paper.Path): paper.Point[] {
  const pts: paper.Point[] = [];

  // Best case: use a guaranteed interior point if Paper provides it.
  try {
    const ip = (path as any).getInteriorPoint?.();
    if (ip) pts.push(ip);
  } catch {}

  // Try to find interior points by offsetting along normals from the boundary.
  const len = path.length;
  // Adaptive eps based on contour size (avoid stepping outside on tiny loops).
  const minDim = Math.min(path.bounds.width, path.bounds.height);
  const epsBase = Math.max(0.05, minDim * 0.05);
  const epsList = [epsBase, epsBase * 0.5, epsBase * 2];
  if (len > 0) {
    const samples = [0.1, 0.3, 0.5, 0.7, 0.9];
    for (const t of samples) {
      const off = len * t;
      const p = path.getPointAt(off);
      if (!p) continue;
      let n: paper.Point | null = null;
      try {
        n = path.getNormalAt(off) as any;
      } catch {
        n = null;
      }
      if (n) {
        for (const eps of epsList) {
          const c1 = p.add(n.multiply(eps));
          const c2 = p.subtract(n.multiply(eps));
          try {
            if (path.contains(c1)) pts.push(c1);
          } catch {}
          try {
            if (path.contains(c2)) pts.push(c2);
          } catch {}
        }
      }
    }
  }

  // Fallbacks (may be empty on donut-like shapes, but better than nothing)
  pts.push(path.bounds.center);
  if (path.segments.length) pts.push(path.segments[0].point);

  return pts.slice(0, 25);
}

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

/**
 * Sample points for any PathItem (Path or CompoundPath) for robust containment checks.
 */
export function samplePointsItem(item: paper.PathItem): paper.Point[] {
  if (item instanceof paper.Path) return samplePoints(item);
  if (item instanceof paper.CompoundPath) {
    const pts: paper.Point[] = [item.bounds.center];
    for (const child of item.children) {
      if (child instanceof paper.Path) pts.push(...samplePoints(child));
      if (pts.length > 20) break;
    }
    return pts;
  }
  return [item.bounds.center];
}

const AREA_EPS = 1e-4;
const BOOLEAN_INSERT = { insert: false as const };

function pathAbsArea(item: paper.PathItem): number {
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

function isUsableFill(item: paper.PathItem | null | undefined): item is paper.PathItem {
  if (!item || item.isEmpty()) return false;
  if (!hasClosedFill(item)) return false;
  return pathAbsArea(item) > AREA_EPS;
}

/**
 * True only when the cutter's AABB contains the target and every target vertex
 * is inside the cutter. Used as the sole delete-on-failed-subtract check.
 */
export function strictlyCovered(cutter: paper.PathItem, target: paper.PathItem): boolean {
  try {
    if (!cutter.bounds.contains(target.bounds)) return false;
  } catch {
    return false;
  }
  if (pathAbsArea(target) <= 0) return false;

  let anyVertex = false;
  const allInside = eachTargetPath(target, (path) => {
    for (const seg of path.segments) {
      anyVertex = true;
      try {
        if (!cutter.contains(seg.point)) return false;
      } catch {
        return false;
      }
    }
    return true;
  });
  return allInside && anyVertex;
}

export function forceEvenOdd(item: paper.PathItem | null): void {
  if (item instanceof paper.CompoundPath) item.fillRule = "evenodd";
}

/**
 * Normalize boolean-op results for even-odd fills. Returns the live item
 * (resolveCrossings may replace the input).
 */
export function normalizeBooleanResult<T extends paper.PathItem | null>(
  result: T,
): T {
  if (!result) return result;
  let item: paper.PathItem = result;
  try {
    const resolved = (
      item as paper.PathItem & { resolveCrossings?: () => paper.PathItem }
    ).resolveCrossings?.();
    if (resolved instanceof paper.Item) item = resolved as paper.PathItem;
  } catch {}
  try {
    (
      item as paper.PathItem & { reorient?: (nonZero?: boolean) => paper.PathItem }
    ).reorient?.(false);
  } catch {}
  forceEvenOdd(item);
  return item as T;
}

/**
 * After vertex edits (simplify/smooth): kill self-crossings and clip holes
 * so they cannot extend outside their containing outer path.
 */
export function sanitizePathItemTopology(item: paper.PathItem): void {
  if (!item.parent) return;

  if (item instanceof paper.Path) {
    normalizeBooleanResult(item);
    return;
  }

  if (!(item instanceof paper.CompoundPath)) return;

  const children = item.children.filter(
    (child): child is paper.Path => child instanceof paper.Path,
  );
  for (const child of children) {
    normalizeBooleanResult(child);
  }

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
    normalizeBooleanResult(hole);
    clipped.remove();
  }

  forceEvenOdd(item);
  normalizeBooleanResult(item);
}

function holeFullyInside(hole: paper.Path, outer: paper.Path): boolean {
  try {
    if (hole.intersects(outer)) return false;
  } catch {
    return false;
  }
  for (const seg of hole.segments) {
    try {
      if (!outer.contains(seg.point)) return false;
    } catch {
      return false;
    }
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

export function flattenForBoolean(item: paper.PathItem, flatness: number): paper.PathItem {
  const clone = item.clone({ insert: false }) as paper.PathItem;
  if (clone instanceof paper.Path) {
    clone.flatten(flatness);
  } else if (clone instanceof paper.CompoundPath) {
    for (const child of clone.children) {
      if (child instanceof paper.Path) child.flatten(flatness);
    }
  }
  return clone;
}

/**
 * Check if two shapes genuinely overlap.
 */
export function pathsCollide(a: paper.PathItem, b: paper.PathItem): boolean {
  if (!a.bounds.intersects(b.bounds)) return false;
  try {
    if (a.intersects(b)) return true;
  } catch {}
  try {
    if (a.contains(b.bounds.center)) return true;
  } catch {}
  try {
    if (b.contains(a.bounds.center)) return true;
  } catch {}
  for (const p of samplePointsItem(a)) {
    try {
      if (b.contains(p)) return true;
    } catch {}
  }
  for (const p of samplePointsItem(b)) {
    try {
      if (a.contains(p)) return true;
    } catch {}
  }
  return false;
}

export function tryBooleanOp(
  target: paper.PathItem,
  other: paper.PathItem,
  op: "unite" | "subtract" | "intersect",
): paper.PathItem | null {
  const minUniteArea =
    op === "unite" ? Math.max(pathAbsArea(target), pathAbsArea(other)) : 0;

  const accept = (result: paper.PathItem | null): paper.PathItem | null => {
    if (!isUsableFill(result)) {
      result?.remove();
      return null;
    }
    if (op === "unite" && pathAbsArea(result) + AREA_EPS < minUniteArea) {
      result.remove();
      return null;
    }
    forceEvenOdd(result);
    return result;
  };

  const run = (
    left: paper.PathItem,
    right: paper.PathItem,
  ): paper.PathItem | null => {
    try {
      const raw = (left[op] as (
        path: paper.PathItem,
        options?: { insert?: boolean },
      ) => paper.PathItem | null)(right, BOOLEAN_INSERT);
      const result = normalizeBooleanResult(raw);
      if (raw && result && raw !== result) raw.remove();
      return accept(result);
    } catch {
      return null;
    }
  };

  const direct = run(target, other);
  if (direct) return direct;

  for (const flatness of [1, 0.5]) {
    const flatTarget = flattenForBoolean(target, flatness);
    const flatOther = flattenForBoolean(other, flatness);
    const flattened = run(flatTarget, flatOther);
    flatTarget.remove();
    flatOther.remove();
    if (flattened) return flattened;
  }

  return null;
}

export function tryUnite(a: paper.PathItem, b: paper.PathItem): paper.PathItem | null {
  if (!pathsCollide(a, b)) return null;
  return tryBooleanOp(a, b, "unite");
}

/**
 * Successively unite a family of items without the collide gate (used to weld
 * symmetry mirror copies that meet on the axis but may not register overlap).
 * Consumed inputs are removed when replaced by a unite result; pieces that
 * fail to unite are kept as siblings.
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
  const out: paper.PathItem[] = [];
  if (isUsableFill(acc)) out.push(acc);
  for (const left of leftovers) {
    if (isUsableFill(left)) out.push(left);
  }
  return out;
}

export function trySubtract(
  target: paper.PathItem,
  cutter: paper.PathItem,
): paper.PathItem | null {
  if (!pathsCollide(target, cutter)) return null;
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
    const clone = target.clone({ insert: false }) as paper.PathItem;
    return normalizeBooleanResult(clone);
  }
  if (strictlyCovered(target, clip)) {
    const clone = clip.clone({ insert: false }) as paper.PathItem;
    return normalizeBooleanResult(clone);
  }
  return null;
}
