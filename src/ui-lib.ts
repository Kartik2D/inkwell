/**
 * Blocky UI Library
 *
 * A minimal UI component library using CSS custom properties for inheritance.
 * Uses 3-layer structure: Host (BlockHolder) > Block (shell) > Face (surface)
 */
import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { DrawTool, DrawMode, ToolSettings, Modifiers } from "./types";
import { rgbToHex, hexToRgb, rgbToHsv, hsvToRgb, rgbToHsl, hslToRgb, okhslToRgb, rgbToOkhsl } from "./color-utils";

// ============================================================
// Base Block Component
// ============================================================

type ResizeCorner = "left" | "right" | null;

export class Block extends LitElement {
  @property({ type: Boolean, reflect: true }) active = false;
  @property({ type: Boolean }) draggable = false;
  @property({ type: Boolean }) resizable = false;
  @property({ type: Number }) blockWidth: number | null = null;
  @property({ type: Number }) blockHeight: number | null = null;

  // Drag state
  private _isDragging = false;
  private _dragOffset = { x: 0, y: 0 };

  // Resize state (protected for subclass override)
  protected _isResizing = false;
  protected _resizeCorner: ResizeCorner = null;
  protected _resizeStart = { x: 0, y: 0, width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 };

  static styles = css`
    :host {
      /* Design tokens */
      --block-depth: 10px;
      --block-depth-color: #bcbcbc;
      --block-border: #555555;
      --block-radius: 10px;
      --block-face-bg: #ffffff;
      --block-face-padding: 10px;
      --block-font: system-ui, sans-serif;
      --block-font-size: 13px;
      --block-font-weight: 500;
      --block-font-color: #6b6b6b;

      display: block;
      box-sizing: border-box;
      padding: 0;
      font-family: var(--block-font);
      font-size: var(--block-font-size);
      font-weight: var(--block-font-weight);
      color: var(--block-font-color);
    }

    :host([dragging]) {
      cursor: grabbing;
      user-select: none;
    }

    :host([resizing]) {
      user-select: none;
    }

    .block {
      box-sizing: border-box;
      background: var(--block-depth-color);
      border: 2px solid var(--block-border);
      border-radius: var(--block-radius);
      padding: 0 0 var(--block-depth) 0;
      height: 100%;
      box-shadow: 0 0 10px rgba(5, 0, 0, 0.5);
      position: relative;
      overflow: hidden;
    }

    .face {
      box-sizing: border-box;
      background: var(--block-face-bg);
      border-radius: calc(var(--block-radius) - 2px);
      padding: var(--block-face-padding);
      height: 100%;
      overflow: auto;
    }

    /* Resize corner zones in the depth area */
    .resize-left,
    .resize-right {
      position: absolute;
      bottom: 0;
      width: 25%;
      height: var(--block-depth);
      z-index: 10;
    }

    .resize-left {
      left: 0;
      cursor: nesw-resize;
      border-bottom-left-radius: calc(var(--block-radius) - 2px);
    }

    .resize-right {
      right: 0;
      cursor: nwse-resize;
      border-bottom-right-radius: calc(var(--block-radius) - 2px);
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("pointerdown", this._onPointerDown);
    this.addEventListener("pointermove", this._onPointerHover);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("pointerdown", this._onPointerDown);
    this.removeEventListener("pointermove", this._onPointerHover);
    this._cleanupDrag();
    this._cleanupResize();
  }

  private _isWhitespaceTarget(e: PointerEvent): boolean {
    const path = e.composedPath();
    const blockEl = this.renderRoot.querySelector(".block");
    const faceEl = this.renderRoot.querySelector(".face");

    for (const el of path) {
      if (el === blockEl || el === faceEl) return true;
      if (el === this) return true;
      if (el instanceof HTMLElement) {
        // Block if element is explicitly marked as interactive
        if (el.hasAttribute("data-interactive")) {
          return false;
        }
        const tag = el.tagName.toLowerCase();
        if (tag === "button" || tag === "input" || tag === "blocky-button") {
          return false;
        }
        if (tag === "h3" || tag === "span" || tag === "p") continue;
      }
    }
    return false;
  }

  private _getResizeCorner(e: PointerEvent): ResizeCorner {
    if (!this.resizable) return null;

    const rect = this.getBoundingClientRect();
    const depth = parseInt(
      getComputedStyle(this).getPropertyValue("--block-depth") || "10"
    );

    // Check if in bottom depth area
    const inDepthY = e.clientY > rect.bottom - depth - 2; // -2 for border
    if (!inDepthY) return null;

    const relX = e.clientX - rect.left;
    const cornerWidth = rect.width * 0.25;

    if (relX < cornerWidth) return "left";
    if (relX > rect.width - cornerWidth) return "right";

    return null; // Middle area - use for dragging
  }

  private _onPointerHover = (e: PointerEvent) => {
    if (this._isDragging || this._isResizing) return;

    const corner = this._getResizeCorner(e);
    if (corner === "left") {
      this.style.cursor = "nesw-resize";
    } else if (corner === "right") {
      this.style.cursor = "nwse-resize";
    } else {
      this.style.cursor = "";
    }
  };

  private _onPointerDown = (e: PointerEvent) => {
    // Check for resize first
    const corner = this._getResizeCorner(e);
    if (corner) {
      this._startResize(e, corner);
      return;
    }

    // Otherwise, handle drag
    if (!this.draggable) return;
    if (!this._isWhitespaceTarget(e)) return;
    this._startDrag(e);
  };

  // ============================================================
  // Drag Logic
  // ============================================================

  private _startDrag(e: PointerEvent) {
    e.preventDefault();
    this._isDragging = true;
    this.setAttribute("dragging", "");

    // Bring panel to top
    const allPanels = document.querySelectorAll<HTMLElement>("[data-panel]");
    let maxZIndex = 1000;
    allPanels.forEach((panel) => {
      const zIndex = parseInt(
        window.getComputedStyle(panel).zIndex || "1000",
        10
      );
      if (zIndex > maxZIndex) maxZIndex = zIndex;
    });
    this.style.zIndex = `${maxZIndex + 1}`;

    const rect = this.getBoundingClientRect();
    this._dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    window.addEventListener("pointermove", this._onDragMove);
    window.addEventListener("pointerup", this._onDragEnd);
  }

  private _onDragMove = (e: PointerEvent) => {
    if (!this._isDragging) return;

    const newLeft = e.clientX - this._dragOffset.x;
    const newTop = e.clientY - this._dragOffset.y;

    this.style.left = `${newLeft}px`;
    this.style.top = `${newTop}px`;
    this.style.right = "auto";
    this.style.bottom = "auto";
  };

  private _onDragEnd = () => {
    this._applyPercentagePosition();
    this._cleanupDrag();
  };

  private _applyPercentagePosition() {
    const rect = this.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const nearLeft = centerX < vw / 2;
    const nearTop = centerY < vh / 2;

    if (nearLeft) {
      const leftPercent = (rect.left / vw) * 100;
      this.style.left = `${leftPercent}%`;
      this.style.right = "auto";
    } else {
      const rightPercent = ((vw - rect.right) / vw) * 100;
      this.style.right = `${rightPercent}%`;
      this.style.left = "auto";
    }

    if (nearTop) {
      const topPercent = (rect.top / vh) * 100;
      this.style.top = `${topPercent}%`;
      this.style.bottom = "auto";
    } else {
      const bottomPercent = ((vh - rect.bottom) / vh) * 100;
      this.style.bottom = `${bottomPercent}%`;
      this.style.top = "auto";
    }
  }

  private _cleanupDrag() {
    this._isDragging = false;
    this.removeAttribute("dragging");
    window.removeEventListener("pointermove", this._onDragMove);
    window.removeEventListener("pointerup", this._onDragEnd);
  }

  // ============================================================
  // Resize Logic
  // ============================================================

  private _startResize(e: PointerEvent, corner: ResizeCorner) {
    e.preventDefault();
    e.stopPropagation();

    this._isResizing = true;
    this._resizeCorner = corner;
    this.setAttribute("resizing", "");

    const rect = this.getBoundingClientRect();
    this._resizeStart = {
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };

    // Switch to pixel positioning immediately so resize works correctly
    // regardless of which corner the panel was anchored to
    this.style.left = `${rect.left}px`;
    this.style.top = `${rect.top}px`;
    this.style.right = "auto";
    this.style.bottom = "auto";

    // Initialize blockWidth/blockHeight if not set
    if (this.blockWidth === null) this.blockWidth = rect.width;
    if (this.blockHeight === null) this.blockHeight = rect.height;

    // Bring panel to top
    const allPanels = document.querySelectorAll<HTMLElement>("[data-panel]");
    let maxZIndex = 1000;
    allPanels.forEach((panel) => {
      const zIndex = parseInt(
        window.getComputedStyle(panel).zIndex || "1000",
        10
      );
      if (zIndex > maxZIndex) maxZIndex = zIndex;
    });
    this.style.zIndex = `${maxZIndex + 1}`;

    window.addEventListener("pointermove", this._onResizeMove);
    window.addEventListener("pointerup", this._onResizeEnd);
  }

  protected _onResizeMove = (e: PointerEvent) => {
    if (!this._isResizing) return;

    const minWidth = 100;
    const minHeight = 80;

    // Calculate new bounds based on which corner is being dragged
    // The dragged corner follows the cursor, opposite corner stays fixed
    let newLeft = this._resizeStart.left;
    let newTop = this._resizeStart.top;
    let newRight = this._resizeStart.right;
    let newBottom = e.clientY; // Bottom always follows cursor Y for bottom corners

    if (this._resizeCorner === "right") {
      // Right corner: right edge follows cursor X, left edge stays fixed
      newRight = e.clientX;
    } else if (this._resizeCorner === "left") {
      // Left corner: left edge follows cursor X, right edge stays fixed
      newLeft = e.clientX;
    }

    // Calculate new dimensions
    let newWidth = newRight - newLeft;
    let newHeight = newBottom - newTop;

    // Enforce minimums
    if (newWidth < minWidth) {
      if (this._resizeCorner === "left") {
        newLeft = newRight - minWidth;
      }
      newWidth = minWidth;
    }
    if (newHeight < minHeight) {
      newHeight = minHeight;
    }

    // Apply position and size
    this.style.left = `${newLeft}px`;
    this.style.top = `${newTop}px`;
    this.blockWidth = newWidth;
    this.blockHeight = newHeight;

    this.requestUpdate();
  };

  private _onResizeEnd = () => {
    this._applyPercentagePosition();
    this._cleanupResize();
  };

  private _cleanupResize() {
    this._isResizing = false;
    this._resizeCorner = null;
    this.removeAttribute("resizing");
    window.removeEventListener("pointermove", this._onResizeMove);
    window.removeEventListener("pointerup", this._onResizeEnd);
  }

  updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    // Apply dimensions directly to host element style
    if (changedProperties.has("blockWidth") || changedProperties.has("blockHeight")) {
      if (this.blockWidth !== null) {
        this.style.width = `${this.blockWidth}px`;
      }
      if (this.blockHeight !== null) {
        this.style.height = `${this.blockHeight}px`;
      }
    }
  }

  render() {
    return html`
      <div class="block">
        <div class="face">
          <slot></slot>
        </div>
        ${this.resizable
          ? html`
              <div class="resize-left"></div>
              <div class="resize-right"></div>
            `
          : ""}
      </div>
    `;
  }
}

// ============================================================
// Blocky Button
// ============================================================

@customElement("blocky-button")
export class BlockyButton extends Block {
  @property({ type: Boolean, reflect: true }) danger = false;

  connectedCallback() {
    super.connectedCallback();
    // iOS Safari needs explicit touch handling for custom elements
    this.addEventListener("touchend", this._onTouchEnd);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("touchend", this._onTouchEnd);
  }

  private _onTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    this.click();
  };

  static styles = css`
    ${Block.styles}

