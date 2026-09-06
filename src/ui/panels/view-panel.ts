import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import {
  viewOverlayStore,
  normalizeViewOverlaySettings,
  onionSkinStore,
  brushSizeIndicatorStore,
  type ViewOverlaySettings,
  StoreController,
} from "../../state";
import { FloatingPanel } from "../primitives/floating-panel";

@customElement("flipcel-view-panel")
export class FlipCelViewPanel extends FloatingPanel {
  private viewOverlay = new StoreController(this, viewOverlayStore);
  private onionSkin = new StoreController(this, onionSkinStore);
  private brushSizeIndicator = new StoreController(this, brushSizeIndicatorStore);

  static styles = css`
    ${FloatingPanel.styles}

    .color-row {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 0;
      min-height: 28px;
    }

    .color-row > span {
      flex: 0 0 auto;
      color: var(--flipcel-text-secondary, #333333);
    }

    .color-row:has(button:disabled) {
      opacity: 0.45;
    }

    .color-swatch {
      appearance: none;
      display: block;
      width: 28px;
      height: 28px;
      flex: 0 0 28px;
      margin-left: auto;
      padding: 0;
      border-radius: var(--flipcel-content-radius);
      border: var(--block-border-width, var(--flipcel-block-border-width, 2px)) solid
        var(--block-border, #555555);
      box-sizing: border-box;
      cursor: pointer;
    }

    .color-swatch:hover {
      filter: brightness(1.05);
    }

    .color-swatch:disabled {
      cursor: default;
      filter: none;
    }
  `;

  private updateViewOverlay(patch: Partial<ViewOverlaySettings>) {
    this.viewOverlay.update((v) =>
      normalizeViewOverlaySettings({ ...v, ...patch }),
    );
  }

