/**
 * Main Application Orchestrator
 *
 * Central coordinator that:
 * - Initializes all three canvases and their contexts
 * - Creates and wires up all component modules
 * - Manages the complete drawing lifecycle (start → move → end → trace → render)
 * - Handles window resize events and updates all components
 * - Auto-calculates pixel canvas resolution (~8x downscale from viewport)
 * - Manages camera system for pan/zoom functionality
 *
 * Key responsibilities:
 * - Component initialization and dependency injection
 * - Event flow coordination between UnifiedInputManager → PixelCanvas → Tracer → PaperRenderer
 * - Canvas sizing and configuration management
 * - Camera transformation management
 * - Tool and modifier state management
 */
import { init, potrace } from "esm-potrace-wasm";
import paper from "paper";
import { UnifiedInputManager } from "./unified-input";
import { PixelCanvas } from "./pixel-canvas";
import { Tracer } from "./tracer";
import { PaperRenderer } from "./paper-renderer";
import { UIOverlay } from "./ui-overlay";
import { Camera } from "./camera";
import type { CanvasConfig, DrawTool, Point, ToolSettings, Modifiers } from "./types";
import type {
  InkwellColorPanel,
  InkwellHSLPanel,
  InkwellOKHSLRectPanel,
  InkwellToolsPanel,
  InkwellToolSettingsPanel,
  InkwellUniversalPanel,
} from "./ui-lib";
import "./ui-lib"; // Register Lit components

class App {
  private paperCanvas: HTMLCanvasElement;
  private pixelCanvas: HTMLCanvasElement;
  private uiCanvas: HTMLCanvasElement;
  private pixelCanvas2D: CanvasRenderingContext2D;
  private uiCanvas2D: CanvasRenderingContext2D;
  private config: CanvasConfig;
  private inputManager: UnifiedInputManager;
  private pixelCanvasManager: PixelCanvas;
  private tracer: Tracer;
  private paperRenderer: PaperRenderer;
  private uiOverlay: UIOverlay;
  private colorPanel: InkwellColorPanel;
  private hslPanel: InkwellHSLPanel;
  private okhslPanel: InkwellOKHSLRectPanel;
  private toolsPanel: InkwellToolsPanel;
  private toolSettingsPanel: InkwellToolSettingsPanel;
  private universalPanel: InkwellUniversalPanel;
  private camera: Camera;
  private isInitialized = false;
  private pixelResScale = 2;

  // Selection tool state
  private selectedItem: paper.Item | null = null;
  private isDragging = false;
  private dragStartPoint: Point | null = null;
  private didMove = false;

