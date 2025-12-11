/**
 * Paper Renderer - Vector Path Rendering
 * 
 * Layer model:
 * - Flat list of non-overlapping paths (no groups)
 * - CompoundPaths only for shapes with holes
 * - Same color overlap → union
 * - Different color overlap → top cuts bottom
 */
import paper from 'paper';
import RBush from 'rbush';
import type { CanvasConfig } from './types';

export class PaperRenderer {
  private config: CanvasConfig;

  constructor(_canvas: HTMLCanvasElement, config: CanvasConfig) {
    this.config = config;
  }

  updateConfig(config: CanvasConfig) {
    this.config = config;
  }

  /**
   * Import and scale SVG, returning extracted paths (ungrouped)
   */
  private importSVG(svg: string): paper.PathItem[] {
    const item = paper.project.importSVG(svg) as paper.Item;
    if (!item) return [];

    // Scale to viewport
    const svgMatch = svg.match(/width="([^"]+)"\s+height="([^"]+)"/);
    if (svgMatch) {
      const svgWidth = parseFloat(svgMatch[1]);
      const svgHeight = parseFloat(svgMatch[2]);
      if (svgWidth > 0 && svgHeight > 0) {
        const scale = Math.min(
          this.config.viewportWidth / svgWidth,
          this.config.viewportHeight / svgHeight
        );
        item.scale(scale);
      }
    }
    item.position = paper.view.center;

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
      const subData = subs.map(s => s.pathData);
      
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
        const newItem = comp.length === 1
          ? new paper.Path(subData[comp[0]])
          : new paper.CompoundPath(comp.map(i => subData[i]).join(' '));
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
    const ba = a.bounds, bb = b.bounds;
    
    // No bounds overlap = not connected
    if (!ba.intersects(bb) && !ba.contains(bb) && !bb.contains(ba)) {
      return false;
    }
    
    // Edges intersect or one contains the other (hole)
    try { if (a.intersects(b)) return true; } catch {}
    try { if (a.contains(bb.center) || b.contains(ba.center)) return true; } catch {}
    
    return false;
  }

  /**
   * Check if two paths collide
   */
  private pathsCollide(a: paper.PathItem, b: paper.PathItem): boolean {
    if (!a.bounds.intersects(b.bounds)) return false;
    return a.intersects(b) || a.contains(b.bounds.center) || b.contains(a.bounds.center);
  }

  /**
   * Normalize layer after any operation
   */
  private normalizeLayer(): void {
    this.flattenGroups();
    this.splitDisconnected();
  }

  async addPath(svg: string, color: string = '#000000'): Promise<void> {
    const layer = paper.project.activeLayer;
    const paperColor = new paper.Color(color);
    const colorCSS = paperColor.toCSS(true);
    
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
    const existing = (layer.children as paper.Item[])
      .filter((c): c is paper.PathItem => 
        (c instanceof paper.Path || c instanceof paper.CompoundPath) && !newSet.has(c)
      );
    
    // Boolean operations
    for (let newPath of newPaths) {
      for (const ex of existing) {
        if (!ex.parent || !this.pathsCollide(newPath, ex)) continue;
        
        const exColor = ex.fillColor?.toCSS(true) ?? 'none';
        
        if (exColor === colorCSS) {
          // Same color: union
          try {
            const united = newPath.unite(ex);
            if (united && !united.isEmpty()) {
              united.fillColor = paperColor;
              newPath.remove();
              ex.remove();
              newPath = united;
            } else {
              united?.remove();
            }
          } catch {}
        } else {
          // Different color: new cuts existing
          try {
            const result = ex.subtract(newPath);
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
    const existing = (layer.children as paper.Item[])
      .filter((c): c is paper.PathItem => 
        (c instanceof paper.Path || c instanceof paper.CompoundPath) && !eraserSet.has(c)
      );
    
    // Subtract from all existing
    for (const eraser of eraserPaths) {
      for (const ex of existing) {
        if (!ex.parent || !this.pathsCollide(eraser, ex)) continue;
        try {
          const result = ex.subtract(eraser);
          ex.replaceWith(result);
        } catch {}
      }
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
    const getColor = (p: paper.PathItem) => p.fillColor?.toCSS(true) ?? 'none';
    
    this.flattenGroups();
    
    const allPaths = [...layer.children].filter((c): c is paper.PathItem => 
      c instanceof paper.Path || c instanceof paper.CompoundPath
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
    interface SI { minX: number; minY: number; maxX: number; maxY: number; color: string }
    const index = new RBush<SI>();
    index.load(Array.from(colorPaths.entries()).map(([color, p]) => {
      const b = p.bounds;
      return { minX: b.x, minY: b.y, maxX: b.x + b.width, maxY: b.y + b.height, color };
    }));
    
    // Z-order by first occurrence
    const zOrder = [...new Set(allPaths.map(getColor))];
    
    // Top cuts bottom
    for (let ti = zOrder.length - 1; ti >= 0; ti--) {
      const topPath = colorPaths.get(zOrder[ti]);
      if (!topPath?.parent) continue;
      
      const b = topPath.bounds;
      for (const c of index.search({ minX: b.x, minY: b.y, maxX: b.x + b.width, maxY: b.y + b.height })) {
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

  hitTest(point: { x: number; y: number }): paper.Item | null {
    const result = paper.project.hitTest(new paper.Point(point.x, point.y), {
      fill: true, stroke: true, tolerance: 5
    });
    return result?.item ?? null;
  }

  getAllPaths(): paper.PathItem[] {
    return paper.project.activeLayer.children.filter((c): c is paper.PathItem =>
      c instanceof paper.Path || c instanceof paper.CompoundPath
    );
  }

  movePath(item: paper.Item, delta: { x: number; y: number }) {
    item.position = item.position.add(new paper.Point(delta.x, delta.y));
    paper.view.update();
  }

  drawSelection(item: paper.Item | null, ctx: CanvasRenderingContext2D) {
    if (!item) return;
    const b = item.bounds;
    const p = 4;
    ctx.save();
    ctx.strokeStyle = '#0066ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(b.x - p, b.y - p, b.width + p * 2, b.height + p * 2);
    ctx.restore();
  }
}
