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