  constructor() {
    // Get canvas elements
    this.paperCanvas = document.getElementById("paper-canvas") as HTMLCanvasElement;
    this.pixelCanvas = document.getElementById("pixel-canvas") as HTMLCanvasElement;
    this.uiCanvas = document.getElementById("ui-canvas") as HTMLCanvasElement;

    if (!this.paperCanvas || !this.pixelCanvas || !this.uiCanvas) {
      throw new Error("Canvas elements not found");
    }

    // Get 2D contexts
    const pixelCtx = this.pixelCanvas.getContext("2d");
    const uiCtx = this.uiCanvas.getContext("2d");

    if (!pixelCtx || !uiCtx) {
      throw new Error("Could not get 2D contexts");
    }

    this.pixelCanvas2D = pixelCtx;
    this.uiCanvas2D = uiCtx;

    // Calculate configuration
    this.config = this.calculateConfig();

    // Initialize camera
    this.camera = new Camera(this.config.viewportWidth, this.config.viewportHeight);

    // Initialize components
    this.pixelCanvasManager = new PixelCanvas(this.pixelCanvas, this.pixelCanvas2D, this.config);
    this.tracer = new Tracer(potrace);
    this.paperRenderer = new PaperRenderer(this.paperCanvas, this.config);
    this.paperRenderer.setCamera(this.camera);
    this.uiOverlay = new UIOverlay(this.uiCanvas, this.uiCanvas2D, this.config);
    this.uiOverlay.setCamera(this.camera);

    // Get panel Lit elements
    this.colorPanel = document.getElementById("color-panel") as InkwellColorPanel;
    this.hslPanel = document.getElementById("hsl-panel") as InkwellHSLPanel;
    this.okhslPanel = document.getElementById("okhsl-rect-panel") as InkwellOKHSLRectPanel;
    this.toolsPanel = document.getElementById("tools-panel") as InkwellToolsPanel;
    this.toolSettingsPanel = document.getElementById("tool-settings-panel") as InkwellToolSettingsPanel;
    this.universalPanel = document.getElementById("universal-panel") as InkwellUniversalPanel;
    this.setupPanelEvents();

    // Initialize unified input manager
    this.inputManager = new UnifiedInputManager(this.uiCanvas, this.config, {
      onToolStart: this.onToolStart.bind(this),
      onToolMove: this.onToolMove.bind(this),
      onToolEnd: this.onToolEnd.bind(this),
      onToolCancel: this.onToolCancel.bind(this),
      onPointerMove: this.onPointerMove.bind(this),
      onCameraPan: this.onCameraPan.bind(this),
      onCameraZoom: this.onCameraZoom.bind(this),
      onCameraRotate: this.onCameraRotate.bind(this),
      onToolChange: this.onInputToolChange.bind(this),
      onModifiersChange: this.onModifiersChange.bind(this),
    });
  }

  private setupPanelEvents() {
    // Color panel events (HSV wheel)
    this.colorPanel.addEventListener("color-change", (e: Event) => {
      const color = (e as CustomEvent<string>).detail;
      this.hslPanel.color = color; // Sync HSL panel
      this.okhslPanel.color = color; // Sync OKHSL panel
      this.toolSettingsPanel.toolSettings = {
        ...this.toolSettingsPanel.toolSettings,
        brush: { ...this.toolSettingsPanel.toolSettings.brush, color },
      };
      this.onToolSettingsChange(this.toolSettingsPanel.toolSettings);
    });

    // HSL panel events
    this.hslPanel.addEventListener("color-change", (e: Event) => {
      const color = (e as CustomEvent<string>).detail;
      this.colorPanel.color = color; // Sync HSV panel
      this.okhslPanel.color = color; // Sync OKHSL panel
      this.toolSettingsPanel.toolSettings = {
        ...this.toolSettingsPanel.toolSettings,
        brush: { ...this.toolSettingsPanel.toolSettings.brush, color },
      };
      this.onToolSettingsChange(this.toolSettingsPanel.toolSettings);
    });

    // OKHSL panel events
    this.okhslPanel.addEventListener("color-change", (e: Event) => {
      const color = (e as CustomEvent<string>).detail;
      this.colorPanel.color = color; // Sync HSV panel
      this.hslPanel.color = color; // Sync HSL panel
      this.toolSettingsPanel.toolSettings = {
        ...this.toolSettingsPanel.toolSettings,
        brush: { ...this.toolSettingsPanel.toolSettings.brush, color },
      };
      this.onToolSettingsChange(this.toolSettingsPanel.toolSettings);
    });

    // Tools panel events
    this.toolsPanel.addEventListener("tool-change", (e: Event) => {
      const tool = (e as CustomEvent<DrawTool>).detail;
      this.toolSettingsPanel.currentTool = tool;
      this.onToolChange(tool);
      this.inputManager.setTool(tool);
    });

    // Tool settings panel events
    this.toolSettingsPanel.addEventListener("settings-change", (e: Event) => {
      const settings = (e as CustomEvent<ToolSettings>).detail;
      this.colorPanel.color = settings.brush.color;
      this.hslPanel.color = settings.brush.color;
      this.okhslPanel.color = settings.brush.color;
      this.onToolSettingsChange(settings);
    });

    this.toolSettingsPanel.addEventListener("pixel-res-change", (e: Event) => {
      this.onPixelResChange((e as CustomEvent<number>).detail);
    });

    // Universal panel events
    this.universalPanel.addEventListener("cursor-toggle", (e: Event) => {
      this.uiOverlay.setCursorEnabled((e as CustomEvent<boolean>).detail);
    });

    this.universalPanel.addEventListener("zoom-in", () => this.onZoomIn());
    this.universalPanel.addEventListener("zoom-out", () => this.onZoomOut());
    this.universalPanel.addEventListener("zoom-reset", () => this.onZoomReset());
    this.universalPanel.addEventListener("rotate-cw", () => this.onRotateCW());
    this.universalPanel.addEventListener("rotate-ccw", () => this.onRotateCCW());
    this.universalPanel.addEventListener("rotate-reset", () => this.onRotateReset());
    this.universalPanel.addEventListener("flatten", () => this.onFlatten());
    this.universalPanel.addEventListener("clear", () => this.onClear());
  }

