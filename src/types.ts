/**
 * Type Definitions
 *
 * Shared TypeScript interfaces used across all modules:
 * - Point: x, y coordinates with optional pressure (for iPad Pencil)
 * - Stroke: Collection of points plus brush size metadata
 * - CanvasConfig: Viewport and pixel canvas dimensions for coordinate mapping
 * - ToolSettings: Per-tool configuration
 * - Modifiers: Keyboard modifier key state
 */
export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface Stroke {
  points: Point[];
  brushSize: number;
}

export interface CanvasConfig {
  pixelWidth: number;
  pixelHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

export type DrawMode = "add" | "subtract";
export type DrawTool = "brush" | "lasso" | "select" | "pan";

/**
 * Per-tool settings configuration
 */
export interface BrushSettings {
  mode: DrawMode;
  sizeMin: number;
  sizeMax: number;
  color: string;
}

export interface LassoSettings {
  mode: DrawMode;
}

export interface SelectSettings {
  // No settings for now
}

export interface PanSettings {
  // No settings for now
}

export interface ToolSettings {
  brush: BrushSettings;
  lasso: LassoSettings;
  select: SelectSettings;
  pan: PanSettings;
}

/**
 * Keyboard modifier key state
 */
export interface Modifiers {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
}

/**
 * Pointer information for tracking active inputs
 */
export interface PointerInfo {
  id: number;
  x: number;
  y: number;
  pressure: number;
  pointerType: "mouse" | "touch" | "pen";
  button: number;
}
