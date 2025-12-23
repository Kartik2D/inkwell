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
import { SelectionController } from "./selection-controller";
import { HistoryManager } from "./history";
import { bus, Events } from "./event-bus";
import type { CanvasConfig, Point, Modifiers } from "./types";
import type { ToolId, AllToolSettings } from "./tools";
import type {
  InkwellToolsPanel,
  InkwellToolSettingsPanel,
  InkwellUniversalPanel,
} from "../ui/ui-lib";
import "../ui/ui-lib"; // Register Lit components
import {
  colorStore,
  toolStore,
  configStore,
  modifiersStore,
  toolSettingsStore,
} from "./stores";

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
  private selectionController: SelectionController;
  private historyManager: HistoryManager;
  private toolsPanel: InkwellToolsPanel;
  private toolSettingsPanel: InkwellToolSettingsPanel;
  private universalPanel: InkwellUniversalPanel;
  private camera: Camera;
  private isInitialized = false;
  private pixelResScale = 2;

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
    this.selectionController = new SelectionController(
      this.paperRenderer,
      this.camera,
      this.uiOverlay,
      this.uiCanvas2D,
    );
    this.historyManager = new HistoryManager();
    this.selectionController.setSnapshotCallback(() => this.historyManager.snapshot());

    // Get panel Lit elements
    this.toolsPanel = document.getElementById("tools-panel") as InkwellToolsPanel;
    this.toolSettingsPanel = document.getElementById("tool-settings-panel") as InkwellToolSettingsPanel;
    this.universalPanel = document.getElementById("universal-panel") as InkwellUniversalPanel;
    this.setupPanelEvents();

    // Initialize unified input manager
    this.inputManager = new UnifiedInputManager(this.uiCanvas, this.config);
    this.subscribeToInputEvents();
  }

  private subscribeToInputEvents() {
    bus.on(Events.TOOL_START, (d: { point: Point; tool: ToolId }) => this.onToolStart(d.point, d.tool));
    bus.on(Events.TOOL_MOVE, (d: { point: Point; tool: ToolId }) => this.onToolMove(d.point, d.tool));
    bus.on(Events.TOOL_END, (tool: ToolId) => this.onToolEnd(tool));
    bus.on(Events.TOOL_CANCEL, (tool: ToolId) => this.onToolCancel(tool));
    bus.on(Events.POINTER_MOVE, (point: Point) => this.onPointerMove(point));
    bus.on(Events.CAMERA_PAN, (d: { deltaX: number; deltaY: number }) => this.onCameraPan(d.deltaX, d.deltaY));
    bus.on(Events.CAMERA_ZOOM, (d: { factor: number; x: number; y: number }) => this.onCameraZoom(d.factor, d.x, d.y));
    bus.on(Events.CAMERA_ROTATE, (d: { delta: number; x: number; y: number }) => this.onCameraRotate(d.delta, d.x, d.y));
    bus.on(Events.TOOL_CHANGE, (tool: ToolId) => this.onInputToolChange(tool));
    bus.on(Events.MODIFIERS_CHANGE, (m: Modifiers) => this.onModifiersChange(m));
    bus.on(Events.UNDO, () => this.onUndo());
    bus.on(Events.REDO, () => this.onRedo());
  }

  private setupPanelEvents() {
    // Tools panel events - sync to inputManager and handle selection placement
    this.toolsPanel.addEventListener("tool-change", (e: Event) => {
      const tool = (e as CustomEvent<ToolId>).detail;
      this.onToolChange(tool);
      this.inputManager.setTool(tool);
    });

    // Tool settings panel events - apply brush settings
    this.toolSettingsPanel.addEventListener("settings-change", (e: Event) => {
      const settings = (e as CustomEvent<AllToolSettings>).detail;
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
    this.universalPanel.addEventListener("undo", () => this.onUndo());
    this.universalPanel.addEventListener("redo", () => this.onRedo());
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

    // Set up store subscriptions
    this.setupStoreSubscriptions();

    // Initialize stores with current values
    configStore.set(this.config);
    
    // Apply initial brush color to pixel canvas from color store
    this.pixelCanvasManager.setBrushColor(colorStore.get());

    // Handle window resize - now uses configStore for propagation
    window.addEventListener("resize", () => {
      this.config = this.calculateConfig();
      this.camera.updateViewport(this.config.viewportWidth, this.config.viewportHeight);
      this.resizeCanvases();
      configStore.set(this.config); // Propagates to all subscribers
    });

    // Take initial history snapshot (empty canvas state)
    this.historyManager.snapshot();

    console.log("App initialized with Lit UI components and stores");
  }

  private setupStoreSubscriptions() {
    // Color store - update pixel canvas brush color for preview
    colorStore.subscribe((color) => {
      this.pixelCanvasManager.setBrushColor(color);
    });

    // Config store - propagate to all components that need it
    configStore.subscribe((config) => {
      this.pixelCanvasManager.updateConfig(config);
      this.uiOverlay.updateConfig(config);
      this.inputManager.updateConfig(config);
      this.paperRenderer.updateConfig(config);
    });

    // Tool settings store - update UI overlay with brush max size
    toolSettingsStore.subscribe((settings) => {
      const brushSettings = settings.brush as { sizeMax?: number };
      if (brushSettings.sizeMax !== undefined) {
        this.uiOverlay.setMaxBrushSize(brushSettings.sizeMax);
      }
    });

    // Tool store - sync with inputManager
    toolStore.subscribe((tool) => {
      this.inputManager.setTool(tool);
    });
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
    this.selectionController.drawUI();
  }

  private onCameraZoom(factor: number, centerX: number, centerY: number) {
    this.camera.zoomAt(factor, centerX, centerY);
    this.paperRenderer.applyCamera();
    this.updateDisplays();
    this.selectionController.drawUI();
  }

  private onCameraRotate(deltaRadians: number, centerX: number, centerY: number) {
    this.camera.rotateAt(deltaRadians, centerX, centerY);
    this.paperRenderer.applyCamera();
    this.updateDisplays();
    this.selectionController.drawUI();
  }

  private onZoomIn() {
    this.camera.zoomCenter(1.25);
    this.paperRenderer.applyCamera();
    this.updateDisplays();
    this.selectionController.drawUI();
  }

  private onZoomOut() {
    this.camera.zoomCenter(0.8);
    this.paperRenderer.applyCamera();
    this.updateDisplays();
    this.selectionController.drawUI();
  }

  private onZoomReset() {
    this.camera.reset();
    this.paperRenderer.applyCamera();
    this.updateDisplays();
    this.selectionController.drawUI();
  }

  private onRotateCW() {
    this.camera.rotateCenterDegrees(15);
    this.paperRenderer.applyCamera();
    this.updateDisplays();
    this.selectionController.drawUI();
  }

  private onRotateCCW() {
    this.camera.rotateCenterDegrees(-15);
    this.paperRenderer.applyCamera();
    this.updateDisplays();
    this.selectionController.drawUI();
  }

  private onRotateReset() {
    this.camera.resetRotation();
    this.paperRenderer.applyCamera();
    this.updateDisplays();
    this.selectionController.drawUI();
  }

  // ============================================================
  // Tool Action Handlers (from UnifiedInputManager)
  // ============================================================

  private onToolStart(point: Point, tool: ToolId) {
    if (tool === "pan") return;

    if (tool === "select") {
      this.selectionController.handleStart(point);
      return;
    }

    // Delegate to tool behavior via PixelCanvas
    const settings = toolSettingsStore.get();
    this.pixelCanvasManager.startTool(tool, point, settings);
    this.uiOverlay.setDrawingState(true);
    this.uiOverlay.updateCursor(point);
  }

  private onToolMove(point: Point, tool: ToolId) {
    if (tool === "pan") return;

    if (tool === "select") {
      this.selectionController.handleMove(point);
      return;
    }

    // Delegate to tool behavior via PixelCanvas
    const settings = toolSettingsStore.get();
    this.pixelCanvasManager.moveTool(tool, point, settings);
    this.uiOverlay.updateCursor(point);
  }

  private async onToolEnd(tool: ToolId) {
    if (tool === "pan") return;

    if (tool === "select") {
      this.selectionController.handleEnd();
      return;
    }

    this.uiOverlay.setDrawingState(false);

    // Delegate to tool behavior via PixelCanvas
    const settings = toolSettingsStore.get();
    const stroke = this.pixelCanvasManager.endTool(tool, settings);

    if (!stroke || stroke.points.length === 0) return;

    try {
      const svg = await this.tracer.trace(this.pixelCanvas);
      if (svg) {
        const effectiveMode = this.getEffectiveMode(tool);

        if (effectiveMode === "add") {
          const color = colorStore.get();
          await this.paperRenderer.addPath(svg, color);
        } else {
          await this.paperRenderer.subtractPath(svg);
        }
        this.pixelCanvasManager.clear();
        this.historyManager.snapshot(); // Record history after drawing
      }
    } catch (error) {
      console.error("Tracing failed:", error);
    }
  }

  private getEffectiveMode(tool: ToolId): "add" | "subtract" {
    const settings = toolSettingsStore.get();
    const modifiers = modifiersStore.get();
    const toolSettings = settings[tool] as { mode?: string };
    const baseMode = toolSettings.mode ?? "add";
    return modifiers.shift
      ? baseMode === "add"
        ? "subtract"
        : "add"
      : (baseMode as "add" | "subtract");
  }

  private onToolCancel(tool: ToolId) {
    if (tool === "pan") return;

    if (tool === "select") {
      this.selectionController.handleCancel();
      return;
    }

    this.uiOverlay.setDrawingState(false);
    // End the tool action without tracing
    const settings = toolSettingsStore.get();
    this.pixelCanvasManager.endTool(tool, settings);
    this.pixelCanvasManager.clear();
  }

  private onPointerMove(point: Point) {
    this.uiOverlay.updateCursor(point);

    if (toolStore.get() === "select" && this.selectionController.hasSelection()) {
      this.selectionController.drawUI();
    }
  }

  // ============================================================
  // Control Panel Handlers
  // ============================================================

  private onToolChange(tool: ToolId) {
    // Place selection when switching away from select tool
    const prevTool = toolStore.get();
    if (prevTool === "select" && tool !== "select") {
      this.selectionController.clearSelection();
    }
  }

  private onToolSettingsChange(settings: AllToolSettings) {
    // Update UI overlay with brush max size if available
    const brushSettings = settings.brush as { sizeMax?: number };
    if (brushSettings.sizeMax !== undefined) {
      this.uiOverlay.setMaxBrushSize(brushSettings.sizeMax);
    }
  }

  private onPixelResChange(scale: number) {
    this.pixelResScale = scale;
    this.config = this.calculateConfig();
    this.resizeCanvases();
    this.pixelCanvasManager.clear();
    configStore.set(this.config); // Propagates to all subscribers
  }

  private onFlatten() {
    this.paperRenderer.flatten();
    this.selectionController.clearSelection();
    this.historyManager.snapshot();
  }

  private onClear() {
    this.pixelCanvasManager.clear();
    this.paperRenderer.clear();
    this.historyManager.clear(); // Clear history when canvas is cleared
  }

  // ============================================================
  // Input Manager Handlers
  // ============================================================

  private onInputToolChange(tool: ToolId) {
    // Tool changed via hotkey - update store (panels subscribe to it)
    toolStore.set(tool);
  }

  private onModifiersChange(modifiers: Modifiers) {
    // Update modifiers store (panels subscribe to it)
    modifiersStore.set(modifiers);
  }

  // ============================================================
  // History (Undo/Redo) Handlers
  // ============================================================

  private onUndo() {
    if (this.historyManager.undo()) {
      this.selectionController.clearSelection();
    }
  }

  private onRedo() {
    if (this.historyManager.redo()) {
      this.selectionController.clearSelection();
    }
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
