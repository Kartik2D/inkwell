/**
 * Camera - Viewport Transformation Manager
 *
 * Manages the camera state for infinite canvas functionality:
 * - Position (pan offset in world coordinates)
 * - Zoom level (scale factor)
 * - Rotation (angle in radians)
 * - Coordinate transformations between screen and world space
 *
 * The camera transforms the Paper Canvas (main drawing surface) while
 * keeping interaction canvases (pixel, UI) fixed to window coordinates.
 *
 * Coordinate Spaces:
 * - Screen Space: Window/viewport coordinates (0,0 at top-left of window)
 * - World Space: Infinite canvas coordinates (transformed by camera)
 *
 * Transformation (screen to world):
 * 1. Translate by -viewportCenter
 * 2. Scale by 1/zoom
 * 3. Rotate by -rotation
 * 4. Translate by +cameraPosition
 */

export interface CameraState {
  x: number; // Camera center position in world space
  y: number;
  zoom: number; // Zoom level (1.0 = 100%, 2.0 = 200%, 0.5 = 50%)
  rotation: number; // Rotation in radians (positive = clockwise)
}

export interface Point2D {
  x: number;
  y: number;
}

export class Camera {
  // Camera position (center of view in world coordinates)
  private x = 0;
  private y = 0;

  // Zoom level
  private _zoom = 1;

  // Rotation in radians
  private _rotation = 0;

  // Zoom constraints
  private minZoom = 0.1; // 10% minimum
  private maxZoom = 5; // 500% maximum (reduced from 1000% to avoid floating-point issues)

  // Viewport dimensions (updated on resize)
  private viewportWidth = 0;
  private viewportHeight = 0;

