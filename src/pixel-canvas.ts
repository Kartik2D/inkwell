/**
 * Pixel Canvas - Low-Resolution Drawing Manager
 * 
 * Manages the low-resolution pixel canvas where strokes are temporarily drawn.
 * 
 * Key characteristics:
 * - Internal resolution: ~64-128px (auto-calculated, ~8x downscale from viewport)
 * - Display size: Full viewport (scaled up via CSS with image-rendering: pixelated)
 * - Purpose: Temporary drawing surface that gets cleared after successful tracing
 * 
 * Key responsibilities:
 * - Draws strokes with pressure-sensitive brush size
 * - Tracks current stroke points for tracing
 * - Provides ImageData for potrace conversion
 * - Clears canvas after successful vector tracing
 * 
 * Drawing approach:
 * - Uses 2D canvas context with imageSmoothingEnabled: false for crisp pixels
 * - Draws line segments between points with rounded caps/joins
 * - Adjusts brush size based on pressure (if available)
 */
import type { Point, CanvasConfig } from './types';

export class PixelCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: CanvasConfig;
  private currentStroke: Point[] = [];
  private brushSizeMin = 1;
  private brushSizeMax = 4;
  private brushColor = '#000000';

  setBrushSizeRange(min: number, max: number) {
    this.brushSizeMin = min;
    this.brushSizeMax = max;
  }

  getBrushSizeMin(): number {
    return this.brushSizeMin;
  }

  getBrushSizeMax(): number {
    return this.brushSizeMax;
  }

  setBrushColor(color: string) {
    this.brushColor = color;
    this.ctx.fillStyle = color;
    this.ctx.strokeStyle = color;
  }

  getBrushColor(): string {
    return this.brushColor;
  }

  constructor(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    config: CanvasConfig
  ) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.config = config;

    // Set up canvas context
    this.ctx.fillStyle = 'black';
    this.ctx.strokeStyle = 'black';
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  updateConfig(config: CanvasConfig) {
    this.config = config;
    this.ctx.canvas.width = config.pixelWidth;
    this.ctx.canvas.height = config.pixelHeight;
    this.ctx.imageSmoothingEnabled = false;
    // Re-apply styles after canvas resize (resizing resets context state)
    this.ctx.fillStyle = this.brushColor;
    this.ctx.strokeStyle = this.brushColor;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  startStroke(point: Point) {
    this.currentStroke = [point];
    this.drawPoint(point);
  }

  addPoint(point: Point) {
    if (this.currentStroke.length === 0) {
      this.currentStroke = [point];
      this.drawPoint(point);
      return;
    }

    const lastPoint = this.currentStroke[this.currentStroke.length - 1];
    this.currentStroke.push(point);

    // Draw line segment
    this.ctx.beginPath();
    this.ctx.moveTo(lastPoint.x, lastPoint.y);
    
    // Adjust brush size based on pressure (already sanitized by InputHandler)
    // Maps pressure [0, 1] to brush size [min, max]
    const pressure = point.pressure ?? 1;
    const size = this.brushSizeMin + pressure * (this.brushSizeMax - this.brushSizeMin);
    
    this.ctx.lineWidth = size;
    this.ctx.lineTo(point.x, point.y);
    this.ctx.stroke();

    // Draw endpoint circle for better connection
    this.ctx.beginPath();
    this.ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawPoint(point: Point) {
    // Maps pressure [0, 1] to brush size [min, max] (already sanitized by InputHandler)
    const pressure = point.pressure ?? 1;
    const size = this.brushSizeMin + pressure * (this.brushSizeMax - this.brushSizeMin);

    this.ctx.beginPath();
    this.ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
    this.ctx.fill();
  }

  endStroke(): { points: Point[]; brushSizeMin: number; brushSizeMax: number } | null {
    if (this.currentStroke.length === 0) {
      return null;
    }

    const stroke = {
      points: [...this.currentStroke],
      brushSizeMin: this.brushSizeMin,
      brushSizeMax: this.brushSizeMax,
    };

    this.currentStroke = [];
    return stroke;
  }

  /**
   * Start a lasso selection - track the starting point and draw initial shape
   */
  startLasso(point: Point) {
    this.currentStroke = [point];
    this.drawLassoShape();
  }

  /**
   * Add point to lasso and redraw the filled polygon shape
   */
  addLassoPoint(point: Point) {
    if (this.currentStroke.length === 0) {
      this.currentStroke = [point];
      this.drawLassoShape();
      return;
    }

    this.currentStroke.push(point);
    this.drawLassoShape();
  }

  /**
   * Draw the current lasso shape as a filled polygon (clears and redraws)
   */
  private drawLassoShape() {
    // Clear canvas and redraw the filled polygon
    this.clear();

    if (this.currentStroke.length < 2) {
      // Just draw a point if we only have one
      if (this.currentStroke.length === 1) {
        this.ctx.beginPath();
        this.ctx.arc(this.currentStroke[0].x, this.currentStroke[0].y, 1, 0, Math.PI * 2);
        this.ctx.fill();
      }
      return;
    }

    // Draw and fill the closed polygon
    this.ctx.beginPath();
    this.ctx.moveTo(this.currentStroke[0].x, this.currentStroke[0].y);
    
    for (let i = 1; i < this.currentStroke.length; i++) {
      this.ctx.lineTo(this.currentStroke[i].x, this.currentStroke[i].y);
    }
    
    // Close the path back to start and fill
    this.ctx.closePath();
    this.ctx.fill();
  }

  /**
   * End lasso - return the stroke data (shape is already drawn)
   */
  endLasso(): { points: Point[]; brushSizeMin: number; brushSizeMax: number } | null {
    if (this.currentStroke.length < 3) {
      // Need at least 3 points to form a polygon
      this.currentStroke = [];
      this.clear();
      return null;
    }

    const stroke = {
      points: [...this.currentStroke],
      brushSizeMin: this.brushSizeMin,
      brushSizeMax: this.brushSizeMax,
    };

    this.currentStroke = [];
    return stroke;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.config.pixelWidth, this.config.pixelHeight);
  }

  getImageData(): ImageData {
    return this.ctx.getImageData(0, 0, this.config.pixelWidth, this.config.pixelHeight);
  }
}

