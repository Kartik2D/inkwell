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

export class PaperRenderer {
  private config: CanvasConfig;
  private camera: Camera | null = null;

  constructor(_canvas: HTMLCanvasElement, config: CanvasConfig) {
    this.config = config;
  }

  updateConfig(config: CanvasConfig) {
    this.config = config;
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

    for (const item of [...layer.children]) {
      if (!(item instanceof paper.CompoundPath)) continue;
      if (item.children.length <= 1) continue;

      const fillColor = item.fillColor;
      const subs = item.children as paper.Path[];
      const n = subs.length;

      // Capture path data before modifying
      const subData = subs.map((s) => s.pathData);

      // Build adjacency (which sub-paths are connected)
      const adj: Set<number>[] = Array.from({ length: n }, () => new Set());
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (this.subPathsConnected(subs[i], subs[j])) {
            adj[i].add(j);
            adj[j].add(i);
          }
        }
      }

      // Find connected components (BFS)
      const visited = new Array(n).fill(false);
      const components: number[][] = [];
      for (let start = 0; start < n; start++) {
        if (visited[start]) continue;
        const comp: number[] = [];
        const queue = [start];
        visited[start] = true;
        while (queue.length) {
          const curr = queue.shift()!;
          comp.push(curr);
          for (const next of adj[curr]) {
            if (!visited[next]) {
              visited[next] = true;
              queue.push(next);
            }
          }
        }
        components.push(comp);
      }

      // If all connected, nothing to split
      if (components.length <= 1) continue;

      // Create separate items for each component
      const idx = layer.children.indexOf(item);
      for (const comp of components) {
        const newItem =
          comp.length === 1
            ? new paper.Path(subData[comp[0]])
            : new paper.CompoundPath(comp.map((i) => subData[i]).join(" "));
        newItem.fillColor = fillColor;
        layer.insertChild(idx, newItem);
      }
      item.remove();
    }
  }

  /**
   * Check if two sub-paths are connected (for hole detection)
   */
  private subPathsConnected(a: paper.Path, b: paper.Path): boolean {
    const ba = a.bounds,
      bb = b.bounds;

    // No bounds overlap = not connected
    if (!ba.intersects(bb) && !ba.contains(bb) && !bb.contains(ba)) {
      return false;
    }

    // Edges intersect or one contains the other (hole)
    try {
      if (a.intersects(b)) return true;
    } catch {}
    try {
      if (a.contains(bb.center) || b.contains(ba.center)) return true;
    } catch {}

    return false;
  }

  /**
   * Check if two paths collide
   */
  private pathsCollide(a: paper.PathItem, b: paper.PathItem): boolean {
    if (!a.bounds.intersects(b.bounds)) return false;
    return (
      a.intersects(b) ||
      a.contains(b.bounds.center) ||
      b.contains(a.bounds.center)
    );
  }

  /**
   * Normalize layer after any operation
   */
  private normalizeLayer(): void {
    this.flattenGroups();
    this.splitDisconnected();
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
          if (united && !united.isEmpty()) {
            united.fillColor = currentPath.fillColor;
            currentPath.remove();
            ex.remove();
            currentPath = united;
          } else {
            united?.remove();
          }
        } catch {}
      } else {
        // Different color: new cuts existing
        try {
          const result = ex.subtract(currentPath);
          if (result && !result.isEmpty()) {
            result.fillColor = ex.fillColor;
            ex.replaceWith(result);
          } else {
            ex.remove();
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
  ): void {
    for (const ex of existing) {
      if (!ex.parent || !this.pathsCollide(eraserPath, ex)) continue;
      try {
        const result = ex.subtract(eraserPath);
        ex.replaceWith(result);
      } catch {}
    }
  }

  async addPath(svg: string, color: string = "#000000"): Promise<void> {
    const layer = paper.project.activeLayer;
    const paperColor = new paper.Color(color);

    // Import new paths
    const newPaths = this.importSVG(svg);
    if (newPaths.length === 0) return;

    // Apply color and move to layer root
    for (const p of newPaths) {
      p.fillColor = paperColor;
      layer.addChild(p);
    }

    // Get existing paths (before new ones)
    const newSet = new Set(newPaths);
    const existing = (layer.children as paper.Item[]).filter(
      (c): c is paper.PathItem =>
        (c instanceof paper.Path || c instanceof paper.CompoundPath) &&
        !newSet.has(c),
    );

    // Boolean operations using shared helper
    for (const newPath of newPaths) {
      this.mergePathWithExisting(newPath, existing);
    }

    this.normalizeLayer();
    paper.view.update();
  }

  async subtractPath(svg: string): Promise<void> {
    const layer = paper.project.activeLayer;

    // Import eraser paths
    const eraserPaths = this.importSVG(svg);
    if (eraserPaths.length === 0) return;

    // Get existing paths
    const eraserSet = new Set(eraserPaths);
    const existing = (layer.children as paper.Item[]).filter(
      (c): c is paper.PathItem =>
        (c instanceof paper.Path || c instanceof paper.CompoundPath) &&
        !eraserSet.has(c),
    );

    // Subtract from all existing using shared helper
    for (const eraser of eraserPaths) {
      this.subtractPathFromExisting(eraser, existing);
      eraser.remove();
    }

    this.normalizeLayer();
    paper.view.update();
  }

  clear() {
    paper.project.clear();
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
          if (united && !united.isEmpty()) {
            if (result !== paths[0]) result.remove();
            paths[i].remove();
            result = united;
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
        const bi = zOrder.indexOf(c.color);
        if (bi >= ti) continue;

        const botPath = colorPaths.get(c.color);
        if (!botPath?.parent) continue;

        try {
          const result = botPath.subtract(topPath);
          if (result && !result.isEmpty()) {
            result.fillColor = botPath.fillColor;
            botPath.replaceWith(result);
            colorPaths.set(c.color, result);
          } else {
            botPath.remove();
            result?.remove();
            colorPaths.delete(c.color);
          }
        } catch {}
      }
    }

    this.splitDisconnected();
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

    // Get all other paths
    const existing = (layer.children as paper.Item[]).filter(
      (c): c is paper.PathItem =>
        (c instanceof paper.Path || c instanceof paper.CompoundPath) &&
        c !== item,
    );

    // Use shared helper for boolean operations
    this.mergePathWithExisting(item, existing);

    this.normalizeLayer();
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
