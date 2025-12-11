/**
 * Main Application Orchestrator
 * 
 * Central coordinator that:
 * - Initializes all three canvases and their contexts
 * - Creates and wires up all component modules
 * - Manages the complete drawing lifecycle (start → move → end → trace → render)
 * - Handles window resize events and updates all components
 * - Auto-calculates pixel canvas resolution (~8x downscale from viewport)
 * 
 * Key responsibilities:
 * - Component initialization and dependency injection
 * - Event flow coordination between InputHandler → PixelCanvas → Tracer → PaperRenderer
 * - Canvas sizing and configuration management
 */
import { init, potrace } from 'esm-potrace-wasm';
import paper from 'paper';
import { InputHandler } from './input-handler';
import { PixelCanvas } from './pixel-canvas';
import { Tracer } from './tracer';
import { PaperRenderer } from './paper-renderer';
import { UIOverlay } from './ui-overlay';
import { ControlPanel } from './control-panel';
import type { CanvasConfig, DrawMode, DrawTool, Point } from './types';

class App {
  private paperCanvas: HTMLCanvasElement;
  private pixelCanvas: HTMLCanvasElement;
  private uiCanvas: HTMLCanvasElement;
  private pixelCanvas2D: CanvasRenderingContext2D;
  private uiCanvas2D: CanvasRenderingContext2D;
  private config: CanvasConfig;
  private inputHandler: InputHandler;
  private pixelCanvasManager: PixelCanvas;
  private tracer: Tracer;
  private paperRenderer: PaperRenderer;
  private uiOverlay: UIOverlay;
  private controlPanel: ControlPanel;
  private isInitialized = false;
  private pixelResScale = 2; // Default scale factor for pixel resolution
  private brushColor = '#000000'; // Current brush color
  private currentMode: DrawMode = 'add';
  private currentTool: DrawTool = 'brush';
  
  // Selection tool state
  private selectedItem: paper.Item | null = null;
  private isDragging = false;
  private dragStartPoint: Point | null = null;

  constructor() {
    // Get canvas elements
    this.paperCanvas = document.getElementById('paper-canvas') as HTMLCanvasElement;
    this.pixelCanvas = document.getElementById('pixel-canvas') as HTMLCanvasElement;
    this.uiCanvas = document.getElementById('ui-canvas') as HTMLCanvasElement;

    if (!this.paperCanvas || !this.pixelCanvas || !this.uiCanvas) {
      throw new Error('Canvas elements not found');
    }

    // Get 2D contexts
    const pixelCtx = this.pixelCanvas.getContext('2d');
    const uiCtx = this.uiCanvas.getContext('2d');

    if (!pixelCtx || !uiCtx) {
      throw new Error('Could not get 2D contexts');
    }

    this.pixelCanvas2D = pixelCtx;
    this.uiCanvas2D = uiCtx;

    // Calculate configuration
    this.config = this.calculateConfig();

    // Initialize components
    this.pixelCanvasManager = new PixelCanvas(this.pixelCanvas, this.pixelCanvas2D, this.config);
    this.tracer = new Tracer(potrace);
    this.paperRenderer = new PaperRenderer(this.paperCanvas, this.config);
    this.uiOverlay = new UIOverlay(this.uiCanvas, this.uiCanvas2D, this.config);
    this.controlPanel = new ControlPanel(
      this.onBrushSizeChange.bind(this),
      this.onBrushColorChange.bind(this),
      this.onPixelResChange.bind(this),
      this.onClear.bind(this),
      this.onCursorToggleChange.bind(this),
      this.onModeChange.bind(this),
      this.onToolChange.bind(this),
      this.onFlatten.bind(this)
    );
    this.inputHandler = new InputHandler(
      this.uiCanvas,
      this.config,
      this.onStrokeStart.bind(this),
      this.onStrokeMove.bind(this),
      this.onStrokeEnd.bind(this),
      this.onPointerMove.bind(this)
    );
  }

  private calculateConfig(): CanvasConfig {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate pixel canvas resolution based on scale factor
    const pixelWidth = Math.floor(viewportWidth / this.pixelResScale);
    const pixelHeight = Math.floor(viewportHeight / this.pixelResScale);

    return {
      pixelWidth,
      pixelHeight,
      viewportWidth,
      viewportHeight,
    };
  }