    :host {
      display: inline-block;
      cursor: pointer;
      text-align: center;
      transition: padding 100ms ease-in-out;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      user-select: none;
      -webkit-user-select: none;
    }

    .block {
      transition: padding 100ms ease-in-out;
      box-shadow: 0 0 10px rgba(5, 0, 0, 0.3);
    }

    @media (hover: hover) {
      :host(:hover:not(:active):not([active])) {
        padding-top: calc(var(--block-depth) / 2);
      }
      :host(:hover:not(:active):not([active])) .block {
        padding-bottom: calc(var(--block-depth) / 2);
      }
    }

    :host(:active),
    :host([active]) {
      padding-top: var(--block-depth);
    }
    :host(:active) .block,
    :host([active]) .block {
      padding-bottom: 0;
    }

    :host([danger]) {
      --block-face-bg: #333;
      --block-color: white;
    }
  `;
}



// ============================================================
// HSV Wheel Component
// ============================================================

@customElement("hsv-wheel")
export class HSVWheel extends LitElement {
  @property({ type: String }) color = "#037ffc";

  private h = 0;
  private s = 0;
  private v = 100;

  static styles = css`
    :host {
      --hsv-ring-thickness: 12%;
      --hsv-border-width: 2px;
      --hsv-border-color: var(--block-border, #9f9f9f);
      --hsv-handle-size: 12px;
      --hsv-mask-bg: var(--block-face-bg, white);
      --hsv-inner-diameter: calc(100% - 2 * var(--hsv-ring-thickness));
      --hsv-sv-box-size: calc(var(--hsv-inner-diameter) * 0.707);
      --hsv-handle-position: calc(
        100% - var(--hsv-ring-thickness) - var(--hsv-border-width) / 2
      );

      display: block;
      width: 100%;
      /* Safari-compatible 1:1 aspect ratio */
      height: 0;
      padding-bottom: 100%;
      position: relative;
    }

    .hsv-container {
      position: absolute;
      inset: 0;
      user-select: none;
    }

    .hue-ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red);
      cursor: pointer;
      border: var(--hsv-border-width) solid var(--hsv-border-color);
      box-sizing: border-box;
    }

    .hue-ring-mask {
      position: absolute;
      top: var(--hsv-ring-thickness);
      left: var(--hsv-ring-thickness);
      right: var(--hsv-ring-thickness);
      bottom: var(--hsv-ring-thickness);
      background: var(--hsv-mask-bg);
      border-radius: 50%;
      pointer-events: none;
      border: var(--hsv-border-width) solid var(--hsv-border-color);
      box-sizing: border-box;
    }

    .hue-handle-arm {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 50%;
      height: 0;
      transform-origin: 0 0;
      pointer-events: none;
    }

    .hue-handle,
    .sv-handle {
      position: absolute;
      width: var(--hsv-handle-size);
      height: var(--hsv-handle-size);
      border-radius: 50%;
      border: var(--hsv-border-width) solid white;
      box-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
      background: transparent;
      transform: translate(-50%, -50%);
      box-sizing: border-box;
      pointer-events: none;
    }

    .hue-handle {
      left: var(--hsv-handle-position);
      top: 0;
    }

    .sv-box-wrapper {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: var(--hsv-sv-box-size);
      height: var(--hsv-sv-box-size);
    }

    .sv-box {
      position: relative;
      width: 100%;
      height: 100%;
      cursor: crosshair;
      border-radius: 2px;
      overflow: hidden;
      border: var(--hsv-border-width) solid var(--hsv-border-color);
      box-sizing: border-box;
    }

    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `;

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;

  firstUpdated() {
    this.canvas = this.renderRoot.querySelector("canvas")!;
    this.ctx = this.canvas.getContext("2d")!;
    this.syncFromColor(this.color);
    this.drawSVBox();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("color")) {
      const currentRGB = hsvToRgb(this.h, this.s, this.v);
      if (rgbToHex(currentRGB[0], currentRGB[1], currentRGB[2]) !== this.color) {
        this.syncFromColor(this.color);
        this.drawSVBox();
      }
    }
  }

  private syncFromColor(hex: string) {
    const rgb = hexToRgb(hex);
    const hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
    this.h = hsv[0];
    this.s = hsv[1];
    this.v = hsv[2];
  }

  private drawSVBox() {
    if (!this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const imgData = this.ctx.createImageData(w, h);
    const data = imgData.data;

    for (let y = 0; y < h; y++) {
      const v = 100 - (y / h) * 100;
      for (let x = 0; x < w; x++) {
        const s = (x / w) * 100;
        const [r, g, b] = hsvToRgb(this.h, s, v);
        const index = (y * w + x) * 4;
        data[index] = r;
        data[index + 1] = g;
        data[index + 2] = b;
        data[index + 3] = 255;
      }
    }
    this.ctx.putImageData(imgData, 0, 0);
  }

  private handleRingDown(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const update = (e: PointerEvent) => {
      const x = e.clientX - cx;
      const y = e.clientY - cy;
      let angleDeg = Math.atan2(y, x) * (180 / Math.PI) + 90;
      if (angleDeg < 0) angleDeg += 360;
      this.h = angleDeg;
      this.emitChange();
    };

    update(e);
    const move = (e: PointerEvent) => update(e);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      this.emitChangeEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  private handleBoxDown(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

    const update = (e: PointerEvent) => {
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      this.s = x * 100;
      this.v = (1 - y) * 100;
      this.emitChange();
    };

    update(e);
    const move = (e: PointerEvent) => update(e);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      this.emitChangeEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  private emitChange() {
    const [r, g, b] = hsvToRgb(this.h, this.s, this.v);
    this.color = rgbToHex(r, g, b);
    this.dispatchEvent(
      new CustomEvent("input", {
        detail: { value: this.color },
        bubbles: true,
        composed: true,
      })
    );
    this.drawSVBox();
    this.requestUpdate();
  }

  private emitChangeEnd() {
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: { value: this.color },
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    const boxX = this.s;
    const boxY = 100 - this.v;

    return html`
      <div class="hsv-container">
        <div class="hue-ring" data-interactive @pointerdown=${this.handleRingDown}></div>
        <div class="hue-ring-mask"></div>
        <div
          class="hue-handle-arm"
          style="transform: rotate(${this.h - 90}deg)"
        >
          <div class="hue-handle"></div>
        </div>
        <div class="sv-box-wrapper">
          <div class="sv-box" data-interactive @pointerdown=${this.handleBoxDown}>
            <canvas width="100" height="100"></canvas>
            <div
              class="sv-handle"
              style="left: ${boxX}%; top: ${boxY}%;"
            ></div>
          </div>
        </div>
      </div>
    `;
  }
}

// ============================================================
// HSL Picker Component
// ============================================================

@customElement("hsl-picker")
export class HSLPicker extends LitElement {
  @property({ type: String }) color = "#037ffc";
  @property({ type: String }) prevColor = "#000000";

  private h = 0;
  private s = 100;
  private l = 50;

  static styles = css`
    :host {
      --hsl-border-width: 2px;
      --hsl-border-color: var(--block-border, #9f9f9f);
      --hsl-handle-size: 12px;
      --hsl-slider-width: 20px;
      --hsl-gap: 8px;

      display: block;
      height: 100%;
    }

    .hsl-container {
      display: flex;
      gap: var(--hsl-gap);
      width: 100%;
      height: 100%;
      user-select: none;
    }

    .hl-box {
      flex: 1;
      position: relative;
      cursor: crosshair;
      border-radius: 2px;
      overflow: hidden;
      border: var(--hsl-border-width) solid var(--hsl-border-color);
      box-sizing: border-box;
    }

    .hl-box canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    
    .hl-handle,
    .s-handle {
        position: absolute;
      width: var(--hsl-handle-size);
      height: var(--hsl-handle-size);
        border-radius: 50%;
      border: var(--hsl-border-width) solid white;
      box-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
      background: transparent;
      transform: translate(-50%, -50%);
      box-sizing: border-box;
        pointer-events: none;
    }

    .slider-column {
      display: flex;
      flex-direction: column;
      gap: var(--hsl-gap);
      width: var(--hsl-slider-width);
    }

    .color-preview {
      width: 100%;
      aspect-ratio: 1;
      border-radius: 2px;
      border: var(--hsl-border-width) solid var(--hsl-border-color);
      box-sizing: border-box;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .color-half {
      flex: 1;
    }

    .s-slider {
      flex: 1;
      position: relative;
      border-radius: 2px;
      overflow: hidden;
      border: var(--hsl-border-width) solid var(--hsl-border-color);
      box-sizing: border-box;
      cursor: pointer;
    }

    .s-gradient {
      width: 100%;
      height: 100%;
    }
    
    .s-handle {
        position: absolute;
        left: 50%;
      width: calc(100% - 4px);
      height: 6px;
      border-radius: 2px;
    }
  `;

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private sliderEl!: HTMLElement;

  firstUpdated() {
    this.canvas = this.renderRoot.querySelector("canvas")!;
    this.ctx = this.canvas.getContext("2d")!;
    this.sliderEl = this.renderRoot.querySelector(".s-gradient")!;
    this.syncFromColor(this.color);
    this.drawHLBox();
    this.updateSaturationGradient();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("color")) {
      const currentRGB = hslToRgb(this.h, this.s, this.l);
      if (rgbToHex(currentRGB[0], currentRGB[1], currentRGB[2]) !== this.color) {
        this.syncFromColor(this.color);
        this.drawHLBox();
        this.updateSaturationGradient();
      }
    }
  }

  private syncFromColor(hex: string) {
    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    this.h = hsl[0];
    this.s = hsl[1];
    this.l = hsl[2];
  }

  private drawHLBox() {
    if (!this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const imgData = this.ctx.createImageData(w, h);
    const data = imgData.data;

    // X = Hue (0-360), Y = Lightness (100-0)
    for (let y = 0; y < h; y++) {
      const lightness = 100 - (y / h) * 100;
      for (let x = 0; x < w; x++) {
        const hue = (x / w) * 360;
        const [r, g, b] = hslToRgb(hue, this.s, lightness);
        const index = (y * w + x) * 4;
        data[index] = r;
        data[index + 1] = g;
        data[index + 2] = b;
        data[index + 3] = 255;
      }
    }
    this.ctx.putImageData(imgData, 0, 0);
  }

  private updateSaturationGradient() {
    if (!this.sliderEl) return;
    // Gradient from full saturation (S=100) to no saturation (S=0) at current H,L
    const [r1, g1, b1] = hslToRgb(this.h, 100, this.l);
    const [r2, g2, b2] = hslToRgb(this.h, 0, this.l);
    this.sliderEl.style.background = `linear-gradient(to bottom, 
      rgb(${r1}, ${g1}, ${b1}), 
      rgb(${r2}, ${g2}, ${b2}))`;
  }

  private handleSliderDown(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

    const update = (e: PointerEvent) => {
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      this.s = (1 - y) * 100;
      this.emitChange();
      this.drawHLBox();
    };

    update(e);
    const move = (e: PointerEvent) => update(e);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      this.emitChangeEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  private handleBoxDown(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

    const update = (e: PointerEvent) => {
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      this.h = x * 360;
      this.l = (1 - y) * 100;
      this.emitChange();
      this.updateSaturationGradient();
    };

    update(e);
    const move = (e: PointerEvent) => update(e);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      this.emitChangeEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  private emitChange() {
    const [r, g, b] = hslToRgb(this.h, this.s, this.l);
    this.color = rgbToHex(r, g, b);
    this.dispatchEvent(
      new CustomEvent("input", {
        detail: { value: this.color },
        bubbles: true,
        composed: true,
      })
    );
    this.requestUpdate();
  }

  private emitChangeEnd() {
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: { value: this.color },
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    const hlX = (this.h / 360) * 100;
    const hlY = 100 - this.l;
    const sY = (1 - this.s / 100) * 100;

    return html`
      <div class="hsl-container">
        <div class="hl-box" data-interactive @pointerdown=${this.handleBoxDown}>
          <canvas width="100" height="100"></canvas>
          <div class="hl-handle" style="left: ${hlX}%; top: ${hlY}%;"></div>
                </div>
        <div class="slider-column">
          <div class="color-preview">
            <div class="color-half" style="background: ${this.prevColor}"></div>
            <div class="color-half" style="background: ${this.color}"></div>
                        </div>
          <div class="s-slider" data-interactive @pointerdown=${this.handleSliderDown}>
            <div class="s-gradient"></div>
            <div class="s-handle" style="top: ${sY}%;"></div>
            </div>
        </div>
      </div>
    `;
  }
}

// ============================================================
// OKHSL Rectangular Picker Component
// ============================================================

@customElement("okhsl-rect-picker")
export class OKHSLRectPicker extends LitElement {
  @property({ type: String }) color = "#037ffc";
  @property({ type: String }) prevColor = "#000000";

  private h = 0;
  private s = 100;
  private l = 50;

  static styles = css`
    :host {
      --okhsl-border-width: 2px;
      --okhsl-border-color: var(--block-border, #9f9f9f);
      --okhsl-handle-size: 12px;
      --okhsl-slider-width: 20px;
      --okhsl-gap: 8px;

      display: block;
      height: 100%;
    }

    .okhsl-container {
      display: flex;
      gap: var(--okhsl-gap);
      width: 100%;
      height: 100%;
      user-select: none;
    }

    .hl-box {
      flex: 1;
      position: relative;
      cursor: crosshair;
      border-radius: 2px;
      overflow: hidden;
      border: var(--okhsl-border-width) solid var(--okhsl-border-color);
      box-sizing: border-box;
    }

    .hl-box canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    
    .hl-handle,
    .s-handle {
      position: absolute;
      width: var(--okhsl-handle-size);
      height: var(--okhsl-handle-size);
      border-radius: 50%;
      border: var(--okhsl-border-width) solid white;
      box-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
      background: transparent;
      transform: translate(-50%, -50%);
      box-sizing: border-box;
      pointer-events: none;
    }

    .slider-column {
      display: flex;
      flex-direction: column;
      gap: var(--okhsl-gap);
      width: var(--okhsl-slider-width);
    }

    .color-preview {
      width: 100%;
      aspect-ratio: 1;
      border-radius: 2px;
      border: var(--okhsl-border-width) solid var(--okhsl-border-color);
      box-sizing: border-box;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .color-half {
      flex: 1;
    }

    .s-slider {
      flex: 1;
      position: relative;
      border-radius: 2px;
      overflow: hidden;
      border: var(--okhsl-border-width) solid var(--okhsl-border-color);
      box-sizing: border-box;
      cursor: pointer;
    }

    .s-gradient {
      width: 100%;
      height: 100%;
    }
    
    .s-handle {
      position: absolute;
      left: 50%;
      width: calc(100% - 4px);
      height: 6px;
      border-radius: 2px;
    }
  `;

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private sliderEl!: HTMLElement;

  firstUpdated() {
    this.canvas = this.renderRoot.querySelector("canvas")!;
    this.ctx = this.canvas.getContext("2d")!;
    this.sliderEl = this.renderRoot.querySelector(".s-gradient")!;
    this.syncFromColor(this.color);
    this.drawHLBox();
    this.updateSaturationGradient();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("color")) {
      const currentRGB = okhslToRgb(this.h, this.s, this.l);
      if (rgbToHex(currentRGB[0], currentRGB[1], currentRGB[2]) !== this.color) {
        this.syncFromColor(this.color);
        this.drawHLBox();
        this.updateSaturationGradient();
      }
    }
  }

  private syncFromColor(hex: string) {
    const rgb = hexToRgb(hex);
    const okhsl = rgbToOkhsl(rgb[0], rgb[1], rgb[2]);
    this.h = okhsl[0];
    this.s = okhsl[1];
    this.l = okhsl[2];
  }

  private drawHLBox() {
    if (!this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const imgData = this.ctx.createImageData(w, h);
    const data = imgData.data;

    // X = Hue (0-360), Y = Lightness (100-0)
    for (let y = 0; y < h; y++) {
      const lightness = 100 - (y / h) * 100;
      for (let x = 0; x < w; x++) {
        const hue = (x / w) * 360;
        const [r, g, b] = okhslToRgb(hue, this.s, lightness);
        const index = (y * w + x) * 4;
        data[index] = r;
        data[index + 1] = g;
        data[index + 2] = b;
        data[index + 3] = 255;
      }
    }
    this.ctx.putImageData(imgData, 0, 0);
  }

  private updateSaturationGradient() {
    if (!this.sliderEl) return;
    // Gradient from full saturation (S=100) to no saturation (S=0) at current H,L
    const [r1, g1, b1] = okhslToRgb(this.h, 100, this.l);
    const [r2, g2, b2] = okhslToRgb(this.h, 0, this.l);
    this.sliderEl.style.background = `linear-gradient(to bottom, 
      rgb(${r1}, ${g1}, ${b1}), 
      rgb(${r2}, ${g2}, ${b2}))`;
  }

  private handleSliderDown(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

    const update = (e: PointerEvent) => {
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      this.s = (1 - y) * 100;
      this.emitChange();
      this.drawHLBox();
    };

    update(e);
    const move = (e: PointerEvent) => update(e);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      this.emitChangeEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  private handleBoxDown(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

    const update = (e: PointerEvent) => {
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      this.h = x * 360;
      this.l = (1 - y) * 100;
      this.emitChange();
      this.updateSaturationGradient();
    };

    update(e);
    const move = (e: PointerEvent) => update(e);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      this.emitChangeEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  private emitChange() {
    const [r, g, b] = okhslToRgb(this.h, this.s, this.l);
    this.color = rgbToHex(r, g, b);
    this.dispatchEvent(
      new CustomEvent("input", {
        detail: { value: this.color },
        bubbles: true,
        composed: true,
      })
    );
    this.requestUpdate();
  }

  private emitChangeEnd() {
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: { value: this.color },
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    const hlX = (this.h / 360) * 100;
    const hlY = 100 - this.l;
    const sY = (1 - this.s / 100) * 100;

    return html`
      <div class="okhsl-container">
        <div class="hl-box" data-interactive @pointerdown=${this.handleBoxDown}>
          <canvas width="100" height="100"></canvas>
          <div class="hl-handle" style="left: ${hlX}%; top: ${hlY}%;"></div>
        </div>
        <div class="slider-column">
          <div class="color-preview">
            <div class="color-half" style="background: ${this.prevColor}"></div>
            <div class="color-half" style="background: ${this.color}"></div>
          </div>
          <div class="s-slider" data-interactive @pointerdown=${this.handleSliderDown}>
            <div class="s-gradient"></div>
            <div class="s-handle" style="top: ${sY}%;"></div>
          </div>
        </div>
      </div>
    `;
  }
}

// ============================================================
// OKHSL Picker Component (Circular)
// ============================================================

@customElement("okhsl-picker")
export class OKHSLPicker extends LitElement {
  @property({ type: String }) color = "#037ffc";
  @property({ type: String }) prevColor = "#000000";
  // Lightness curve exponent: lower = more white, higher = more black, 1 = linear
  @property({ type: Number }) lightnessCurve = 0.5;

  private h = 0;
  private s = 100;
  private l = 50;

  static styles = css`
    :host {
      --okhsl-border-width: 2px;
      --okhsl-border-color: var(--block-border, #9f9f9f);
      --okhsl-handle-size: 12px;
      --okhsl-slider-width: 20px;
      --okhsl-gap: 8px;

      display: block;
    }

    .okhsl-container {
      display: flex;
      gap: var(--okhsl-gap);
      width: 100%;
      user-select: none;
    }

    .hl-circle-wrapper {
      position: relative;
      /* Safari-compatible 1:1 aspect ratio - square based on available width */
      width: calc(100% - var(--okhsl-slider-width) - var(--okhsl-gap));
      height: 0;
      padding-bottom: calc(100% - var(--okhsl-slider-width) - var(--okhsl-gap));
    }

    .hl-circle {
      position: absolute;
      inset: 0;
      cursor: crosshair;
      border-radius: 50%;
      overflow: hidden;
      border: var(--okhsl-border-width) solid var(--okhsl-border-color);
      box-sizing: border-box;
    }

    .hl-circle canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    
    .hl-handle,
    .s-handle {
        position: absolute;
      width: var(--okhsl-handle-size);
      height: var(--okhsl-handle-size);
        border-radius: 50%;
      border: var(--okhsl-border-width) solid white;
      box-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
      background: transparent;
      transform: translate(-50%, -50%);
      box-sizing: border-box;
        pointer-events: none;
    }

    .slider-column {
      display: flex;
      flex-direction: column;
      gap: var(--okhsl-gap);
      width: var(--okhsl-slider-width);
    }

    .color-preview {
      width: 100%;
      aspect-ratio: 1;
      border-radius: 2px;
      border: var(--okhsl-border-width) solid var(--okhsl-border-color);
      box-sizing: border-box;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .color-half {
      flex: 1;
    }

    .s-slider {
      flex: 1;
      position: relative;
      border-radius: 2px;
      overflow: hidden;
      border: var(--okhsl-border-width) solid var(--okhsl-border-color);
      box-sizing: border-box;
      cursor: pointer;
    }

    .s-gradient {
      width: 100%;
      height: 100%;
    }

    .s-handle {
        position: absolute;
        left: 50%;
      width: calc(100% - 4px);
      height: 6px;
      border-radius: 2px;
    }
  `;

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private sliderEl!: HTMLElement;

  firstUpdated() {
    this.canvas = this.renderRoot.querySelector("canvas")!;
    this.ctx = this.canvas.getContext("2d")!;
    this.sliderEl = this.renderRoot.querySelector(".s-gradient")!;
    this.syncFromColor(this.color);
    this.drawHLCircle();
    this.updateSaturationGradient();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("color")) {
      const currentRGB = okhslToRgb(this.h, this.s, this.l);
      if (rgbToHex(currentRGB[0], currentRGB[1], currentRGB[2]) !== this.color) {
        this.syncFromColor(this.color);
        this.drawHLCircle();
        this.updateSaturationGradient();
      }
    }
    if (changed.has("lightnessCurve")) {
      this.drawHLCircle();
    }
  }

  private syncFromColor(hex: string) {
    const rgb = hexToRgb(hex);
    const okhsl = rgbToOkhsl(rgb[0], rgb[1], rgb[2]);
    this.h = okhsl[0];
    this.s = okhsl[1];
    this.l = okhsl[2];
  }

  private drawHLCircle() {
    if (!this.ctx) return;
    const size = this.canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2;
    const imgData = this.ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= radius) {
          // Angle = Hue (0-360), Distance = Lightness (center=0, edge=100)
          let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
          if (angle < 0) angle += 360;
          // Perceptual mapping: adjustable curve for lightness distribution
          const lightness = Math.pow(dist / radius, this.lightnessCurve) * 100;

          const [r, g, b] = okhslToRgb(angle, this.s, lightness);
          const index = (y * size + x) * 4;
        data[index] = r;
        data[index + 1] = g;
        data[index + 2] = b;
        data[index + 3] = 255;
        }
      }
    }
    this.ctx.putImageData(imgData, 0, 0);
  }

  private updateSaturationGradient() {
    if (!this.sliderEl) return;
    // Gradient from full saturation to no saturation at current H,L
    const [r1, g1, b1] = okhslToRgb(this.h, 100, this.l);
    const [r2, g2, b2] = okhslToRgb(this.h, 0, this.l);
    this.sliderEl.style.background = `linear-gradient(to bottom, 
      rgb(${r1}, ${g1}, ${b1}), 
      rgb(${r2}, ${g2}, ${b2}))`;
  }

  private handleSliderDown(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

    const update = (e: PointerEvent) => {
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      this.s = (1 - y) * 100;
      this.emitChange();
      this.drawHLCircle();
    };

    update(e);
    const move = (e: PointerEvent) => update(e);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      this.emitChangeEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  private handleCircleDown(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const radius = Math.min(cx, cy);

    const update = (e: PointerEvent) => {
      const x = e.clientX - rect.left - cx;
      const y = e.clientY - rect.top - cy;
      const dist = Math.min(Math.sqrt(x * x + y * y), radius);

      let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
      if (angle < 0) angle += 360;

      this.h = angle;
      // Perceptual mapping: use same curve as drawing
      this.l = Math.pow(dist / radius, this.lightnessCurve) * 100;
      this.emitChange();
      this.updateSaturationGradient();
    };

    update(e);
    const move = (e: PointerEvent) => update(e);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      this.emitChangeEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  private emitChange() {
    const [r, g, b] = okhslToRgb(this.h, this.s, this.l);
    this.color = rgbToHex(r, g, b);
    this.dispatchEvent(
      new CustomEvent("input", {
        detail: { value: this.color },
        bubbles: true,
        composed: true,
      })
    );
    this.requestUpdate();
  }

  private emitChangeEnd() {
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: { value: this.color },
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    // Calculate handle position from H (angle) and L (radius)
    const angleRad = ((this.h - 90) * Math.PI) / 180;
    // Inverse of curve mapping: use 1/curve exponent to get distance from lightness
    const dist = Math.pow(this.l / 100, 1 / this.lightnessCurve);
    const handleX = 50 + dist * 50 * Math.cos(angleRad);
    const handleY = 50 + dist * 50 * Math.sin(angleRad);
    const sY = (1 - this.s / 100) * 100;

    return html`
      <div class="okhsl-container">
        <div class="hl-circle-wrapper">
          <div class="hl-circle" data-interactive @pointerdown=${this.handleCircleDown}>
            <canvas width="100" height="100"></canvas>
            <div class="hl-handle" style="left: ${handleX}%; top: ${handleY}%;"></div>
                </div>
                        </div>
        <div class="slider-column">
          <div class="color-preview">
            <div class="color-half" style="background: ${this.prevColor}"></div>
            <div class="color-half" style="background: ${this.color}"></div>
                        </div>
          <div class="s-slider" data-interactive @pointerdown=${this.handleSliderDown}>
            <div class="s-gradient"></div>
            <div class="s-handle" style="top: ${sY}%;"></div>
            </div>
        </div>
      </div>
    `;
  }
}

// ============================================================
// Floating Panel Base Class
// ============================================================

export class FloatingPanel extends Block {
  static styles = css`
    ${Block.styles}

    :host {
      position: fixed;
      z-index: 1000;
      top: var(--panel-top, auto);
      right: var(--panel-right, auto);
      bottom: var(--panel-bottom, auto);
      left: var(--panel-left, auto);
      width: var(--panel-width, auto);
      touch-action: auto;
    }

    .block {
      display: flex;
      flex-direction: column;
    }

    .face {
      flex: 1;
      min-height: 0;
    }

    section {
      margin-bottom: 12px;
    }
    section:last-child {
      margin-bottom: 0;
    }

    h3 {
      margin: 0 0 8px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .row {
      display: flex;
      gap: 8px;
    }
    .row > * {
      flex: 1;
    }

    label {
      display: block;
      margin-bottom: 12px;
    }
    label > span {
      display: block;
      margin-bottom: 6px;
    }
    label:last-child {
      margin-bottom: 0;
    }

    input[type="range"] {
      width: 100%;
    }

    .toggle {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .hint {
      color: #666;
      font-style: italic;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.setAttribute('data-panel', '');
  }
}

// ============================================================
// Color Panel
// ============================================================

@customElement("inkwell-color-panel")
export class InkwellColorPanel extends FloatingPanel {
  @property({ type: String }) color = "#037ffc";
  @state() private prevColor = "#000000";

  static styles = css`
    ${FloatingPanel.styles}

    :host {
      --block-radius: 50% 15% 50% 50%;
      --block-face-padding: 10px;
      --panel-width: 180px;
    }

    .block {
      overflow: hidden;
    }

    .face {
      padding: var(--block-face-padding);
      border-radius: var(--block-radius);
      position: relative;
    }

    .color-preview {
      position: absolute;
      top: 5%;
      right: 5%;
      width: 12%;
      height: 12%;
      border-radius: 50%;
      border: 2px solid var(--block-border);
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
      pointer-events: none;
      overflow: hidden;
    }

    .color-half {
      position: absolute;
      top: 0;
      width: 50%;
      height: 100%;
    }

    .color-half.prev {
      left: 0;
    }

    .color-half.current {
      right: 0;
    }
  `;

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true })
    );
  }

  render() {
    return html`
      <div class="block">
        <div class="face">
          <hsv-wheel
            .color=${this.color}
            @input=${(e: CustomEvent) => {
              this.color = e.detail.value;
              this.emit("color-change", this.color);
            }}
            @change=${() => {
              this.prevColor = this.color;
            }}
          ></hsv-wheel>
          <div class="color-preview">
            <div class="color-half prev" style="background: ${this.prevColor}"></div>
            <div class="color-half current" style="background: ${this.color}"></div>
          </div>
        </div>
        ${this.resizable
          ? html`
              <div class="resize-left"></div>
              <div class="resize-right"></div>
            `
          : ""}
      </div>
    `;
  }
}

// ============================================================
// HSL Panel
// ============================================================

@customElement("inkwell-hsl-panel")
export class InkwellHSLPanel extends FloatingPanel {
  @property({ type: String }) color = "#037ffc";
  @state() private prevColor = "#000000";

  static styles = css`
    ${FloatingPanel.styles}
    :host {
      --panel-width: 180px;
    }
  `;

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true })
    );
  }

  render() {
    return html`
      <div class="block">
        <div class="face">
          <hsl-picker
            .color=${this.color}
            .prevColor=${this.prevColor}
            @input=${(e: CustomEvent) => {
              this.color = e.detail.value;
              this.emit("color-change", this.color);
            }}
            @change=${() => {
              this.prevColor = this.color;
            }}
          ></hsl-picker>
        </div>
        ${this.resizable
          ? html`
              <div class="resize-left"></div>
              <div class="resize-right"></div>
            `
          : ""}
      </div>
    `;
  }
}

