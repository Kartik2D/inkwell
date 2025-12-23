/**
 * UI Overlay - Visual Feedback Layer
 *
 * Draws UI elements and visual feedback on the top canvas layer.
 *
 * Key responsibilities:
 * - Displays cursor/pen position indicator during drawing
 * - Shows crosshair for precision feedback
 * - Draws world origin axes (X/Y at 0,0)
 * - Maps pixel coordinates back to viewport for display
 *
 * Visual elements:
 * - Circular cursor indicator (sized to max brush size, semi-transparent)
 * - Crosshair lines (10px length) for precise positioning
 * - X-axis (red) and Y-axis (green) at world origin
 * - All drawn in viewport coordinates (not pixel coordinates)
 */
import type { Point, CanvasConfig } from "./types";
import type { Camera } from "./camera";

export class UIOverlay {
  private ctx: CanvasRenderingContext2D;
  private config: CanvasConfig;
  private camera: Camera | null = null;
  private currentCursor: Point | null = null;
  private cursorEnabled = true;
  private isDrawing = false;
  private isMobile = false;
  private maxBrushSize = 4; // Default max brush size in pixel canvas units

  constructor(
    _canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    config: CanvasConfig,
  ) {
    this.ctx = ctx;
    this.config = config;
    this.detectMobile();
  }

