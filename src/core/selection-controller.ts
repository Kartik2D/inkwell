/**
 * Selection Controller
 *
 * Manages the selection tool state and interactions.
 * Handles selecting, dragging, and placing paths on the canvas.
 *
 * Extracted from App.ts to reduce complexity and improve maintainability.
 */
import type { Point, CanvasConfig } from "./types";
import type { PaperRenderer } from "./paper-renderer";
import type { Camera } from "./camera";
import type { UIOverlay } from "./ui-overlay";
import { configStore } from "./stores";

export class SelectionController {
  private selectedItem: paper.Item | null = null;
  private isDragging = false;
  private dragStartPoint: Point | null = null;
  private didMove = false;
  private config: CanvasConfig;
  private onSnapshot?: () => void;

  private paperRenderer: PaperRenderer;
  private camera: Camera;
  private uiOverlay: UIOverlay;
  private uiCanvas2D: CanvasRenderingContext2D;

  constructor(
    paperRenderer: PaperRenderer,
    camera: Camera,
    uiOverlay: UIOverlay,
    uiCanvas2D: CanvasRenderingContext2D,
  ) {
    this.paperRenderer = paperRenderer;
    this.camera = camera;
    this.uiOverlay = uiOverlay;
    this.uiCanvas2D = uiCanvas2D;
    this.config = configStore.get();
    configStore.subscribe((config) => {
      this.config = config;
    });
  }

  /**
   * Set a callback to be called when a snapshot should be taken
   * (i.e., when a selection is placed)
   */
  setSnapshotCallback(callback: () => void): void {
    this.onSnapshot = callback;
  }

  /**
   * Get the currently selected item
   */
  getSelectedItem(): paper.Item | null {
    return this.selectedItem;
  }

  /**
   * Check if there is an active selection
   */
  hasSelection(): boolean {
    return this.selectedItem !== null;
  }

  /**
   * Place the current selection (commit the move using add logic)
   * and clear the selection state
   */
  placeSelection(): void {
    if (this.selectedItem && this.didMove) {
      this.paperRenderer.placeSelection(this.selectedItem as paper.PathItem);
      // Take a snapshot after placing a moved selection
      this.onSnapshot?.();
    }
    this.selectedItem = null;
    this.didMove = false;
  }

  /**
   * Clear selection without placing (e.g., when switching tools)
   */
  clearSelection(): void {
    this.placeSelection();
    this.isDragging = false;
    this.dragStartPoint = null;
    this.drawUI();
  }

  /**
   * Handle selection tool start (pointer down)
   */
  handleStart(point: Point): void {
    const viewportPoint = this.pixelToViewport(point);

    let hitItem = this.paperRenderer.hitTest(viewportPoint);

    if (hitItem) {
      // If clicking on a different item, place current selection first
      if (this.selectedItem && hitItem !== this.selectedItem) {
        this.placeSelection();
        hitItem = this.paperRenderer.hitTest(viewportPoint);

        if (!hitItem) {
          this.isDragging = false;
          this.dragStartPoint = null;
          this.drawUI();
          return;
        }
      }

      this.selectedItem = hitItem;
      this.isDragging = true;
      this.dragStartPoint = viewportPoint;
      this.didMove = false;
      this.paperRenderer.bringToFront(hitItem);
    } else {
      // Clicked on empty space - place any current selection
      this.placeSelection();
      this.isDragging = false;
      this.dragStartPoint = null;
    }

    this.drawUI();
  }

  /**
   * Handle selection tool move (pointer move while dragging)
   */
  handleMove(point: Point): void {
    if (!this.isDragging || !this.selectedItem || !this.dragStartPoint) return;

    const viewportPoint = this.pixelToViewport(point);

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

    this.drawUI();
  }

  /**
   * Handle selection tool end (pointer up)
   */
  handleEnd(): void {
    this.isDragging = false;
    this.dragStartPoint = null;
    this.drawUI();
  }

  /**
   * Handle selection cancel (e.g., when transitioning to multitouch)
   */
  handleCancel(): void {
    this.isDragging = false;
    this.dragStartPoint = null;
    this.drawUI();
  }

  /**
   * Draw the selection UI (bounding box)
   */
  drawUI(): void {
    this.uiOverlay.redraw();

    if (this.selectedItem) {
      this.paperRenderer.drawSelection(this.selectedItem, this.uiCanvas2D);
    }
  }

  /**
   * Convert pixel canvas coordinates to viewport coordinates
   */
  private pixelToViewport(point: Point): Point {
    return {
      x: (point.x / this.config.pixelWidth) * this.config.viewportWidth,
      y: (point.y / this.config.pixelHeight) * this.config.viewportHeight,
    };
  }
}

