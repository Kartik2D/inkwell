import paper from "paper";
import { getContainmentPoint, swallows, trySubtract, tryUnite } from "./path-geometry";
import { flattenGroups } from "./svg-io";
import type { MergePassResult } from "./types";

export type MergeAdopt = {
  compatible?(a: paper.PathItem, b: paper.PathItem): boolean;
  paint(from: paper.PathItem, to: paper.PathItem): void;
  stamp?(from: paper.PathItem[], to: paper.PathItem): void;
};

function pathsOnLayer(layer: paper.Layer): paper.PathItem[] {
  return layer.children.filter(
    (c): c is paper.PathItem =>
      c instanceof paper.Path || c instanceof paper.CompoundPath,
  );
}

function emfFrame(item: paper.Item): number | null {
  const frame = (item.data as { emfKeyframeFrame?: unknown } | null)?.emfKeyframeFrame;
  return typeof frame === "number" && Number.isFinite(frame) ? frame : null;
}

function copyEmf(source: paper.Item, target: paper.Item): void {
  const frame = emfFrame(source);
  if (frame === null) return;
  const data = (target.data as Record<string, unknown> | null) ?? {};
  data.emfKeyframeFrame = frame;
  target.data = data;
}

function copyFill(source: paper.PathItem, target: paper.PathItem): void {
  target.fillColor = source.fillColor ? source.fillColor.clone() : null;
  target.strokeColor = null;
  target.strokeWidth = 0;
  copyEmf(source, target);
}

function fillKey(item: paper.PathItem): string {
  return item.fillColor?.toCSS(true) ?? "none";
}

function sameEmf(a: paper.PathItem, b: paper.PathItem): boolean {
  return emfFrame(a) === emfFrame(b);
}

function orderedNeighbors(
  layer: paper.Layer,
  seeds: paper.PathItem[],
  padding = 2,
): paper.PathItem[] {
  if (seeds.length === 0) return [];
  const seedIds = new Set(seeds.map((s) => s.id));
  const hits = new Map<number, paper.PathItem>();
  const order = new Map<number, number>();
  for (let i = 0; i < layer.children.length; i++) {
    const child = layer.children[i];
    if (child instanceof paper.Path || child instanceof paper.CompoundPath) {
      order.set(child.id, i);
    }
  }
  for (const seed of seeds) {
    const expanded = seed.bounds.expand(padding * 2);
    for (const item of pathsOnLayer(layer)) {
      if (!item.parent || seedIds.has(item.id)) continue;
      if (!expanded.intersects(item.bounds)) continue;
      hits.set(item.id, item);
    }
  }
  return [...hits.values()].sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
}

function neighborsByColor(
  layer: paper.Layer,
  current: paper.PathItem,
  consumed: Set<number>,
  compatible: (a: paper.PathItem, b: paper.PathItem) => boolean,
): { same: paper.PathItem[]; other: paper.PathItem[] } {
  const color = fillKey(current);
  const same: paper.PathItem[] = [];
  const other: paper.PathItem[] = [];
  for (const neighbor of orderedNeighbors(layer, [current])) {
    if (!neighbor.parent || neighbor === current || consumed.has(neighbor.id)) continue;
    if (!compatible(current, neighbor)) continue;
    if (fillKey(neighbor) === color) same.push(neighbor);
    else other.push(neighbor);
  }
  return { same, other };
}

function foldUnites(
  layer: paper.Layer,
  current: paper.PathItem,
  neighbors: paper.PathItem[],
  consumed: Set<number>,
  changed: paper.PathItem[],
  adopt: MergeAdopt,
): { current: paper.PathItem; unitedAny: boolean } {
  let unitedAny = false;
  for (const neighbor of neighbors) {
    if (!current.parent || !neighbor.parent || consumed.has(neighbor.id)) continue;
    const united = tryUnite(current, neighbor);
    if (!united) continue;
    adopt.paint(current, united);
    adopt.stamp?.([current, neighbor], united);
    consumed.add(neighbor.id);
    current.remove();
    neighbor.remove();
    if (!united.parent) layer.addChild(united);
    changed.push(united);
    current = united;
    unitedAny = true;
  }
  return { current, unitedAny };
}