// ============================================================
// OKHSL Rect Panel (rectangular layout like HSL)
// ============================================================

@customElement("inkwell-okhsl-rect-panel")
export class InkwellOKHSLRectPanel extends FloatingPanel {
  @property({ type: String }) color = "#037ffc";
  @state() private prevColor = "#000000";

  static styles = css`
    ${FloatingPanel.styles}
    :host {
      --panel-width: 180px;
    }
  `;

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true })
    );
  }

  render() {
    return html`
      <div class="block">
        <div class="face">
          <okhsl-rect-picker
            .color=${this.color}
            .prevColor=${this.prevColor}
            @input=${(e: CustomEvent) => {
              this.color = e.detail.value;
              this.emit("color-change", this.color);
            }}
            @change=${() => {
              this.prevColor = this.color;
            }}
          ></okhsl-rect-picker>
        </div>
        ${this.resizable
          ? html`
              <div class="resize-left"></div>
              <div class="resize-right"></div>
            `
          : ""}
      </div>
    `;
  }
}

// ============================================================
// OKHSL Panel (circular layout)
// ============================================================

@customElement("inkwell-okhsl-panel")
export class InkwellOKHSLPanel extends FloatingPanel {
  @property({ type: String }) color = "#037ffc";
  @state() private prevColor = "#000000";
  @state() private lightnessCurve = 0.5;