  constructor(viewportWidth: number, viewportHeight: number) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    // Start with camera centered at origin
    this.x = viewportWidth / 2;
    this.y = viewportHeight / 2;
  }

  /**
   * Update viewport dimensions (call on window resize)
   */
  updateViewport(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  /**
   * Get current zoom level
   */
  get zoom(): number {
    return this._zoom;
  }

  /**
   * Set zoom level with constraints
   */
  set zoom(value: number) {
    this._zoom = Math.max(this.minZoom, Math.min(this.maxZoom, value));
  }

  /**
   * Get current rotation in radians
   */
  get rotation(): number {
    return this._rotation;
  }

  /**
   * Set rotation in radians
   */
  set rotation(value: number) {
    // Normalize to [-PI, PI]
    this._rotation = Math.atan2(Math.sin(value), Math.cos(value));
  }

  /**
   * Get rotation in degrees
   */
  getRotationDegrees(): number {
    return (this._rotation * 180) / Math.PI;
  }

  /**
   * Set rotation in degrees
   */
  setRotationDegrees(degrees: number): void {
    this.rotation = (degrees * Math.PI) / 180;
  }

  /**
   * Get camera position
   */
  getPosition(): Point2D {
    return { x: this.x, y: this.y };
  }

  /**
   * Set camera position
   */
  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /**
   * Get full camera state
   */
  getState(): CameraState {
    return {
      x: this.x,
      y: this.y,
      zoom: this._zoom,
      rotation: this._rotation,
    };
  }

  /**
   * Restore camera state
   */
  setState(state: CameraState): void {
    this.x = state.x;
    this.y = state.y;
    this._zoom = Math.max(this.minZoom, Math.min(this.maxZoom, state.zoom));
    this._rotation = state.rotation;
  }

  /**
   * Convert screen coordinates to world coordinates
   *
   * @param screenX - X position in screen/viewport space
   * @param screenY - Y position in screen/viewport space
   * @returns Position in world space
   */
  screenToWorld(screenX: number, screenY: number): Point2D {
    // Step 1: Translate to viewport center
    const offsetX = screenX - this.viewportWidth / 2;
    const offsetY = screenY - this.viewportHeight / 2;

    // Step 2: Apply inverse zoom
    const scaledX = offsetX / this._zoom;
    const scaledY = offsetY / this._zoom;

    // Step 3: Apply inverse rotation (rotate by -rotation)
    const cos = Math.cos(-this._rotation);
    const sin = Math.sin(-this._rotation);
    const rotatedX = scaledX * cos - scaledY * sin;
    const rotatedY = scaledX * sin + scaledY * cos;

    // Step 4: Translate by camera position
    return {
      x: rotatedX + this.x,
      y: rotatedY + this.y,
    };
  }

  /**
   * Convert world coordinates to screen coordinates
   *
   * @param worldX - X position in world space
   * @param worldY - Y position in world space
   * @returns Position in screen/viewport space
   */
  worldToScreen(worldX: number, worldY: number): Point2D {
    // Step 1: Translate by negative camera position
    const offsetX = worldX - this.x;
    const offsetY = worldY - this.y;

    // Step 2: Apply rotation
    const cos = Math.cos(this._rotation);
    const sin = Math.sin(this._rotation);
    const rotatedX = offsetX * cos - offsetY * sin;
    const rotatedY = offsetX * sin + offsetY * cos;

    // Step 3: Apply zoom
    const scaledX = rotatedX * this._zoom;
    const scaledY = rotatedY * this._zoom;

    // Step 4: Translate to viewport center
    return {
      x: scaledX + this.viewportWidth / 2,
      y: scaledY + this.viewportHeight / 2,
    };
  }

  /**
   * Convert a screen-space delta to world-space delta
   * (useful for panning - accounts for rotation)
   */
  screenDeltaToWorld(deltaX: number, deltaY: number): Point2D {
    // Apply inverse zoom
    const scaledX = deltaX / this._zoom;
    const scaledY = deltaY / this._zoom;

    // Apply inverse rotation
    const cos = Math.cos(-this._rotation);
    const sin = Math.sin(-this._rotation);

    return {
      x: scaledX * cos - scaledY * sin,
      y: scaledX * sin + scaledY * cos,
    };
  }

  /**
   * Pan the camera by a screen-space delta
   */
  pan(screenDeltaX: number, screenDeltaY: number): void {
    const worldDelta = this.screenDeltaToWorld(screenDeltaX, screenDeltaY);
    this.x -= worldDelta.x;
    this.y -= worldDelta.y;
  }

  /**
   * Zoom towards a screen point (maintains point under cursor)
   *
   * @param factor - Zoom multiplier (>1 to zoom in, <1 to zoom out)
   * @param screenX - X position in screen space to zoom towards
   * @param screenY - Y position in screen space to zoom towards
   */
  zoomAt(factor: number, screenX: number, screenY: number): void {
    // Get world position under cursor before zoom
    const worldBefore = this.screenToWorld(screenX, screenY);

    // Apply zoom
    const newZoom = this._zoom * factor;
    this._zoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));

    // Get world position under cursor after zoom
    const worldAfter = this.screenToWorld(screenX, screenY);

    // Adjust camera position to keep the point under cursor fixed
    this.x += worldBefore.x - worldAfter.x;
    this.y += worldBefore.y - worldAfter.y;
  }

  /**
   * Zoom towards viewport center
   */
  zoomCenter(factor: number): void {
    this.zoomAt(factor, this.viewportWidth / 2, this.viewportHeight / 2);
  }

  /**
   * Rotate around a screen point (maintains point under cursor)
   *
   * @param deltaRadians - Rotation amount in radians (positive = clockwise)
   * @param screenX - X position in screen space to rotate around
   * @param screenY - Y position in screen space to rotate around
   */
  rotateAt(deltaRadians: number, screenX: number, screenY: number): void {
    // Get world position under cursor before rotation
    const worldBefore = this.screenToWorld(screenX, screenY);

    // Apply rotation
    this.rotation = this._rotation + deltaRadians;

    // Get world position under cursor after rotation
    const worldAfter = this.screenToWorld(screenX, screenY);

    // Adjust camera position to keep the point under cursor fixed
    this.x += worldBefore.x - worldAfter.x;
    this.y += worldBefore.y - worldAfter.y;
  }

  /**
   * Rotate around viewport center
   */
  rotateCenter(deltaRadians: number): void {
    this.rotateAt(
      deltaRadians,
      this.viewportWidth / 2,
      this.viewportHeight / 2,
    );
  }

  /**
   * Rotate by degrees around viewport center
   */
  rotateCenterDegrees(deltaDegrees: number): void {
    this.rotateCenter((deltaDegrees * Math.PI) / 180);
  }

  /**
   * Reset camera to default state (centered, 100% zoom, no rotation)
   */
  reset(): void {
    this.x = this.viewportWidth / 2;
    this.y = this.viewportHeight / 2;
    this._zoom = 1;
    this._rotation = 0;
  }

  /**
   * Reset only rotation to 0
   */
  resetRotation(): void {
    this._rotation = 0;
  }

  /**
   * Fit camera to show a bounding box in world space
   *
   * @param bounds - Bounding box { x, y, width, height } in world space
   * @param padding - Optional padding ratio (0.1 = 10% padding)
   */
  fitToBounds(
    bounds: { x: number; y: number; width: number; height: number },
    padding = 0.1,
  ): void {
    // Center camera on bounds center
    this.x = bounds.x + bounds.width / 2;
    this.y = bounds.y + bounds.height / 2;

    // Calculate zoom to fit bounds in viewport
    const paddedWidth = bounds.width * (1 + padding * 2);
    const paddedHeight = bounds.height * (1 + padding * 2);

    const zoomX = this.viewportWidth / paddedWidth;
    const zoomY = this.viewportHeight / paddedHeight;

    this._zoom = Math.max(
      this.minZoom,
      Math.min(this.maxZoom, Math.min(zoomX, zoomY)),
    );

    // Reset rotation when fitting to bounds
    this._rotation = 0;
  }

  /**
   * Get the visible bounds in world space (axis-aligned bounding box)
   * Note: When rotated, this returns the AABB of the rotated viewport
   */
  getWorldBounds(): { x: number; y: number; width: number; height: number } {
    // Get all four corners of the viewport in world space
    const corners = [
      this.screenToWorld(0, 0),
      this.screenToWorld(this.viewportWidth, 0),
      this.screenToWorld(this.viewportWidth, this.viewportHeight),
      this.screenToWorld(0, this.viewportHeight),
    ];

    // Find AABB
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const corner of corners) {
      minX = Math.min(minX, corner.x);
      minY = Math.min(minY, corner.y);
      maxX = Math.max(maxX, corner.x);
      maxY = Math.max(maxY, corner.y);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Get the transformation matrix for canvas rendering
   * Returns [a, b, c, d, e, f] for ctx.setTransform(a, b, c, d, e, f)
   *
   * This matrix transforms world coordinates to screen coordinates.
   */
  getTransformMatrix(): [number, number, number, number, number, number] {
    // World to screen transformation:
    // 1. Translate by -camera position
    // 2. Rotate
    // 3. Scale
    // 4. Translate to viewport center

    const cos = Math.cos(this._rotation);
    const sin = Math.sin(this._rotation);
    const z = this._zoom;

    // Combined matrix:
    // | z*cos  -z*sin  tx |
    // | z*sin   z*cos  ty |
    // |   0       0     1 |

    const a = z * cos;
    const b = z * sin;
    const c = -z * sin;
    const d = z * cos;

    // Translation: first translate by -camera, then rotate+scale, then translate to center
    // tx = -x*a - y*c + centerX
    // ty = -x*b - y*d + centerY
    const tx = -this.x * a - this.y * c + this.viewportWidth / 2;
    const ty = -this.x * b - this.y * d + this.viewportHeight / 2;

    return [a, b, c, d, tx, ty];
  }

  /**
   * Get the inverse transformation matrix (screen to world)
   * Returns [a, b, c, d, e, f] for transforming screen coords to world coords
   */
  getInverseTransformMatrix(): [
    number,
    number,
    number,
    number,
    number,
    number,
  ] {
    const cos = Math.cos(-this._rotation);
    const sin = Math.sin(-this._rotation);
    const invZ = 1 / this._zoom;

    // Inverse transformation:
    // 1. Translate by -viewport center
    // 2. Scale by 1/zoom
    // 3. Rotate by -rotation
    // 4. Translate by camera position

    const a = invZ * cos;
    const b = invZ * sin;
    const c = -invZ * sin;
    const d = invZ * cos;

    // The translation needs to account for all steps
    const centerX = this.viewportWidth / 2;
    const centerY = this.viewportHeight / 2;

    // tx = -centerX * a - centerY * c + cameraX
    // ty = -centerX * b - centerY * d + cameraY
    const tx = -centerX * a - centerY * c + this.x;
    const ty = -centerX * b - centerY * d + this.y;

    return [a, b, c, d, tx, ty];
  }

  /**
   * Get zoom percentage for display
   */
  getZoomPercent(): number {
    return Math.round(this._zoom * 100);
  }
}
