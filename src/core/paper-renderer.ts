/**
 * Paper Renderer - Vector Path Rendering
 *
 * Layer model:
 * - Flat list of non-overlapping paths (no groups)
 * - CompoundPaths only for shapes with holes
 * - Same color overlap → union
 * - Different color overlap → top cuts bottom
 *
 * Camera support:
 * - Applies camera transformations to Paper.js view
 * - Converts screen coordinates to world coordinates for path placement
 * - Provides methods for camera-aware hit testing
 */
import paper from "paper";
import RBush from "rbush";
import type { CanvasConfig } from "./types";
import type { Camera } from "./camera";

interface SpatialIndexEntry {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: number;
}

export class PaperRenderer {
  private config: CanvasConfig;
  private camera: Camera | null = null;

  // Spatial index of current layer pieces (Path + CompoundPath)
  private spatialIndex = new RBush<SpatialIndexEntry>();
  private indexEntries = new Map<number, SpatialIndexEntry>();
  private indexItems = new Map<number, paper.PathItem>();
  private indexDirty = true;

  constructor(_canvas: HTMLCanvasElement, config: CanvasConfig) {
    this.config = config;
  }

  updateConfig(config: CanvasConfig) {
    this.config = config;
  }

  private makeIndexEntry(item: paper.PathItem): SpatialIndexEntry {
    const b = item.bounds;
    return {
      minX: b.x,
      minY: b.y,
      maxX: b.x + b.width,
      maxY: b.y + b.height,
      id: item.id,
    };
  }

  private rebuildSpatialIndex(): void {
    this.spatialIndex.clear();
    this.indexEntries.clear();
    this.indexItems.clear();

    const items = this.getAllPaths();
    const entries: SpatialIndexEntry[] = [];
    for (const it of items) {
      const e = this.makeIndexEntry(it);
      entries.push(e);
      this.indexEntries.set(it.id, e);
      this.indexItems.set(it.id, it);
    }
    if (entries.length) this.spatialIndex.load(entries);
    this.indexDirty = false;
  }

  private ensureSpatialIndex(): void {
    if (this.indexDirty) this.rebuildSpatialIndex();
  }

  private indexRemove(item: paper.PathItem): void {
    const e = this.indexEntries.get(item.id);
    if (e) {
      this.spatialIndex.remove(e);
      this.indexEntries.delete(item.id);
      this.indexItems.delete(item.id);
    }
  }

  private indexInsert(item: paper.PathItem): void {
    const e = this.makeIndexEntry(item);
    this.spatialIndex.insert(e);
    this.indexEntries.set(item.id, e);
    this.indexItems.set(item.id, item);
  }

  private indexUpsert(item: paper.PathItem): void {
    if (this.indexEntries.has(item.id)) this.indexRemove(item);
    this.indexInsert(item);
  }

  private queryByBounds(
    bounds: paper.Rectangle,
    padding: number = 0,
  ): paper.PathItem[] {
    this.ensureSpatialIndex();
    const b = bounds.expand(padding * 2); // expand expects total delta
    const hits = this.spatialIndex.search({
      minX: b.x,
      minY: b.y,
      maxX: b.x + b.width,
      maxY: b.y + b.height,
      id: -1,
    });
    const out: paper.PathItem[] = [];
    for (const h of hits) {
      const it = this.indexItems.get(h.id);
      if (it?.parent) out.push(it);
    }
    return out;
  }