  static styles = css`
    ${FloatingPanel.styles}
    :host {
      --panel-width: 200px;
    }

    .curve-control {
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .curve-control span {
      font-size: 10px;
      color: #666;
      min-width: 28px;
    }

    .curve-control input {
      flex: 1;
    }
  `;

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true })
    );
  }

  render() {
    return html`
      <div class="block">
        <div class="face">
          <okhsl-picker
            .color=${this.color}
            .prevColor=${this.prevColor}
            .lightnessCurve=${this.lightnessCurve}
            @input=${(e: CustomEvent) => {
              this.color = e.detail.value;
              this.emit("color-change", this.color);
            }}
            @change=${() => {
              this.prevColor = this.color;
            }}
          ></okhsl-picker>
          <div class="curve-control">
            <span>Light</span>
            <input
              type="range"
              min="0.2"
              max="1.5"
              step="0.05"
              .value=${String(this.lightnessCurve)}
              @input=${(e: Event) => {
                this.lightnessCurve = parseFloat((e.target as HTMLInputElement).value);
              }}
            />
            <span>Dark</span>
          </div>
        </div>
        ${this.resizable
          ? html`
              <div class="resize-left"></div>
              <div class="resize-right"></div>
            `
          : ""}
      </div>
    `;
  }
}

// ============================================================
// Tools Panel
// ============================================================

