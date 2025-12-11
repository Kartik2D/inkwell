/**
 * Type Definitions
 * 
 * Shared TypeScript interfaces used across all modules:
 * - Point: x, y coordinates with optional pressure (for iPad Pencil)
 * - Stroke: Collection of points plus brush size metadata
 * - CanvasConfig: Viewport and pixel canvas dimensions for coordinate mapping
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

export type DrawMode = 'add' | 'subtract';
export type DrawTool = 'brush' | 'lasso' | 'select';