  private splitDisconnectedItems(items: paper.CompoundPath[]): void {
    const layer = paper.project.activeLayer;

    for (const item of items) {
      if (!item.parent) continue;
      if (item.children.length <= 1) continue;

      const fillColor = item.fillColor;
      const subs = item.children as paper.Path[];
      const n = subs.length;

      // Capture path data before modifying
      const subData = subs.map((s) => s.pathData);

      // Build containment parent tree (smallest containing path becomes parent)
      const parents: Array<number | null> = new Array(n).fill(null);
      const absArea = subs.map((p) => {
        try {
          return Math.abs(p.area);
        } catch {
          return Math.abs(p.bounds.area);
        }
      });

      // Cache sample points per child once (contains() is expensive)
      const samples = subs.map((p) => this.samplePoints(p));

      for (let i = 0; i < n; i++) {
        let bestParent: number | null = null;
        let bestArea = Infinity;

        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const candidate = subs[j];

          // Quick reject by bounds
          if (!candidate.bounds.contains(subs[i].bounds)) continue;

          // Robust contains check using interior samples of the child
          if (!this.containsAny(candidate, samples[i])) continue;

          const a = absArea[j];
          if (a < bestArea) {
            bestArea = a;
            bestParent = j;
          }
        }

        parents[i] = bestParent;
      }

      // Compute depths
      const depth = new Array(n).fill(0);
      const computeDepth = (i: number): number => {
        const p = parents[i];
        if (p == null) return 0;
        const d = computeDepth(p) + 1;
        depth[i] = d;
        return d;
      };
      for (let i = 0; i < n; i++) computeDepth(i);

      // Group contours by nearest even-depth ancestor (evenodd fill parity)
      const nearestEven = (i: number): number => {
        if (depth[i] % 2 === 0) return i;
        const p = parents[i];
        return p == null ? i : nearestEven(p);
      };

      const groups = new Map<number, number[]>();
      for (let i = 0; i < n; i++) {
        const root = nearestEven(i);
        if (!groups.has(root)) groups.set(root, []);
        // Root itself and odd-depth descendants belong to this piece.
        // Even-depth descendants start their own piece.
        if (i === root || depth[i] % 2 === 1) groups.get(root)!.push(i);
      }

      const filledRoots = [...groups.keys()].filter((k) => depth[k] % 2 === 0);
      if (filledRoots.length <= 1) continue;

      // Replace original compound with one item per filled region, attaching its holes.
      const idx = layer.children.indexOf(item);
      let insertAt = idx;

      // Update index: remove old compound
      this.indexRemove(item);

      for (const root of filledRoots) {
        const indices = groups.get(root) ?? [root];
        if (indices.length === 1) {
          const src = subs[root];
          const newPath = new paper.Path(subData[root]);
          newPath.fillColor = fillColor;
          newPath.closed = src.closed;
          this.normalizeBooleanResult(newPath);
          layer.insertChild(insertAt++, newPath);
          this.indexInsert(newPath);
        } else {
          const newCompound = new paper.CompoundPath();
          newCompound.fillColor = fillColor;
          // Even-odd is robust to winding issues and preserves holes / islands correctly
          newCompound.fillRule = "evenodd";
          for (const ci of indices) {
            const src = subs[ci];
            const child = new paper.Path(subData[ci]);
            child.closed = src.closed;
            this.normalizeBooleanResult(child);
            newCompound.addChild(child);
          }
          this.normalizeBooleanResult(newCompound);
          layer.insertChild(insertAt++, newCompound);
          this.indexInsert(newCompound);
        }
      }

      item.remove();
    }
  }

  private normalizeAfterLocalEdit(changedItems: paper.PathItem[]): void {
    // Local edits never introduce groups; keep layer flat and split only changed compounds.
    const compounds = changedItems.filter(
      (it): it is paper.CompoundPath =>
        it instanceof paper.CompoundPath && it.parent != null,
    );
    if (compounds.length) this.splitDisconnectedItems(compounds);
  }

  /**
   * Set the camera for view transformations
   */
  setCamera(camera: Camera) {
    this.camera = camera;
  }

  /**
   * Apply camera transformation to Paper.js view
   */
  applyCamera(): void {
    if (!this.camera) return;

    // Get the world-to-screen transformation matrix from camera
    const [a, b, c, d, tx, ty] = this.camera.getTransformMatrix();

    // Reset and apply the matrix to Paper.js view
    paper.view.matrix.set(a, b, c, d, tx, ty);

    paper.view.update();
  }

  /**
   * Convert screen coordinates to world coordinates using camera
   */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    if (!this.camera) {
      return { x: screenX, y: screenY };
    }
    return this.camera.screenToWorld(screenX, screenY);
  }

  /**
   * Convert world coordinates to screen coordinates using camera
   */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    if (!this.camera) {
      return { x: worldX, y: worldY };
    }
    return this.camera.worldToScreen(worldX, worldY);
  }

  /**
   * Import and scale SVG, returning extracted paths (ungrouped)
   * When camera is active, positions paths in world space
   *
   * The SVG from potrace represents what was drawn on the pixel canvas,
   * which maps to the full viewport (screen space). We need to:
   * 1. Scale SVG to viewport size
   * 2. Transform the result so screen coordinates become world coordinates
   */
  private importSVG(svg: string): paper.PathItem[] {
    const item = paper.project.importSVG(svg) as paper.Item;
    if (!item) return [];

    // Get SVG dimensions
    const svgMatch = svg.match(/width="([^"]+)"\s+height="([^"]+)"/);
    let svgWidth = this.config.pixelWidth;
    let svgHeight = this.config.pixelHeight;

    if (svgMatch) {
      svgWidth = parseFloat(svgMatch[1]);
      svgHeight = parseFloat(svgMatch[2]);
    }

    // Scale SVG to viewport size
    // After this, the SVG content maps to screen coordinates (0,0 to viewportWidth,viewportHeight)
    if (svgWidth > 0 && svgHeight > 0) {
      const scale = Math.min(
        this.config.viewportWidth / svgWidth,
        this.config.viewportHeight / svgHeight,
      );
      item.scale(scale, new paper.Point(0, 0));
    }

    // Position at origin (top-left of viewport in screen space)
    item.bounds.topLeft = new paper.Point(0, 0);

    // Transform from screen space to world space
    if (this.camera) {
      // Get the inverse transform matrix (screen to world) from camera
      // This handles zoom, rotation, and pan correctly
      const [a, b, c, d, tx, ty] = this.camera.getInverseTransformMatrix();

      const screenToWorldMatrix = new paper.Matrix(a, b, c, d, tx, ty);

      item.transform(screenToWorldMatrix);
    } else {
      // No camera - position at view center (legacy behavior)
      item.position = paper.view.center;
    }

    // Extract paths and remove the import wrapper
    const paths = this.extractPaths(item);
    if (item instanceof paper.Group) item.remove();
    return paths;
  }

  /**
   * Extract all paths from an item (handles Groups recursively)
   */
  private extractPaths(item: paper.Item): paper.PathItem[] {
    if (item instanceof paper.Path || item instanceof paper.CompoundPath) {
      return [item];
    }
    if (item instanceof paper.Group) {
      const paths: paper.PathItem[] = [];
      for (const child of item.children) {
        paths.push(...this.extractPaths(child));
      }
      return paths;
    }
    return [];
  }

  /**
   * Flatten layer: ungroup all groups, move paths to layer root
   */
  private flattenGroups(): void {
    const layer = paper.project.activeLayer;
    let hasGroups = true;
    while (hasGroups) {
      hasGroups = false;
      for (const child of [...layer.children]) {
        if (child instanceof paper.Group) {
          hasGroups = true;
          for (const gc of [...child.children]) {
            layer.insertChild(layer.children.indexOf(child), gc);
          }
          child.remove();
        }
      }
    }
  }

  /**
   * Split disconnected CompoundPaths into separate items
   */
  private splitDisconnected(): void {
    const layer = paper.project.activeLayer;
    const compounds = [...layer.children].filter(
      (c): c is paper.CompoundPath => c instanceof paper.CompoundPath,
    );
    this.splitDisconnectedItems(compounds);
  }

  /**
   * Check if two sub-paths are connected (for hole detection)
   * Takes all sub-paths to check for intermediary containment
   */
  private subPathsConnected(
    a: paper.Path,
    b: paper.Path,
    allSubs: paper.Path[],
  ): boolean {
    const ba = a.bounds,
      bb = b.bounds;

    // No bounds overlap = not connected
    if (!ba.intersects(bb) && !ba.contains(bb) && !bb.contains(ba)) {
      return false;
    }

    // Edges intersect = directly connected
    try {
      if (a.intersects(b)) return true;
    } catch {}

    // For containment, check if they're "directly" nested (no intermediate path between them)
    // A contains B directly if: A contains some interior point of B AND
    // there is no other path C with A.contains(C) and C.contains(B).
    try {
      const bSamples = this.samplePoints(b);
      const aSamples = this.samplePoints(a);

      const aContainsB = this.containsAny(a, bSamples);
      const bContainsA = this.containsAny(b, aSamples);

      if (aContainsB) {
        let hasIntermediary = false;
        for (const c of allSubs) {
          if (c === a || c === b) continue;
          const cSamples = this.samplePoints(c);
          try {
            if (this.containsAny(a, cSamples) && this.containsAny(c, bSamples)) {
              hasIntermediary = true;
              break;
            }
          } catch {}
        }
        if (!hasIntermediary) return true;
      }

      if (bContainsA) {
        let hasIntermediary = false;
        for (const c of allSubs) {
          if (c === a || c === b) continue;
          const cSamples = this.samplePoints(c);
          try {
            if (this.containsAny(b, cSamples) && this.containsAny(c, aSamples)) {
              hasIntermediary = true;
              break;
            }
          } catch {}
        }
        if (!hasIntermediary) return true;
      }
    } catch {}

    return false;
  }

  /**
   * Sample a handful of points likely inside the path to make robust containment checks.
   */
  private samplePoints(path: paper.Path): paper.Point[] {
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

  /**
   * Safe contains for a set of points.
   */
  private containsAny(path: paper.Path, points: paper.Point[]): boolean {
    for (const p of points) {
      try {
        if (path.contains(p)) return true;
      } catch {}
    }
    return false;
  }

  /**
   * Sample points for any PathItem (Path or CompoundPath) for robust containment checks.
   */
  private samplePointsItem(item: paper.PathItem): paper.Point[] {
    if (item instanceof paper.Path) return this.samplePoints(item);
    if (item instanceof paper.CompoundPath) {
      const pts: paper.Point[] = [item.bounds.center];
      for (const child of item.children) {
        if (child instanceof paper.Path) pts.push(...this.samplePoints(child));
        if (pts.length > 20) break;
      }
      return pts;
    }
    return [item.bounds.center];
  }

  /**
   * Determine whether a cutter very likely fully covers a target (used as a guard when Paper booleans return empty).
   */
  private likelyFullyCovered(cutter: paper.PathItem, target: paper.PathItem): boolean {
    // Cheap reject first
    try {
      if (!cutter.bounds.contains(target.bounds)) return false;
    } catch {
      return false;
    }

    const pts = this.samplePointsItem(target);
    for (const p of pts) {
      try {
        if (!cutter.contains(p)) return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  private forceEvenOdd(item: paper.PathItem | null): void {
    if (item instanceof paper.CompoundPath) item.fillRule = "evenodd";
  }

  /**
   * Check if two paths collide
   */
  private pathsCollide(a: paper.PathItem, b: paper.PathItem): boolean {
    if (!a.bounds.intersects(b.bounds)) return false;
    try {
      if (a.intersects(b)) return true;
    } catch {}
    try {
      if (a.contains(b.bounds.center) || b.contains(a.bounds.center)) return true;
    } catch {}
    // Conservative fallback: bounds intersect means "maybe collide"
    return true;
  }

  /**
   * Normalize layer after any operation
   */
  private normalizeLayer(): void {
    this.flattenGroups();
    this.splitDisconnected();
  }

  /**
   * Normalize boolean-op results to keep winding/holes intact.
   */
  private normalizeBooleanResult<T extends paper.PathItem | null>(
    result: T,
  ): T {
    if (!result) return result;
    try {
      // Resolve self-intersections for robust winding
      // @ts-expect-error resolveCrossings exists on Path/CompoundPath in paper.js
      if (typeof (result as any).resolveCrossings === "function") {
        (result as any).resolveCrossings();
      }
    } catch {}
    try {
      // Ensure proper winding for holes
      // @ts-expect-error reorient exists on Path/CompoundPath in paper.js
      if (typeof (result as any).reorient === "function") {
        (result as any).reorient(true);
      }
    } catch {}
    return result;
  }

  /**
   * Merge a path with existing paths using "add" logic:
   * - Same color: union
   * - Different color: new path cuts existing
   * Returns the resulting path (may be different from input if unioned)
   */
  private mergePathWithExisting(
    newPath: paper.PathItem,
    existing: paper.PathItem[],
    changedItems?: paper.PathItem[],
  ): paper.PathItem {
    const newColor = newPath.fillColor?.toCSS(true) ?? "none";
    let currentPath = newPath;

    for (const ex of existing) {
      if (!ex.parent || !this.pathsCollide(currentPath, ex)) continue;

      const exColor = ex.fillColor?.toCSS(true) ?? "none";

      if (exColor === newColor) {
        // Same color: union
        try {
          const united = currentPath.unite(ex);
          const cleaned = this.normalizeBooleanResult(united);
          if (cleaned && !cleaned.isEmpty()) {
            this.forceEvenOdd(cleaned);
            // Cleaned result replaces originals
            cleaned.fillColor = currentPath.fillColor;
            // Index updates: remove consumed pieces, insert result
            this.indexRemove(ex);
            if (currentPath.parent) this.indexRemove(currentPath);
            currentPath.remove();
            ex.remove();
            currentPath = cleaned;
            this.indexInsert(cleaned);
            changedItems?.push(cleaned);
          } else {
            united?.remove();
          }
        } catch {}
      } else {
        // Different color: new cuts existing
        try {
          const result = ex.subtract(currentPath);
          const cleaned = this.normalizeBooleanResult(result);
          if (cleaned && !cleaned.isEmpty()) {
            this.forceEvenOdd(cleaned);
            cleaned.fillColor = ex.fillColor;
            this.indexRemove(ex);
            ex.replaceWith(cleaned);
            this.indexInsert(cleaned);
            changedItems?.push(cleaned);
          } else {
            // Guard: Paper booleans can spuriously return empty due to degeneracy.
            // Only delete if the cutter very likely fully covers the target.
            const shouldRemove = this.likelyFullyCovered(currentPath, ex);
            if (shouldRemove) {
              this.indexRemove(ex);
              ex.remove();
            }
            result?.remove();
          }
        } catch {}
      }
    }

    return currentPath;
  }

  /**
   * Subtract a path from all existing paths (eraser mode)
   */
  private subtractPathFromExisting(
    eraserPath: paper.PathItem,
    existing: paper.PathItem[],
    changedItems?: paper.PathItem[],
  ): void {
    for (const ex of existing) {
      if (!ex.parent || !this.pathsCollide(eraserPath, ex)) continue;
      try {
        const result = ex.subtract(eraserPath);
        const cleaned = this.normalizeBooleanResult(result);
        if (cleaned && !cleaned.isEmpty()) {
          this.forceEvenOdd(cleaned);
          cleaned.fillColor = ex.fillColor;
          this.indexRemove(ex);
          ex.replaceWith(cleaned);
          this.indexInsert(cleaned);
          changedItems?.push(cleaned);
        } else {
          // Guard: only delete if the eraser very likely fully covers the target.
          const shouldRemove = this.likelyFullyCovered(eraserPath, ex);
          if (shouldRemove) {
            this.indexRemove(ex);
            ex.remove();
          }
          result?.remove();
        }
      } catch {}
    }
  }

  async addPath(svg: string, color: string = "#000000"): Promise<void> {
    const layer = paper.project.activeLayer;
    const paperColor = new paper.Color(color);

    // Build index from current layer pieces (exclude the soon-to-be-imported stroke)
    this.ensureSpatialIndex();

    // Import new paths
    const newPaths = this.importSVG(svg);
    if (newPaths.length === 0) return;

    // Apply color and move to layer root
    for (const p of newPaths) {
      p.fillColor = paperColor;
      layer.addChild(p);
      this.indexInsert(p);
    }

    // Query only nearby existing candidates via spatial index
    const newSet = new Set(newPaths);
    const existingSet = new Map<number, paper.PathItem>();
    const padding = 2;
    for (const np of newPaths) {
      for (const hit of this.queryByBounds(np.bounds, padding)) {
        if (newSet.has(hit)) continue;
        existingSet.set(hit.id, hit);
      }
    }
    const layerOrder = new Map<number, number>();
    for (let i = 0; i < layer.children.length; i++) {
      const c = layer.children[i];
      if (c instanceof paper.Path || c instanceof paper.CompoundPath) {
        layerOrder.set(c.id, i);
      }
    }
    const existing = [...existingSet.values()].sort(
      (a, b) => (layerOrder.get(a.id) ?? 0) - (layerOrder.get(b.id) ?? 0),
    );

    // Boolean operations using shared helper
    const changedItems: paper.PathItem[] = [];
    for (const newPath of newPaths) {
      this.mergePathWithExisting(newPath, existing, changedItems);
    }

    // Local canonicalization: split only what changed
    this.normalizeAfterLocalEdit([...changedItems, ...newPaths]);
    paper.view.update();
  }

  async subtractPath(svg: string): Promise<void> {
    const layer = paper.project.activeLayer;

    // Build index from current layer pieces (exclude the soon-to-be-imported eraser)
    this.ensureSpatialIndex();

    // Import eraser paths
    const eraserPaths = this.importSVG(svg);
    if (eraserPaths.length === 0) return;

    // Query only nearby existing candidates via spatial index
    const eraserSet = new Set(eraserPaths);
    const padding = 2;

    // Subtract from all existing using shared helper
    const changedItems: paper.PathItem[] = [];
    for (const eraser of eraserPaths) {
      const existing = this.queryByBounds(eraser.bounds, padding).filter(
        (it) => !eraserSet.has(it),
      );
      this.subtractPathFromExisting(eraser, existing, changedItems);
      eraser.remove();
    }

    // Local canonicalization: split only what changed
    this.normalizeAfterLocalEdit(changedItems);
    paper.view.update();
  }

  clear() {
    paper.project.clear();
    this.indexDirty = true;
    paper.view.update();
  }

  /**
   * Full flatten: merge same colors, cut overlaps
   */
  flatten() {
    const layer = paper.project.activeLayer;
    const getColor = (p: paper.PathItem) => p.fillColor?.toCSS(true) ?? "none";

    this.flattenGroups();

    const allPaths = [...layer.children].filter(
      (c): c is paper.PathItem =>
        c instanceof paper.Path || c instanceof paper.CompoundPath,
    );
    if (allPaths.length < 2) {
      paper.view.update();
      return;
    }

    // Group by color
    const colorGroups = new Map<string, paper.PathItem[]>();
    for (const p of allPaths) {
      const c = getColor(p);
      if (!colorGroups.has(c)) colorGroups.set(c, []);
      colorGroups.get(c)!.push(p);
    }

    // Union same-color paths
    const colorPaths = new Map<string, paper.PathItem>();
    for (const [color, paths] of colorGroups) {
      if (paths.length === 1) {
        colorPaths.set(color, paths[0]);
        continue;
      }
      let result = paths[0];
      for (let i = 1; i < paths.length; i++) {
        try {
          const united = result.unite(paths[i]);
          const cleaned = this.normalizeBooleanResult(united);
          if (cleaned && !cleaned.isEmpty()) {
            this.forceEvenOdd(cleaned);
            if (result !== paths[0]) result.remove();
            paths[i].remove();
            result = cleaned;
          } else {
            united?.remove();
          }
        } catch {}
      }
      result.fillColor = paths[0].fillColor;
      colorPaths.set(color, result);
      for (const p of paths) if (p.parent && p !== result) p.remove();
    }

    // Spatial index for overlap detection
    interface SI {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      color: string;
    }
    const index = new RBush<SI>();
    index.load(
      Array.from(colorPaths.entries()).map(([color, p]) => {
        const b = p.bounds;
        return {
          minX: b.x,
          minY: b.y,
          maxX: b.x + b.width,
          maxY: b.y + b.height,
          color,
        };
      }),
    );

    // Z-order by first occurrence
    const zOrder = [...new Set(allPaths.map(getColor))];
    const zIndex = new Map<string, number>();
    for (let i = 0; i < zOrder.length; i++) zIndex.set(zOrder[i], i);

    // Top cuts bottom
    for (let ti = zOrder.length - 1; ti >= 0; ti--) {
      const topPath = colorPaths.get(zOrder[ti]);
      if (!topPath?.parent) continue;

      const b = topPath.bounds;
      for (const c of index.search({
        minX: b.x,
        minY: b.y,
        maxX: b.x + b.width,
        maxY: b.y + b.height,
      })) {
        const bi = zIndex.get(c.color) ?? -1;
        if (bi >= ti) continue;

        const botPath = colorPaths.get(c.color);
        if (!botPath?.parent) continue;

        try {
          const result = botPath.subtract(topPath);
          const cleaned = this.normalizeBooleanResult(result);
          if (cleaned && !cleaned.isEmpty()) {
            this.forceEvenOdd(cleaned);
            cleaned.fillColor = botPath.fillColor;
            botPath.replaceWith(cleaned);
            colorPaths.set(c.color, cleaned);
          } else {
            // Guard: only delete if the top very likely fully covers the bottom.
            const shouldRemove = this.likelyFullyCovered(topPath, botPath);
            if (shouldRemove) {
              botPath.remove();
              colorPaths.delete(c.color);
            }
            result?.remove();
          }
        } catch {}
      }
    }

    this.splitDisconnected();
    this.rebuildSpatialIndex();
    paper.view.update();
  }

  /**
   * Hit test at a screen position, converting to world coordinates if camera is active
   */
  hitTest(point: { x: number; y: number }): paper.Item | null {
    // Convert screen to world coordinates for hit testing
    const worldPoint = this.screenToWorld(point.x, point.y);
    const result = paper.project.hitTest(
      new paper.Point(worldPoint.x, worldPoint.y),
      {
        fill: true,
        stroke: true,
        tolerance: 5 / (this.camera?.zoom ?? 1), // Adjust tolerance for zoom level
      },
    );
    return result?.item ?? null;
  }

  getAllPaths(): paper.PathItem[] {
    return paper.project.activeLayer.children.filter(
      (c): c is paper.PathItem =>
        c instanceof paper.Path || c instanceof paper.CompoundPath,
    );
  }

  /**
   * Get the bounding box of all content in world space
   */
  getContentBounds(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null {
    const paths = this.getAllPaths();
    if (paths.length === 0) return null;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const path of paths) {
      const b = path.bounds;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  movePath(item: paper.Item, delta: { x: number; y: number }) {
    // Delta is already in world coordinates (converted by App)
    item.position = item.position.add(new paper.Point(delta.x, delta.y));
    // Keep spatial index in sync for interactive dragging
    if (item instanceof paper.Path || item instanceof paper.CompoundPath) {
      // If index is dirty, we'll rebuild it later (avoid rebuilding during drag)
      if (!this.indexDirty && this.indexEntries.has(item.id)) {
        this.indexUpsert(item);
      }
    }
    paper.view.update();
  }

  /**
   * Bring an item to the top of the layer (z-order)
   */
  bringToFront(item: paper.Item) {
    item.bringToFront();
    paper.view.update();
  }

  /**
   * Place a selected item using "add" logic - union with same color, cut different colors
   */
  placeSelection(item: paper.PathItem): void {
    const layer = paper.project.activeLayer;

    // Ensure spatial index exists and the moved item has up-to-date bounds
    this.ensureSpatialIndex();
    if (!this.indexDirty) this.indexUpsert(item);

    // Query only nearby candidates (item is on top due to bringToFront)
    const padding = 2;
    const existingSet = new Map<number, paper.PathItem>();
    for (const hit of this.queryByBounds(item.bounds, padding)) {
      if (hit === item) continue;
      existingSet.set(hit.id, hit);
    }
    const layerOrder = new Map<number, number>();
    for (let i = 0; i < layer.children.length; i++) {
      const c = layer.children[i];
      if (c instanceof paper.Path || c instanceof paper.CompoundPath) {
        layerOrder.set(c.id, i);
      }
    }
    const existing = [...existingSet.values()].sort(
      (a, b) => (layerOrder.get(a.id) ?? 0) - (layerOrder.get(b.id) ?? 0),
    );

    const changedItems: paper.PathItem[] = [];
    const placed = this.mergePathWithExisting(item, existing, changedItems);
    this.normalizeAfterLocalEdit([...changedItems, placed]);

    paper.view.update();
  }

  /**
   * Draw selection indicator, accounting for camera transformation (including rotation)
   * Draws all four corners as a polygon to properly show rotation
   */
  drawSelection(item: paper.Item | null, ctx: CanvasRenderingContext2D) {
    if (!item) return;

    const b = item.bounds;
    // Padding in world space - scale by inverse zoom so it appears constant on screen
    const worldPadding = this.camera ? 4 / this.camera.zoom : 4;

    // Get all four corners of the bounding box in world space
    const worldCorners = [
      { x: b.x - worldPadding, y: b.y - worldPadding }, // top-left
      { x: b.x + b.width + worldPadding, y: b.y - worldPadding }, // top-right
      { x: b.x + b.width + worldPadding, y: b.y + b.height + worldPadding }, // bottom-right
      { x: b.x - worldPadding, y: b.y + b.height + worldPadding }, // bottom-left
    ];

    // Convert all corners to screen space
    const screenCorners = worldCorners.map((corner) =>
      this.worldToScreen(corner.x, corner.y),
    );

    // Draw as a polygon path
    ctx.save();
    ctx.strokeStyle = "#ff9900";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    ctx.beginPath();
    ctx.moveTo(screenCorners[0].x, screenCorners[0].y);
    ctx.lineTo(screenCorners[1].x, screenCorners[1].y);
    ctx.lineTo(screenCorners[2].x, screenCorners[2].y);
    ctx.lineTo(screenCorners[3].x, screenCorners[3].y);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }
}