  private calculateConfig(): CanvasConfig {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const pixelWidth = Math.floor(viewportWidth / this.pixelResScale);
    const pixelHeight = Math.floor(viewportHeight / this.pixelResScale);

    return { pixelWidth, pixelHeight, viewportWidth, viewportHeight };
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
      this.paperRenderer.applyCamera();
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

    // Apply initial camera transformation
    this.paperRenderer.applyCamera();
    this.updateDisplays();

    // Initialize brush settings from tool settings panel
    const brushSettings = this.toolSettingsPanel.toolSettings.brush;
    this.pixelCanvasManager.setBrushSizeRange(brushSettings.sizeMin, brushSettings.sizeMax);
    this.uiOverlay.setMaxBrushSize(brushSettings.sizeMax);
    this.pixelCanvasManager.setBrushColor(brushSettings.color);
    this.colorPanel.color = brushSettings.color;

    // Handle window resize
    window.addEventListener("resize", () => {
      this.config = this.calculateConfig();
      this.camera.updateViewport(this.config.viewportWidth, this.config.viewportHeight);
      this.resizeCanvases();
      this.pixelCanvasManager.updateConfig(this.config);
      this.uiOverlay.updateConfig(this.config);
      this.inputManager.updateConfig(this.config);
      this.paperRenderer.updateConfig(this.config);
    });

    console.log("App initialized with Lit UI components");
  }

  // ============================================================
  // Display Updates
  // ============================================================

  private updateDisplays() {
    this.universalPanel.zoomLevel = this.camera.getZoomPercent();
    this.universalPanel.rotation = this.camera.getRotationDegrees();
  }

  // ============================================================
  // Camera Control Handlers
  // ============================================================

  private onCameraPan(deltaX: number, deltaY: number) {
    this.camera.pan(deltaX, deltaY);
    this.paperRenderer.applyCamera();
    this.drawSelectionUI();
  }

  private onCameraZoom(factor: number, centerX: number, centerY: number) {
    this.camera.zoomAt(factor, centerX, centerY);
    this.paperRenderer.applyCamera();
    this.updateDisplays();
    this.drawSelectionUI();
  }

  private onCameraRotate(deltaRadians: number, centerX: number, centerY: number) {
    this.camera.rotateAt(deltaRadians, centerX, centerY);
    this.paperRenderer.applyCamera();
    this.updateDisplays();
    this.drawSelectionUI();
  }

  private onZoomIn() {
    this.camera.zoomCenter(1.25);
    this.paperRenderer.applyCamera();
    this.updateDisplays();
    this.drawSelectionUI();
  }

  private onZoomOut() {
    this.camera.zoomCenter(0.8);
    this.paperRenderer.applyCamera();
    this.updateDisplays();
    this.drawSelectionUI();
  }

  private onZoomReset() {
    this.camera.reset();
    this.paperRenderer.applyCamera();
    this.updateDisplays();
    this.drawSelectionUI();
  }

  private onRotateCW() {
    this.camera.rotateCenterDegrees(15);
    this.paperRenderer.applyCamera();
    this.updateDisplays();
    this.drawSelectionUI();
  }