  private renderGridSettings(gridOn: boolean) {
    const {
      gridSpacing,
      gridMajorEvery,
      gridMinorOpacity,
      gridMajorOpacity,
    } = this.viewOverlay.value;
    const minorPct = Math.round(gridMinorOpacity * 100);
    const majorPct = Math.round(gridMajorOpacity * 100);

    return html`
      <label>
        <span>Spacing: ${gridSpacing}</span>
        <input
          type="range"
          min="10"
          max="500"
          step="10"
          .value=${String(gridSpacing)}
          ?disabled=${!gridOn}
          @input=${(e: Event) => {
            this.updateViewOverlay({
              gridSpacing: parseInt((e.target as HTMLInputElement).value, 10),
            });
          }}
        />
      </label>
      <label>
        <span>Major every: ${gridMajorEvery}</span>
        <input
          type="range"
          min="2"
          max="20"
          step="1"
          .value=${String(gridMajorEvery)}
          ?disabled=${!gridOn}
          @input=${(e: Event) => {
            this.updateViewOverlay({
              gridMajorEvery: parseInt((e.target as HTMLInputElement).value, 10),
            });
          }}
        />
      </label>
      <label>
        <span>Minor opacity: ${minorPct}%</span>
        <input
          type="range"
          min="0"
          max="30"
          step="1"
          .value=${String(minorPct)}
          ?disabled=${!gridOn}
          @input=${(e: Event) => {
            this.updateViewOverlay({
              gridMinorOpacity:
                parseInt((e.target as HTMLInputElement).value, 10) / 100,
            });
          }}
        />
      </label>
      <label>
        <span>Major opacity: ${majorPct}%</span>
        <input
          type="range"
          min="0"
          max="40"
          step="1"
          .value=${String(majorPct)}
          ?disabled=${!gridOn}
          @input=${(e: Event) => {
            this.updateViewOverlay({
              gridMajorOpacity:
                parseInt((e.target as HTMLInputElement).value, 10) / 100,
            });
          }}
        />
      </label>
    `;
  }

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true }),
    );
  }

  render() {
    const gridOn = this.viewOverlay.value.gridEnabled;
    const onionOn = this.onionSkin.value;
    const onionOutline = this.viewOverlay.value.onionSkinOutline;
    const onionLayers = this.viewOverlay.value.onionSkinLayers;
    const onionPrevColor = this.viewOverlay.value.onionSkinPrevColor;
    const onionNextColor = this.viewOverlay.value.onionSkinNextColor;
    const onionOpacityPct = Math.round(this.viewOverlay.value.onionSkinOpacity * 100);
    const onionOutlineWidth = this.viewOverlay.value.onionSkinOutlineWidth;
    return this.renderFloatingBlock(
      "View",
      html`
            <flipcel-panel-section title="Onion Skin" data-interactive>
              <div class="toggle">
                <span>Enable onion skin</span>
                <input
                  type="checkbox"
                  .checked=${onionOn}
                  @change=${() => this.emit("onion-toggle")}
                />
              </div>
              <div class="toggle">
                <span>Show outline</span>
                <input
                  type="checkbox"
                  .checked=${onionOutline}
                  ?disabled=${!onionOn}
                  @change=${(e: Event) => {
                    const checked = (e.target as HTMLInputElement).checked;
                    this.updateViewOverlay({ onionSkinOutline: checked });
                  }}
                />
              </div>
              <label>
                <span>Outline: ${onionOutlineWidth}</span>
                <input
                  type="range"
                  min="1"
                  max="24"
                  step="1"
                  .value=${String(onionOutlineWidth)}
                  ?disabled=${!onionOn || !onionOutline}
                  @input=${(e: Event) => {
                    this.updateViewOverlay({
                      onionSkinOutlineWidth: parseInt(
                        (e.target as HTMLInputElement).value,
                        10,
                      ),
                    });
                  }}
                />
              </label>
              <label>
                <span>Layers</span>
                <div class="row">
                  <blocky-button
                    flat
                    .help=${"view.onion-active"}
                    ?active=${onionLayers === "active"}
                    ?disabled=${!onionOn}
                    @click=${() => this.updateViewOverlay({ onionSkinLayers: "active" })}
                    >Active</blocky-button
                  >
                  <blocky-button
                    flat
                    .help=${"view.onion-all"}
                    ?active=${onionLayers === "all"}
                    ?disabled=${!onionOn}
                    @click=${() => this.updateViewOverlay({ onionSkinLayers: "all" })}
                    >All</blocky-button
                  >
                </div>
              </label>
              <div class="color-row">
                <span>Previous</span>
                <button
                  type="button"
                  class="color-swatch"
                  style="background:${onionPrevColor}"
                  title=${onionPrevColor}
                  data-interactive
                  ?disabled=${!onionOn}
                  @click=${(e: Event) => {
                    this.emit("onion-color-picker-open", {
                      which: "prev",
                      anchor: e.currentTarget as HTMLElement,
                    });
                  }}
                ></button>
              </div>
              <div class="color-row">
                <span>Next</span>
                <button
                  type="button"
                  class="color-swatch"
                  style="background:${onionNextColor}"
                  title=${onionNextColor}
                  data-interactive
                  ?disabled=${!onionOn}
                  @click=${(e: Event) => {
                    this.emit("onion-color-picker-open", {
                      which: "next",
                      anchor: e.currentTarget as HTMLElement,
                    });
                  }}
                ></button>
              </div>
              <label>
                <span>Opacity: ${onionOpacityPct}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  .value=${String(onionOpacityPct)}
                  ?disabled=${!onionOn}
                  @input=${(e: Event) => {
                    this.updateViewOverlay({
                      onionSkinOpacity:
                        parseInt((e.target as HTMLInputElement).value, 10) / 100,
                    });
                  }}
                />
              </label>
            </flipcel-panel-section>
            <flipcel-panel-section title="Grid" data-interactive>
              <div class="toggle">
                <span>Enable grid</span>
                <input
                  type="checkbox"
                  .checked=${gridOn}
                  @change=${(e: Event) => {
                    const checked = (e.target as HTMLInputElement).checked;
                    this.updateViewOverlay({ gridEnabled: checked });
                  }}
                />
              </div>
              <flipcel-disclosure label="Settings" data-interactive>
                ${this.renderGridSettings(gridOn)}
              </flipcel-disclosure>
            </flipcel-panel-section>
            <flipcel-panel-section title="Brush" data-interactive>
              <div class="toggle">
                <span>Show size</span>
                <input
                  type="checkbox"
                  .checked=${this.brushSizeIndicator.value}
                  @change=${(e: Event) => {
                    brushSizeIndicatorStore.set(
                      (e.target as HTMLInputElement).checked,
                    );
                  }}
                />
              </div>
            </flipcel-panel-section>
      `,
    );
  }
}