@customElement("inkwell-tools-panel")
export class InkwellToolsPanel extends FloatingPanel {
  @property({ type: String }) currentTool: DrawTool = "brush";

  static styles = css`
    ${FloatingPanel.styles}
  `;

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true })
    );
  }

  private setTool(tool: DrawTool) {
    this.currentTool = tool;
    this.emit("tool-change", tool);
  }

  render() {
    return html`
      <div class="block">
        <div class="face">
          <h3>Tools</h3>
          <div class="grid">
            <blocky-button
              ?active=${this.currentTool === "brush"}
              @click=${() => this.setTool("brush")}
              >Brush</blocky-button
            >
            <blocky-button
              ?active=${this.currentTool === "lasso"}
              @click=${() => this.setTool("lasso")}
              >Lasso</blocky-button
            >
            <blocky-button
              ?active=${this.currentTool === "select"}
              @click=${() => this.setTool("select")}
              >Select</blocky-button
            >
            <blocky-button
              ?active=${this.currentTool === "pan"}
              @click=${() => this.setTool("pan")}
              >Pan</blocky-button
            >
          </div>
        </div>
      </div>
    `;
    }
}

// ============================================================
// Tool Settings Panel
// ============================================================

@customElement("inkwell-tool-settings-panel")
export class InkwellToolSettingsPanel extends FloatingPanel {
  @property({ type: String }) currentTool: DrawTool = "brush";
  @property({ type: Number }) pixelRes = 2;
  @property({ type: Object }) toolSettings: ToolSettings = {
    brush: { mode: "add", sizeMin: 1, sizeMax: 4, color: "#037ffc" },
    lasso: { mode: "add" },
    select: {},
    pan: {},
  };
  @property({ type: Object }) modifiers: Modifiers = {
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
  };