function splitDisconnectedCompounds(items: paper.CompoundPath[]): void {
  for (const item of items) {
    const layer = item.layer;
    if (!layer || !item.parent) continue;
    if (item.children.length <= 1) continue;

    const fillColor = item.fillColor;
    const frame = emfFrame(item);
    const subs = item.children as paper.Path[];
    const n = subs.length;
    const subData = subs.map((s) => s.pathData);
    const parents: Array<number | null> = new Array(n).fill(null);
    const absArea = subs.map((p) => {
      try {
        return Math.abs(p.area);
      } catch {
        return Math.abs(p.bounds.area);
      }
    });
    const interiorPoints = subs.map((p) => getContainmentPoint(p));

    for (let i = 0; i < n; i++) {
      let bestParent: number | null = null;
      let bestArea = Infinity;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const candidate = subs[j];
        if (!candidate.bounds.contains(subs[i].bounds)) continue;
        const interiorPoint = interiorPoints[i];
        if (!interiorPoint) continue;
        try {
          if (!candidate.contains(interiorPoint)) continue;
        } catch {
          continue;
        }
        const a = absArea[j];
        if (a < bestArea) {
          bestArea = a;
          bestParent = j;
        }
      }
      parents[i] = bestParent;
    }

    const depth = new Array(n).fill(0);
    const computeDepth = (i: number): number => {
      const p = parents[i];
      if (p == null) return 0;
      const d = computeDepth(p) + 1;
      depth[i] = d;
      return d;
    };
    for (let i = 0; i < n; i++) computeDepth(i);

    const nearestEven = (i: number): number => {
      if (depth[i] % 2 === 0) return i;
      const p = parents[i];
      return p == null ? i : nearestEven(p);
    };

    const groups = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const root = nearestEven(i);
      if (!groups.has(root)) groups.set(root, []);
      if (i === root || depth[i] % 2 === 1) groups.get(root)!.push(i);
    }

    const filledRoots = [...groups.keys()].filter((k) => depth[k] % 2 === 0);
    if (filledRoots.length <= 1) continue;

    const idx = layer.children.indexOf(item);
    let insertAt = idx;
    for (const root of filledRoots) {
      const indices = groups.get(root) ?? [root];
      if (indices.length === 1) {
        const src = subs[root];
        const newPath = new paper.Path(subData[root]);
        copyFill(item, newPath);
        if (frame !== null) copyEmf(item, newPath);
        newPath.fillColor = fillColor ? fillColor.clone() : null;
        newPath.closed = src.closed;
        layer.insertChild(insertAt++, newPath);
      } else {
        const newCompound = new paper.CompoundPath([]);
        copyFill(item, newCompound);
        newCompound.fillColor = fillColor ? fillColor.clone() : null;
        newCompound.fillRule = "evenodd";
        for (const ci of indices) {
          const src = subs[ci];
          const child = new paper.Path(subData[ci]);
          child.closed = src.closed;
          newCompound.addChild(child);
        }
        layer.insertChild(insertAt++, newCompound);
      }
    }
    item.remove();
  }
}

/** Cut other-color with the new stroke, then same-color unite. */
export function mergeAdditionsIntoLayer(
  layer: paper.Layer,
  additions: paper.PathItem[],
  adopt: MergeAdopt = { paint: copyFill, compatible: sameEmf },
): MergePassResult {
  const compatible = adopt.compatible ?? sameEmf;
  const changedItems: paper.PathItem[] = [];
  const survivors: paper.PathItem[] = [];

  for (const addition of additions) {
    if (!addition.parent) continue;
    let current = addition;
    const consumed = new Set<number>();
    const { same, other } = neighborsByColor(layer, current, consumed, compatible);

    for (const neighbor of other) {
      if (!current.parent || !neighbor.parent) continue;
      if (swallows(current, neighbor)) continue;
      const cut = trySubtract(neighbor, current);
      if (!cut) continue;
      adopt.paint(neighbor, cut);
      adopt.stamp?.([neighbor], cut);
      neighbor.replaceWith(cut);
      changedItems.push(cut);
    }

    let fold = foldUnites(layer, current, same, consumed, changedItems, adopt);
    current = fold.current;
    if (fold.unitedAny && current.parent) {
      fold = foldUnites(
        layer,
        current,
        neighborsByColor(layer, current, consumed, compatible).same,
        consumed,
        changedItems,
        adopt,
      );
      current = fold.current;
    }
    if (current.parent) survivors.push(current);
  }

  return { survivors, changedItems };
}

function appendLayerJson(target: paper.Layer, json: string): void {
  if (!json) return;
  const temp = new paper.Layer();
  temp.importJSON(json);
  for (const child of [...temp.children]) target.addChild(child);
  temp.remove();
}

/** Import base + additions JSON, merge, export. Activates a scratch layer. */
export function mergeJsons(baseJson: string, additionsJson: string): string {
  if (!additionsJson) return baseJson;
  if (!baseJson) return additionsJson;

  const previousActive = paper.project.activeLayer;
  const scratch = new paper.Layer();
  scratch.removeChildren();
  appendLayerJson(scratch, baseJson);
  scratch.activate();
  flattenGroups();
  const belowIds = new Set(pathsOnLayer(scratch).map((p) => p.id));
  appendLayerJson(scratch, additionsJson);
  flattenGroups();
  const additions = pathsOnLayer(scratch).filter((p) => !belowIds.has(p.id));
  if (additions.length > 0) {
    const merged = mergeAdditionsIntoLayer(scratch, additions);
    const compounds = [...merged.changedItems, ...merged.survivors].filter(
      (it): it is paper.CompoundPath =>
        it instanceof paper.CompoundPath && it.parent != null,
    );
    if (compounds.length) splitDisconnectedCompounds(compounds);
  }
  flattenGroups();
  const out =
    scratch.children.length === 0 ? "" : ((scratch.exportJSON() as string) ?? "");
  scratch.remove();
  previousActive?.activate();
  return out;
}

export function exportItemsJson(items: paper.PathItem[]): string {
  if (items.length === 0) return "";
  const previousActive = paper.project.activeLayer;
  const scratch = new paper.Layer();
  for (const item of items) {
    scratch.addChild(item.clone({ insert: false }) as paper.PathItem);
  }
  const json = (scratch.exportJSON() as string) ?? "";
  scratch.remove();
  previousActive?.activate();
  return json;
}
