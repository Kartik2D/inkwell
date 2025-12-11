/**
 * UI Overlay - Visual Feedback Layer
 * 
 * Draws UI elements and visual feedback on the top canvas layer.
 * 
 * Key responsibilities:
 * - Displays cursor/pen position indicator during drawing
 * - Shows crosshair for precision feedback
 * - Clears cursor when stroke ends
 * - Maps pixel coordinates back to viewport for display
 * 
 * Visual elements:
 * - Circular cursor indicator (sized to max brush size, semi-transparent)
 * - Crosshair lines (10px length) for precise positioning
 * - All drawn in viewport coordinates (not pixel coordinates)
 */
import type { Point, CanvasConfig } from './types';

export class UIOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: CanvasConfig;
  private currentCursor: Point | null = null;
  private cursorEnabled = true;
  private isDrawing = false;
  private isMobile = false;
  private maxBrushSize = 4; // Default max brush size in pixel canvas units

  constructor(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    config: CanvasConfig
  ) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.config = config;
    this.detectMobile();
  }

  private detectMobile() {
    // Detect mobile/touch devices
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
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

  private shouldShowCursor(): boolean {
    // If cursor is disabled via toggle, never show
    if (!this.cursorEnabled) return false;
    
    // On mobile, only show cursor while actively drawing
    if (this.isMobile) return this.isDrawing;
    
    // On desktop, always show cursor when available
    return true;
  }

  private draw() {
    // Clear overlay
    this.ctx.clearRect(0, 0, this.config.viewportWidth, this.config.viewportHeight);

    if (this.currentCursor && this.shouldShowCursor()) {
      // Map pixel coordinates back to viewport coordinates
      const viewportX = (this.currentCursor.x / this.config.pixelWidth) * this.config.viewportWidth;
      const viewportY = (this.currentCursor.y / this.config.pixelHeight) * this.config.viewportHeight;

      // Calculate cursor radius based on max brush size, scaled to viewport
      // Brush size is diameter (lineWidth), so divide by 2 for radius
      // Subtract 0.5 pixel-canvas-pixels to account for rasterization on low-res canvas
      const scale = this.config.viewportWidth / this.config.pixelWidth;
      const cursorRadius = (this.maxBrushSize / 2 - 0.5) * scale;

      // Draw cursor indicator
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
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

