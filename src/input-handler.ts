/**
 * Input Handler - Unified Input Management
 * 
 * Handles all user input (mouse, touch, iPad Pencil) using Pointer Events API.
 * 
 * Key responsibilities:
 * - Listens to pointer events on the UI canvas (top layer)
 * - Normalizes coordinates from viewport space → pixel canvas space
 * - Supports pressure sensitivity for iPad Pencil (pressure property)
 * - Prevents default touch behaviors (scrolling, context menu)
 * - Calls callbacks (onStart, onMove, onEnd) to notify App of stroke events
 * 
 * Coordinate transformation:
 * - Receives viewport coordinates (e.g., 1920x1080)
 * - Converts to pixel canvas coordinates (e.g., 240x135, ~8x smaller)
 * - Passes normalized points to drawing components
 */
import type { Point, CanvasConfig } from './types';

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private config: CanvasConfig;
  private onStart: (point: Point) => void;
  private onMove: (point: Point) => void;
  private onEnd: () => void;
  private onPointerMove?: (point: Point) => void;
  private isDrawing = false;
  private currentStroke: Point[] = [];
  private lastPressure: number | null = null;
  private pressureOpts = {
    defaultPressure: 0.5,
    deadzone: 0.05,
  };

  constructor(
    canvas: HTMLCanvasElement,
    config: CanvasConfig,
    onStart: (point: Point) => void,
    onMove: (point: Point) => void,
    onEnd: () => void,
    onPointerMove?: (point: Point) => void
  ) {
    this.canvas = canvas;
    this.config = config;
    this.onStart = onStart;
    this.onMove = onMove;
    this.onEnd = onEnd;
    this.onPointerMove = onPointerMove;

    this.setupEventListeners();
  }

  updateConfig(config: CanvasConfig) {
    this.config = config;
  }

  private setupEventListeners() {
    // Use pointer events for unified handling (supports mouse, touch, and pen)
    this.canvas.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    this.canvas.addEventListener('pointermove', this.handlePointerMove.bind(this));
    this.canvas.addEventListener('pointerup', this.handlePointerUp.bind(this));
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel.bind(this));

    // Prevent context menu on long press
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Prevent scrolling on touch devices
    this.canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    // Prevent trackpad pinch-to-zoom (manifests as wheel event with ctrlKey)
    this.canvas.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    }, { passive: false });

    // Prevent Safari gesture events (pinch/rotate)
    this.canvas.addEventListener('gesturestart', (e) => e.preventDefault());
    this.canvas.addEventListener('gesturechange', (e) => e.preventDefault());
    this.canvas.addEventListener('gestureend', (e) => e.preventDefault());
  }

  /**
   * Sanitize pressure to avoid artifacts at stroke start/end.
   * Many devices report incorrect pressure (0 or spikes) on pointerdown/up.
   * Uses last known pressure when below deadzone, remaps range for full brush coverage.
   */
  private sanitizePressure(raw: number | undefined): number {
    if (typeof raw !== 'number' || Number.isNaN(raw)) {
      return this.lastPressure ?? this.pressureOpts.defaultPressure;
    }

    let p = Math.max(0, Math.min(1, raw));

    // Treat values below deadzone as invalid - use last known pressure
    if (p < this.pressureOpts.deadzone) {
      p = this.lastPressure ?? this.pressureOpts.defaultPressure;
    } else {
      // Remap [deadzone, 1.0] to [0.0, 1.0] for full brush range
      p = (p - this.pressureOpts.deadzone) / (1.0 - this.pressureOpts.deadzone);
    }

    this.lastPressure = p;
    return p;
  }

  private normalizePoint(clientX: number, clientY: number, rawPressure?: number): Point {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Map to pixel canvas coordinates
    const pixelX = (x / this.config.viewportWidth) * this.config.pixelWidth;
    const pixelY = (y / this.config.viewportHeight) * this.config.pixelHeight;

    return {
      x: pixelX,
      y: pixelY,
      pressure: this.sanitizePressure(rawPressure),
    };
  }

  private handlePointerDown(e: PointerEvent) {
    if (this.isDrawing) return;

    this.canvas.setPointerCapture(e.pointerId);
    this.isDrawing = true;

    const point = this.normalizePoint(e.clientX, e.clientY, e.pressure || undefined);
    this.currentStroke = [point];
    this.onStart(point);
  }

  private handlePointerMove(e: PointerEvent) {
    const point = this.normalizePoint(e.clientX, e.clientY, e.pressure || undefined);
    
    // Always update cursor position if callback is provided
    if (this.onPointerMove) {
      this.onPointerMove(point);
    }

    // Handle drawing movement
    if (!this.isDrawing) return;

    this.currentStroke.push(point);
    this.onMove(point);
  }

  private handlePointerUp(e: PointerEvent) {
    if (!this.isDrawing) return;

    this.canvas.releasePointerCapture(e.pointerId);
    this.isDrawing = false;

    if (this.currentStroke.length > 0) {
      const lastPoint = this.currentStroke[this.currentStroke.length - 1];
      this.onMove(lastPoint);
    }

    this.onEnd();
    this.currentStroke = [];
    this.lastPressure = null; // Reset for next stroke
  }

  private handlePointerCancel(e: PointerEvent) {
    if (!this.isDrawing) return;

    this.canvas.releasePointerCapture(e.pointerId);
    this.isDrawing = false;
    this.currentStroke = [];
    this.lastPressure = null; // Reset for next stroke
    this.onEnd();
  }
}