  private onRotateCCW() {
    this.camera.rotateCenterDegrees(-15);
    this.paperRenderer.applyCamera();
    this.updateDisplays();
    this.drawSelectionUI();
  }

  private onRotateReset() {
    this.camera.resetRotation();
    this.paperRenderer.applyCamera();
    this.updateDisplays();
    this.drawSelectionUI();
  }

  // ============================================================
  // Tool Action Handlers (from UnifiedInputManager)
  // ============================================================

  private onToolStart(point: Point, tool: DrawTool) {
    if (tool === "pan") return;

    if (tool === "select") {
      this.handleSelectStart(point);
      return;
    }

    // Brush or Lasso
    if (tool === "lasso") {
      this.pixelCanvasManager.startLasso(point);
    } else {
      this.pixelCanvasManager.startStroke(point);
    }
    this.uiOverlay.setDrawingState(true);
    this.uiOverlay.updateCursor(point);
  }

  private onToolMove(point: Point, tool: DrawTool) {
    if (tool === "pan") return;

    if (tool === "select") {
      this.handleSelectMove(point);
      return;
    }

    if (tool === "lasso") {
      this.pixelCanvasManager.addLassoPoint(point);
    } else {
      this.pixelCanvasManager.addPoint(point);
    }
    this.uiOverlay.updateCursor(point);
  }

  private async onToolEnd(tool: DrawTool) {
    if (tool === "pan") return;

    if (tool === "select") {
      this.handleSelectEnd();
      return;
    }

    this.uiOverlay.setDrawingState(false);

    const stroke =
      tool === "lasso"
        ? this.pixelCanvasManager.endLasso()
        : this.pixelCanvasManager.endStroke();

    if (!stroke || stroke.points.length === 0) return;

    try {
      const svg = await this.tracer.trace(this.pixelCanvas);
      if (svg) {
        const effectiveMode = this.getEffectiveMode(tool === "lasso" ? "lasso" : "brush");

        if (effectiveMode === "add") {
          const brushSettings = this.toolSettingsPanel.toolSettings.brush;
          await this.paperRenderer.addPath(svg, brushSettings.color);
        } else {
          await this.paperRenderer.subtractPath(svg);
        }
        this.pixelCanvasManager.clear();
      }
    } catch (error) {
      console.error("Tracing failed:", error);
    }
  }

  private getEffectiveMode(tool: "brush" | "lasso"): "add" | "subtract" {
    const baseMode = this.toolSettingsPanel.toolSettings[tool].mode;
    return this.toolSettingsPanel.modifiers.shift
      ? baseMode === "add"
        ? "subtract"
        : "add"
      : baseMode;
  }

  private onToolCancel(tool: DrawTool) {
    if (tool === "pan") return;

    if (tool === "select") {
      this.isDragging = false;
      this.dragStartPoint = null;
      this.drawSelectionUI();
      return;
    }

    this.uiOverlay.setDrawingState(false);
    if (tool === "lasso") {
      this.pixelCanvasManager.endLasso();
    } else {
      this.pixelCanvasManager.endStroke();
    }
    this.pixelCanvasManager.clear();
  }

  private onPointerMove(point: Point) {
    this.uiOverlay.updateCursor(point);

    if (this.toolsPanel.currentTool === "select" && this.selectedItem) {
      this.paperRenderer.drawSelection(this.selectedItem, this.uiCanvas2D);
    }
  }

  // ============================================================
  // Selection Tool Handlers
  // ============================================================

  private placeCurrentSelection(): void {
    if (this.selectedItem && this.didMove) {
      this.paperRenderer.placeSelection(this.selectedItem as paper.PathItem);
    }
    this.selectedItem = null;
    this.didMove = false;
  }