  private detectMobile() {
    // Detect mobile/touch devices
    this.isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  /**
   * Set the camera reference for world-to-screen transformations
   */
  setCamera(camera: Camera) {
    this.camera = camera;
  }

  setCursorEnabled(enabled: boolean) {
    this.cursorEnabled = enabled;
    this.draw();
  }

  setDrawingState(isDrawing: boolean) {
    this.isDrawing = isDrawing;
    this.draw();
  }

  updateConfig(config: CanvasConfig) {
    this.config = config;
    this.ctx.canvas.width = config.viewportWidth;
    this.ctx.canvas.height = config.viewportHeight;
  }

  setMaxBrushSize(size: number) {
    this.maxBrushSize = size;
    this.draw();
  }

  updateCursor(point: Point) {
    this.currentCursor = point;
    this.draw();
  }

  clearCursor() {
    this.currentCursor = null;
    this.draw();
  }

  /**
   * Force a redraw of the cursor (and clear canvas)
   * Useful when other UI elements need the canvas cleared
   */
  redraw() {
    this.draw();
  }

  private shouldShowCursor(): boolean {
    // If cursor is disabled via toggle, never show
    if (!this.cursorEnabled) return false;

    // On mobile, only show cursor while actively drawing
    if (this.isMobile) return this.isDrawing;

    // On desktop, always show cursor when available
    return true;
  }

  /**
   * Convert world coordinates to screen coordinates using camera
   */
  private worldToScreen(
    worldX: number,
    worldY: number,
  ): { x: number; y: number } {
    if (!this.camera) {
      return { x: worldX, y: worldY };
    }
    return this.camera.worldToScreen(worldX, worldY);
  }

  /**
   * Draw the X and Y axes at world origin (0,0)
   * Lines extend infinitely by calculating screen edge intersections
   */
  private drawAxes() {
    if (!this.camera) return;

    const ctx = this.ctx;
    const axisWidth = 2;
    const screenW = this.config.viewportWidth;
    const screenH = this.config.viewportHeight;

    // Get origin and a second point on each axis in screen space
    // We use these to define the direction of each axis on screen
    const origin = this.worldToScreen(0, 0);
    const xDir = this.worldToScreen(1, 0);
    const yDir = this.worldToScreen(0, 1);

    ctx.save();
    ctx.lineWidth = axisWidth;

    // Draw X axis (red) - line through origin with direction (xDir - origin)
    const xAxisPoints = this.lineScreenIntersection(
      origin,
      { x: xDir.x - origin.x, y: xDir.y - origin.y },
      screenW,
      screenH,
    );
    if (xAxisPoints) {
      ctx.strokeStyle = "rgba(0, 255, 255, 0.5)";
      ctx.beginPath();
      ctx.moveTo(xAxisPoints.start.x, xAxisPoints.start.y);
      ctx.lineTo(xAxisPoints.end.x, xAxisPoints.end.y);
      ctx.stroke();
    }

    // Draw Y axis (green) - line through origin with direction (yDir - origin)
    const yAxisPoints = this.lineScreenIntersection(
      origin,
      { x: yDir.x - origin.x, y: yDir.y - origin.y },
      screenW,
      screenH,
    );
    if (yAxisPoints) {
      ctx.strokeStyle = "rgba(255, 0, 255, 0.5)";
      ctx.beginPath();
      ctx.moveTo(yAxisPoints.start.x, yAxisPoints.start.y);
      ctx.lineTo(yAxisPoints.end.x, yAxisPoints.end.y);
      ctx.stroke();
    }

    // Draw origin circle if visible on screen
    if (
      origin.x >= -10 &&
      origin.x <= screenW + 10 &&
      origin.y >= -10 &&
      origin.y <= screenH + 10
    ) {
      ctx.fillStyle = "rgba(100, 100, 100, 0.5)";
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Calculate where an infinite line intersects the screen edges
   * Returns start and end points clamped to screen bounds, or null if line doesn't cross screen
   */
  private lineScreenIntersection(
    point: { x: number; y: number },
    direction: { x: number; y: number },
    screenW: number,
    screenH: number,
  ): { start: { x: number; y: number }; end: { x: number; y: number } } | null {
    // Handle degenerate case
    if (direction.x === 0 && direction.y === 0) return null;

    const intersections: { x: number; y: number }[] = [];

    // Check intersection with all 4 screen edges
    // Left edge (x = 0)
    if (direction.x !== 0) {
      const t = -point.x / direction.x;
      const y = point.y + t * direction.y;
      if (y >= 0 && y <= screenH) {
        intersections.push({ x: 0, y });
      }
    }

    // Right edge (x = screenW)
    if (direction.x !== 0) {
      const t = (screenW - point.x) / direction.x;
      const y = point.y + t * direction.y;
      if (y >= 0 && y <= screenH) {
        intersections.push({ x: screenW, y });
      }
    }

    // Top edge (y = 0)
    if (direction.y !== 0) {
      const t = -point.y / direction.y;
      const x = point.x + t * direction.x;
      if (x >= 0 && x <= screenW) {
        intersections.push({ x, y: 0 });
      }
    }

    // Bottom edge (y = screenH)
    if (direction.y !== 0) {
      const t = (screenH - point.y) / direction.y;
      const x = point.x + t * direction.x;
      if (x >= 0 && x <= screenW) {
        intersections.push({ x, y: screenH });
      }
    }

    // Need at least 2 intersections to draw a line
    if (intersections.length < 2) return null;

    // Return the two most distant points
    return {
      start: intersections[0],
      end: intersections[1],
    };
  }

  private draw() {
    // Clear overlay
    this.ctx.clearRect(
      0,
      0,
      this.config.viewportWidth,
      this.config.viewportHeight,
    );

    // Draw world axes
    this.drawAxes();

    // Draw cursor
    if (this.currentCursor && this.shouldShowCursor()) {
      // Map pixel coordinates back to viewport coordinates
      const viewportX =
        (this.currentCursor.x / this.config.pixelWidth) *
        this.config.viewportWidth;
      const viewportY =
        (this.currentCursor.y / this.config.pixelHeight) *
        this.config.viewportHeight;

      // Calculate cursor radius based on max brush size, scaled to viewport
      // Brush size is diameter (lineWidth), so divide by 2 for radius
      // Subtract 0.5 pixel-canvas-pixels to account for rasterization on low-res canvas
      const scale = this.config.viewportWidth / this.config.pixelWidth;
      const cursorRadius = (this.maxBrushSize / 2 - 0.5) * scale;

      // Draw cursor indicator
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.arc(viewportX, viewportY, cursorRadius, 0, Math.PI * 2);
      this.ctx.stroke();

      // Draw crosshair (fixed size for precision)
      this.ctx.beginPath();
      this.ctx.moveTo(viewportX - 10, viewportY);
      this.ctx.lineTo(viewportX + 10, viewportY);
      this.ctx.moveTo(viewportX, viewportY - 10);
      this.ctx.lineTo(viewportX, viewportY + 10);
      this.ctx.stroke();
    }
  }
}
