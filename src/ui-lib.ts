/**
 * Blocky UI Library
 *
 * A minimal UI component library using CSS custom properties for inheritance.
 * Block defines all visual styling via CSS variables including 3D face effect.
 * Child components inherit automatically and only add functional overrides.
 */
import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { DrawTool, DrawMode, ToolSettings, Modifiers } from "./types";

// ============================================================
// Block - Base component with 3D face design
// ============================================================

export class Block extends LitElement {
  @property({ type: Boolean, reflect: true }) active = false;

  static styles = css`
    :host {
      /* Design tokens */
      --block-bg: #ffffff;
      --block-border: #9f9f9f;
      --block-radius: 5px;
      --block-depth-color: #b5b5b5;
      --block-face-bg: #ffffff;
      --block-face-padding: 12px;
      --block-font: system-ui, sans-serif;
      --block-font-size: 13px;
      --block-font-weight: 500;
      --block-color: #333;

      /* Base styles */
      display: block;
      box-sizing: border-box;
      background: var(--block-bg);
      border: 2px solid var(--block-border);
      border-radius: var(--block-radius);
      box-shadow: 0 6px 3px rgba(0, 0, 0, 0.08);
      font-family: var(--block-font);
      font-size: var(--block-font-size);
      font-weight: var(--block-font-weight);
      color: var(--block-color);
    }

    /* Face element */
    .face {
      background: var(--block-face-bg);
      border-radius: calc(var(--block-radius) - 2px);
      padding: var(--block-face-padding);
    }
  `;

  render() {
    return html`<div class="face"><slot></slot></div>`;
  }
}

// ============================================================
// BlockyButton - Inherits Block, adds button behavior
// ============================================================

@customElement("blocky-button")
export class BlockyButton extends Block {
  @property({ type: Boolean, reflect: true }) danger = false;

  static styles = css`
    ${Block.styles}

    /* Button behavior */
    :host {
      display: inline-block;
      cursor: pointer;
      text-align: center;
      position: relative;
      top: 0;
      transition:
        top 100ms ease-in-out,
        box-shadow 100ms ease-in-out;
      /* Depth: 4px, Soft shadow: 6px from top */
      box-shadow:
        0 4px var(--block-depth-color),
        0 6px 3px rgba(0, 0, 0, 0.08);
    }

    /* Hover - slight press */
    :host(:hover) {
      top: 2px;
      /* Depth: 2px, Soft shadow: 4px (2+4=6, stays visually at same spot) */
      box-shadow:
        0 2px var(--block-depth-color),
        0 4px 3px rgba(0, 0, 0, 0.08);
    }

    /* Active/pressed - fully pressed */
    :host(:active),
    :host([active]) {
      top: 4px;
      /* Depth: 0, Soft shadow: 2px (4+2=6, stays visually at same spot) */
      box-shadow:
        0 0 var(--block-depth-color),
        0 2px 3px rgba(0, 0, 0, 0.08);
      --block-face-bg: #f0f0f0;
    }

    /* Danger variant */
    :host([danger]) {
      --block-face-bg: #333;
      --block-color: white;
    }
  `;
}

// ============================================================
// InkwellControlPanel - Inherits Block, adds panel layout
// ============================================================

@customElement("inkwell-control-panel")
export class InkwellControlPanel extends Block {
  static styles = css`
    ${Block.styles}

    /* Panel positioning */
    :host {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      width: 240px;
      /* Panel has depth but no interactive states */
      box-shadow:
        0 4px var(--block-depth-color),
        0 6px 3px rgba(0, 0, 0, 0.08);
    }

    /* Mobile drawer */
    @media (max-width: 600px) {
      :host {
        top: auto;
        right: 0;
        bottom: 0;
        left: 0;
        width: auto;
        max-height: 70vh;
        overflow-y: auto;
        border-radius: var(--block-radius) var(--block-radius) 0 0;
        transform: translateY(100%);
        transition: transform 0.3s ease;
      }

      :host(.open) {
        transform: translateY(0);
      }
    }

    /* Internal layout */
    section {
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--block-border);
    }

    section:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }

    h3 {
      margin: 0 0 12px;
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

    input[type="range"] {
      width: 100%;
    }

    input[type="color"] {
      width: 32px;
      height: 32px;
      border: none;
      cursor: pointer;
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

  @property({ type: String }) currentTool: DrawTool = "brush";
  @property({ type: Number }) zoomLevel = 100;
  @property({ type: Number }) rotation = 0;
  @property({ type: Boolean }) cursorEnabled = true;
  @property({ type: Number }) pixelRes = 2;

  @property({ type: Object }) toolSettings: ToolSettings = {
    brush: { mode: "add", sizeMin: 1, sizeMax: 4, color: "#000000" },
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

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true }),
    );
  }

  private setTool(tool: DrawTool) {
    this.currentTool = tool;
    this.emit("tool-change", tool);
  }

  private setMode(tool: "brush" | "lasso", mode: DrawMode) {
    this.toolSettings = {
      ...this.toolSettings,
      [tool]: { ...this.toolSettings[tool], mode },
    };
    this.emit("settings-change", this.toolSettings);
  }

  private updateBrush(
    key: "sizeMin" | "sizeMax" | "color",
    value: number | string,
  ) {
    this.toolSettings = {
      ...this.toolSettings,
      brush: { ...this.toolSettings.brush, [key]: value },
    };
    this.emit("settings-change", this.toolSettings);
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
                parseFloat((e.target as HTMLInputElement).value),
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
                parseFloat((e.target as HTMLInputElement).value),
              )}
          />
        </label>
        <label>
          <span>Color</span>
          <input
            type="color"
            .value=${toolSettings.brush.color}
            @input=${(e: Event) =>
              this.updateBrush("color", (e.target as HTMLInputElement).value)}
          />
        </label>
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
      `;
    }

    if (currentTool === "select") {
      return html`<p class="hint">Click to select, drag to move.</p>`;
    }

    return html`<p class="hint">Drag to pan, scroll to zoom.</p>`;
  }

  render() {
    return html`
      <div class="face">
        <section>
          <h3>Tools</h3>
          <div class="grid">
            <blocky-button
              ?active=${this.currentTool === "brush"}
              @click=${() => this.setTool("brush")}
              >🖌 Brush</blocky-button
            >
            <blocky-button
              ?active=${this.currentTool === "lasso"}
              @click=${() => this.setTool("lasso")}
              >⭕ Lasso</blocky-button
            >
            <blocky-button
              ?active=${this.currentTool === "select"}
              @click=${() => this.setTool("select")}
              >↖ Select</blocky-button
            >
            <blocky-button
              ?active=${this.currentTool === "pan"}
              @click=${() => this.setTool("pan")}
              >✋ Pan</blocky-button
            >
          </div>
        </section>

        <section>
          <h3>Tool Settings</h3>
          ${this.renderToolSettings()}
        </section>

        <section>
          <h3>Settings</h3>
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
                >↺</blocky-button
              >
              <blocky-button @click=${() => this.emit("rotate-reset")}
                >Reset</blocky-button
              >
              <blocky-button @click=${() => this.emit("rotate-cw")}
                >↻</blocky-button
              >
            </div>
          </label>

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

          <div class="row">
            <blocky-button @click=${() => this.emit("flatten")}
              >Flatten</blocky-button
            >
            <blocky-button danger @click=${() => this.emit("clear")}
              >Clear</blocky-button
            >
          </div>
        </section>
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
    "inkwell-control-panel": InkwellControlPanel;
  }
}