  private resizeCanvases() {
    const { viewportWidth, viewportHeight } = this.config;

    // Set display size (CSS)
    this.paperCanvas.style.width = `${viewportWidth}px`;
    this.paperCanvas.style.height = `${viewportHeight}px`;
    this.pixelCanvas.style.width = `${viewportWidth}px`;
    this.pixelCanvas.style.height = `${viewportHeight}px`;
    this.uiCanvas.style.width = `${viewportWidth}px`;
    this.uiCanvas.style.height = `${viewportHeight}px`;

    // Set internal resolution
    this.pixelCanvas.width = this.config.pixelWidth;
    this.pixelCanvas.height = this.config.pixelHeight;
    this.uiCanvas.width = viewportWidth;
    this.uiCanvas.height = viewportHeight;

    // Configure pixel canvas context
    this.pixelCanvas2D.imageSmoothingEnabled = false;

    // Update Paper.js view size
    if (this.isInitialized) {
      paper.view.viewSize = new paper.Size(viewportWidth, viewportHeight);
    }
  }

  async init() {
    // Initialize esm-potrace-wasm
    await init();

    // Initialize Paper.js
    paper.setup(this.paperCanvas);
    this.isInitialized = true;

    // Resize canvases
    this.resizeCanvases();

    // Initialize brush size range and color from control panel
    const brushSizeMin = this.controlPanel.getBrushSizeMin();
    const brushSizeMax = this.controlPanel.getBrushSizeMax();
    this.pixelCanvasManager.setBrushSizeRange(brushSizeMin, brushSizeMax);
    this.uiOverlay.setMaxBrushSize(brushSizeMax);
    this.brushColor = this.controlPanel.getBrushColor();
    this.pixelCanvasManager.setBrushColor(this.brushColor);

    // Handle window resize
    window.addEventListener('resize', () => {
      this.config = this.calculateConfig();
      this.resizeCanvases();
      this.pixelCanvasManager.updateConfig(this.config);
      this.uiOverlay.updateConfig(this.config);
      this.inputHandler.updateConfig(this.config);
      this.paperRenderer.updateConfig(this.config);
    });

    console.log('App initialized');
  }

  private onStrokeStart(point: { x: number; y: number; pressure?: number }) {
    // Handle select tool
    if (this.currentTool === 'select') {
      this.handleSelectStart(point);
      return;
    }

    if (this.currentTool === 'lasso') {
      this.pixelCanvasManager.startLasso(point);
    } else {
      this.pixelCanvasManager.startStroke(point);
    }
    this.uiOverlay.setDrawingState(true);
    this.uiOverlay.updateCursor(point);
  }

  private onStrokeMove(point: { x: number; y: number; pressure?: number }) {
    // Handle select tool
    if (this.currentTool === 'select') {
      this.handleSelectMove(point);
      return;
    }

    if (this.currentTool === 'lasso') {
      this.pixelCanvasManager.addLassoPoint(point);
    } else {
      this.pixelCanvasManager.addPoint(point);
    }
    this.uiOverlay.updateCursor(point);
  }

  private async onStrokeEnd() {
    // Handle select tool
    if (this.currentTool === 'select') {
      this.handleSelectEnd();
      return;
    }

    this.uiOverlay.setDrawingState(false);
    
    // End stroke using appropriate method based on tool
    const stroke = this.currentTool === 'lasso'
      ? this.pixelCanvasManager.endLasso()
      : this.pixelCanvasManager.endStroke();
      
    if (!stroke || stroke.points.length === 0) {
      return;
    }

    // Trace the stroke
    try {
      const svg = await this.tracer.trace(this.pixelCanvas);
      if (svg) {
        if (this.currentMode === 'add') {
          // Add mode: add path with current color
          await this.paperRenderer.addPath(svg, this.brushColor);
        } else {
          // Subtract mode: subtract path from all colliding paths
          await this.paperRenderer.subtractPath(svg);
        }
        // Clear pixel canvas
        this.pixelCanvasManager.clear();
      }
    } catch (error) {
      console.error('Tracing failed:', error);
      // Keep the stroke visible if tracing fails
    }

    // Don't clear cursor on stroke end - keep it visible (on desktop)
  }