  static styles = css`
    ${FloatingPanel.styles}
  `;

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true })
    );
  }

  private setMode(tool: "brush" | "lasso", mode: DrawMode) {
    this.toolSettings = {
      ...this.toolSettings,
      [tool]: { ...this.toolSettings[tool], mode },
    };
    this.emit("settings-change", this.toolSettings);
  }

  private updateBrush(key: "sizeMin" | "sizeMax", value: number) {
    this.toolSettings = {
      ...this.toolSettings,
      brush: { ...this.toolSettings.brush, [key]: value },
    };
    this.emit("settings-change", this.toolSettings);
  }

  private renderPixelRes() {
    return html`
      <label>
        <span>Pixel Resolution: ${this.pixelRes}x</span>
        <input
          type="range"
          min="1"
          max="8"
          step="1"
          .value=${String(this.pixelRes)}
          @input=${(e: Event) => {
            this.pixelRes = parseInt((e.target as HTMLInputElement).value);
            this.emit("pixel-res-change", this.pixelRes);
          }}
        />
      </label>
    `;
  }

  private renderToolSettings() {
    const { currentTool, toolSettings, modifiers } = this;
    const hint = modifiers.shift ? "(Shift toggled)" : "";

    if (currentTool === "brush") {
      return html`
        <label>
          <span>Mode ${hint}</span>
          <div class="row">
            <blocky-button
              ?active=${toolSettings.brush.mode === "add"}
              @click=${() => this.setMode("brush", "add")}
              >Add</blocky-button
            >
            <blocky-button
              ?active=${toolSettings.brush.mode === "subtract"}
              @click=${() => this.setMode("brush", "subtract")}
              >Subtract</blocky-button
            >
          </div>
        </label>
        <label>
          <span>Size Min: ${toolSettings.brush.sizeMin}</span>
          <input
            type="range"
            min="0.5"
            max="10"
            step="0.5"
            .value=${String(toolSettings.brush.sizeMin)}
            @input=${(e: Event) =>
          this.updateBrush(
            "sizeMin",
                parseFloat((e.target as HTMLInputElement).value)
          )}
          />
        </label>
        <label>
          <span>Size Max: ${toolSettings.brush.sizeMax}</span>
          <input
            type="range"
            min="0.5"
            max="10"
            step="0.5"
            .value=${String(toolSettings.brush.sizeMax)}
            @input=${(e: Event) =>
          this.updateBrush(
            "sizeMax",
                parseFloat((e.target as HTMLInputElement).value)
          )}
          />
        </label>
        ${this.renderPixelRes()}
      `;
    }

    if (currentTool === "lasso") {
      return html`
        <label>
          <span>Mode ${hint}</span>
          <div class="row">
            <blocky-button
              ?active=${toolSettings.lasso.mode === "add"}
              @click=${() => this.setMode("lasso", "add")}
              >Add</blocky-button
            >
            <blocky-button
              ?active=${toolSettings.lasso.mode === "subtract"}
              @click=${() => this.setMode("lasso", "subtract")}
              >Subtract</blocky-button
            >
          </div>
        </label>
        ${this.renderPixelRes()}
      `;
    }

    if (currentTool === "select") {
      return html`<p class="hint">Click to select, drag to move.</p>`;
    }

    return html`<p class="hint">Drag to pan, scroll to zoom.</p>`;
  }

  render() {
    return html`
      <div class="block">
        <div class="face">
            <h3>Tool Settings</h3>
            ${this.renderToolSettings()}
        </div>
      </div>
    `;
  }
}