  private handleSelectStart(point: Point) {
    const viewportPoint = {
      x: (point.x / this.config.pixelWidth) * this.config.viewportWidth,
      y: (point.y / this.config.pixelHeight) * this.config.viewportHeight,
    };

    let hitItem = this.paperRenderer.hitTest(viewportPoint);

    if (hitItem) {
      if (this.selectedItem && hitItem !== this.selectedItem) {
        this.placeCurrentSelection();
        hitItem = this.paperRenderer.hitTest(viewportPoint);

        if (!hitItem) {
          this.isDragging = false;
          this.dragStartPoint = null;
          this.drawSelectionUI();
          return;
        }
      }

      this.selectedItem = hitItem;
      this.isDragging = true;
      this.dragStartPoint = viewportPoint;
      this.didMove = false;
      this.paperRenderer.bringToFront(hitItem);
    } else {
      this.placeCurrentSelection();
      this.isDragging = false;
      this.dragStartPoint = null;
    }

    this.drawSelectionUI();
  }

  private handleSelectMove(point: Point) {
    if (!this.isDragging || !this.selectedItem || !this.dragStartPoint) return;

    const viewportPoint = {
      x: (point.x / this.config.pixelWidth) * this.config.viewportWidth,
      y: (point.y / this.config.pixelHeight) * this.config.viewportHeight,
    };

    const screenDelta = {
      x: viewportPoint.x - this.dragStartPoint.x,
      y: viewportPoint.y - this.dragStartPoint.y,
    };

    const worldDelta = this.camera.screenDeltaToWorld(screenDelta.x, screenDelta.y);

    if (worldDelta.x !== 0 || worldDelta.y !== 0) {
      this.didMove = true;
      this.paperRenderer.movePath(this.selectedItem, worldDelta);
      this.dragStartPoint = viewportPoint;
    }

    this.drawSelectionUI();
  }

  private handleSelectEnd() {
    this.isDragging = false;
    this.dragStartPoint = null;
    this.drawSelectionUI();
  }

  private drawSelectionUI() {
    this.uiOverlay.redraw();

    if (this.selectedItem) {
      this.paperRenderer.drawSelection(this.selectedItem, this.uiCanvas2D);
    }
  }

  // ============================================================
  // Control Panel Handlers
  // ============================================================

  private onToolChange(tool: DrawTool) {
    // Place selection when switching away from select tool
    if (this.toolsPanel.currentTool === "select" && tool !== "select") {
      this.placeCurrentSelection();
      this.isDragging = false;
      this.dragStartPoint = null;
      this.drawSelectionUI();
    }
  }

  private onToolSettingsChange(settings: ToolSettings) {
    this.pixelCanvasManager.setBrushSizeRange(settings.brush.sizeMin, settings.brush.sizeMax);
    this.uiOverlay.setMaxBrushSize(settings.brush.sizeMax);
    this.pixelCanvasManager.setBrushColor(settings.brush.color);
  }

  private onPixelResChange(scale: number) {
    this.pixelResScale = scale;
    this.config = this.calculateConfig();
    this.resizeCanvases();
    this.pixelCanvasManager.updateConfig(this.config);
    this.pixelCanvasManager.clear();
    this.uiOverlay.updateConfig(this.config);
    this.inputManager.updateConfig(this.config);
    this.paperRenderer.updateConfig(this.config);
  }

  private onFlatten() {
    this.paperRenderer.flatten();
    this.selectedItem = null;
    this.drawSelectionUI();
  }

  private onClear() {
    this.pixelCanvasManager.clear();
    this.paperRenderer.clear();
  }

  // ============================================================
  // Input Manager Handlers
  // ============================================================

  private onInputToolChange(tool: DrawTool) {
    // Tool changed via hotkey - sync with panels
    this.toolsPanel.currentTool = tool;
    this.toolSettingsPanel.currentTool = tool;
  }

  private onModifiersChange(modifiers: Modifiers) {
    this.toolSettingsPanel.modifiers = modifiers;
  }
}

// Initialize app when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", async () => {
    const app = new App();
    await app.init();
  });
} else {
  (async () => {
    const app = new App();
    await app.init();
  })();
}