  // Selection tool handlers
  private handleSelectStart(point: { x: number; y: number }) {
    // Convert pixel canvas coordinates to viewport coordinates for hit testing
    const viewportPoint = {
      x: (point.x / this.config.pixelWidth) * this.config.viewportWidth,
      y: (point.y / this.config.pixelHeight) * this.config.viewportHeight,
    };

    const hitItem = this.paperRenderer.hitTest(viewportPoint);
    
    if (hitItem) {
      // If clicking on a path, select it and start dragging
      this.selectedItem = hitItem;
      this.isDragging = true;
      this.dragStartPoint = viewportPoint;
    } else {
      // Clicking on empty space deselects
      this.selectedItem = null;
      this.isDragging = false;
      this.dragStartPoint = null;
    }
    
    this.drawSelectionUI();
  }

  private handleSelectMove(point: { x: number; y: number }) {
    if (!this.isDragging || !this.selectedItem || !this.dragStartPoint) return;

    // Convert pixel canvas coordinates to viewport coordinates
    const viewportPoint = {
      x: (point.x / this.config.pixelWidth) * this.config.viewportWidth,
      y: (point.y / this.config.pixelHeight) * this.config.viewportHeight,
    };

    // Calculate delta from last position
    const delta = {
      x: viewportPoint.x - this.dragStartPoint.x,
      y: viewportPoint.y - this.dragStartPoint.y,
    };

    // Move the selected item
    this.paperRenderer.movePath(this.selectedItem, delta);
    this.dragStartPoint = viewportPoint;
    
    this.drawSelectionUI();
  }

  private handleSelectEnd() {
    this.isDragging = false;
    this.dragStartPoint = null;
    this.drawSelectionUI();
  }

  private drawSelectionUI() {
    // Clear UI canvas
    this.uiCanvas2D.clearRect(0, 0, this.config.viewportWidth, this.config.viewportHeight);
    
    // Draw selection indicator if something is selected
    if (this.selectedItem) {
      this.paperRenderer.drawSelection(this.selectedItem, this.uiCanvas2D);
    }
  }

  private onPointerMove(point: { x: number; y: number; pressure?: number }) {
    // Always update cursor position, even when not drawing
    this.uiOverlay.updateCursor(point);
  }

  private onBrushSizeChange(min: number, max: number) {
    this.pixelCanvasManager.setBrushSizeRange(min, max);
    this.uiOverlay.setMaxBrushSize(max);
  }

  private onBrushColorChange(color: string) {
    this.brushColor = color;
    // Apply color to pixel canvas for visual feedback
    // Tracer will convert any visible pixel to black before potrace
    this.pixelCanvasManager.setBrushColor(color);
  }

  private onPixelResChange(scale: number) {
    this.pixelResScale = scale;
    this.config = this.calculateConfig();
    this.resizeCanvases();
    this.pixelCanvasManager.updateConfig(this.config);
    this.pixelCanvasManager.clear(); // Clear pixel canvas when resolution changes
    this.uiOverlay.updateConfig(this.config);
    this.inputHandler.updateConfig(this.config);
    this.paperRenderer.updateConfig(this.config);
  }

  private onClear() {
    this.pixelCanvasManager.clear();
    this.paperRenderer.clear();
  }

  private onCursorToggleChange(enabled: boolean) {
    this.uiOverlay.setCursorEnabled(enabled);
  }

  private onModeChange(mode: DrawMode) {
    this.currentMode = mode;
  }

  private onToolChange(tool: DrawTool) {
    this.currentTool = tool;
    
    // Clear selection when switching away from select tool
    if (tool !== 'select') {
      this.selectedItem = null;
      this.isDragging = false;
      this.dragStartPoint = null;
      // Clear selection UI
      this.uiCanvas2D.clearRect(0, 0, this.config.viewportWidth, this.config.viewportHeight);
    }
  }

  private onFlatten() {
    this.paperRenderer.flatten();
    // Clear selection after flatten as items may have changed
    this.selectedItem = null;
    this.drawSelectionUI();
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    const app = new App();
    await app.init();
  });
} else {
  (async () => {
    const app = new App();
    await app.init();
  })();
}