// ============================================================
// Universal Panel
// ============================================================

interface PanelVisibility {
  id: string;
  label: string;
  visible: boolean;
}

@customElement("inkwell-universal-panel")
export class InkwellUniversalPanel extends FloatingPanel {
  @property({ type: Number }) zoomLevel = 100;
  @property({ type: Number }) rotation = 0;
  @property({ type: Boolean }) cursorEnabled = true;

  @state() private panelVisibility: PanelVisibility[] = [
    { id: "color-panel", label: "HSV", visible: true },
    { id: "hsl-panel", label: "HSL", visible: true },
    { id: "okhsl-rect-panel", label: "OKHSL", visible: true },
    { id: "tools-panel", label: "Tools", visible: true },
    { id: "tool-settings-panel", label: "Settings", visible: true },
  ];

  static styles = css`
    ${FloatingPanel.styles}
  `;

  connectedCallback() {
    super.connectedCallback();
    this.syncPanelVisibility();
  }

  private syncPanelVisibility() {
    this.panelVisibility = this.panelVisibility.map((panel) => {
      const el = document.getElementById(panel.id);
      if (el) {
        const isHidden = el.style.display === "none";
        return { ...panel, visible: !isHidden };
      }
      return panel;
    });
  }

  private togglePanel(id: string) {
    const el = document.getElementById(id);
    if (el) {
      const panel = this.panelVisibility.find((p) => p.id === id);
      if (panel) {
        const newVisible = !panel.visible;
        el.style.display = newVisible ? "" : "none";
        this.panelVisibility = this.panelVisibility.map((p) =>
          p.id === id ? { ...p, visible: newVisible } : p
        );
      }
    }
  }

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true })
    );
  }

  render() {
    return html`
      <div class="block">
        <div class="face">
          <h3>View</h3>
            <div class="toggle">
              <span>Show Cursor</span>
              <input
                type="checkbox"
                .checked=${this.cursorEnabled}
                @change=${(e: Event) => {
        this.cursorEnabled = (e.target as HTMLInputElement).checked;
        this.emit("cursor-toggle", this.cursorEnabled);
      }}
              />
            </div>

            <label>
              <span>Zoom: ${this.zoomLevel}%</span>
              <div class="row">
                <blocky-button @click=${() => this.emit("zoom-out")}
                  >−</blocky-button
                >
                <blocky-button @click=${() => this.emit("zoom-reset")}
                  >Reset</blocky-button
                >
                <blocky-button @click=${() => this.emit("zoom-in")}
                  >+</blocky-button
                >
              </div>
            </label>

            <label>
              <span>Rotation: ${Math.round(this.rotation)}°</span>
              <div class="row">
                <blocky-button @click=${() => this.emit("rotate-ccw")}
                  >CCW</blocky-button
                >
                <blocky-button @click=${() => this.emit("rotate-reset")}
                  >Reset</blocky-button
                >
                <blocky-button @click=${() => this.emit("rotate-cw")}
                  >CW</blocky-button
                >
              </div>
            </label>

            <div class="row">
              <blocky-button @click=${() => this.emit("flatten")}
                >Flatten</blocky-button
              >
              <blocky-button danger @click=${() => this.emit("clear")}
                >Clear</blocky-button
              >
            </div>

          <section>
            <h3>Panels</h3>
            <div class="grid">
              ${this.panelVisibility.map(
                (panel) => html`
                  <blocky-button
                    ?active=${panel.visible}
                    @click=${() => this.togglePanel(panel.id)}
                    >${panel.label}</blocky-button
                  >
                `
              )}
            </div>
          </section>
        </div>
      </div>
    `;
  }
}

// ============================================================
// Type Declarations
// ============================================================

declare global {
  interface HTMLElementTagNameMap {
    "blocky-button": BlockyButton;
    "hsv-wheel": HSVWheel;
    "hsl-picker": HSLPicker;
    "okhsl-picker": OKHSLPicker;
    "okhsl-rect-picker": OKHSLRectPicker;
    "inkwell-color-panel": InkwellColorPanel;
    "inkwell-hsl-panel": InkwellHSLPanel;
    "inkwell-okhsl-rect-panel": InkwellOKHSLRectPanel;
    "inkwell-okhsl-panel": InkwellOKHSLPanel;
    "inkwell-tools-panel": InkwellToolsPanel;
    "inkwell-tool-settings-panel": InkwellToolSettingsPanel;
    "inkwell-universal-panel": InkwellUniversalPanel;
  }
}
