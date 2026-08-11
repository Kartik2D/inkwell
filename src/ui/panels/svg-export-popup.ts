import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { PopupWindow } from "../primitives/popup-window";
import { timelineStore } from "../../document/document";
import type { SvgExportOptions } from "../../export/svg-export";

export type { SvgExportOptions };

/**
 * Options popup for SVG export (opened from Settings → File).
 */
@customElement("flipcel-svg-export-popup")
export class FlipCelSvgExportPopup extends PopupWindow {
  static styles = css`
    ${PopupWindow.styles}

    :host {
      --panel-width: 260px;
      font-size: 12px;
    }

    .hint {
      margin: 0;
      color: var(--flipcel-text-secondary, #6b6b6b);
      font-weight: 500;
      line-height: 1.3;
    }

    .opt-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .toggle-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .label {
      color: var(--flipcel-text-secondary, #6b6b6b);
      font-weight: 600;
      font-size: 11px;
    }

    .frame-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .frame-row input {
      box-sizing: border-box;
      width: 4rem;
      font: inherit;
      font-variant-numeric: tabular-nums;
      padding: 5px 6px;
      margin: 0;
      border: none;
      border-radius: var(--flipcel-content-radius);
      background-color: var(--block-depth-color, #bcbcbc);
      color: var(--block-border, #555555);
      text-align: right;
      -moz-appearance: textfield;
      appearance: textfield;
    }

    .frame-row input::-webkit-outer-spin-button,
    .frame-row input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    .frame-row .sep {
      color: var(--flipcel-text-muted, #666);
      font-weight: 600;
    }
  `;

  @state() private splitLayers = false;
  @state() private autoCrop = false;
  @state() private transparentStage = true;
  @state() private frameFrom = 1;
  @state() private frameTo = 1;
  @state() private duration = 1;
  @state() private exporting = false;

  override async showNearAnchor(anchor: HTMLElement) {
    const t = timelineStore.get();
    this.duration = Math.max(1, t.duration);
    const cur = Math.min(this.duration, Math.max(1, t.currentFrame + 1));
    this.frameFrom = cur;
    this.frameTo = cur;
    this.exporting = false;
    await super.showNearAnchor(anchor);
  }

  private clampFrame(raw: string): number {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return 1;
    return Math.min(this.duration, Math.max(1, n));
  }

  private options(): SvgExportOptions {
    let from = this.frameFrom;
    let to = this.frameTo;
    if (to < from) [from, to] = [to, from];
    return {
      splitLayers: this.splitLayers,
      autoCrop: this.autoCrop,
      transparentStage: this.transparentStage,
      frameFrom: from,
      frameTo: to,
    };
  }

  private export() {
    if (this.exporting) return;
    this.exporting = true;
    this.dispatchEvent(
      new CustomEvent<SvgExportOptions>("svg-export", {
        detail: this.options(),
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Called by the app when the download finishes (success or fail). */
  exportFinished() {
    this.exporting = false;
    this.hidePanel();
  }

  render() {
    return this.renderPopupBlock(html`
      <p class="hint">Export SVG (stage)</p>
      <div class="opt-row">
        <div class="toggle-row">
          <blocky-button
            flat
            stretch
            ?accent=${this.splitLayers}
            title="One SVG file per layer (ZIP)"
            @click=${() => (this.splitLayers = !this.splitLayers)}
            >Split layers</blocky-button
          >
          <blocky-button
            flat
            stretch
            ?accent=${this.autoCrop}
            title="Crop to artwork bounds instead of the full stage"
            @click=${() => (this.autoCrop = !this.autoCrop)}
            >Auto crop</blocky-button
          >
          <blocky-button
            flat
            stretch
            ?accent=${this.transparentStage}
            title="Omit the stage color background"
            @click=${() => (this.transparentStage = !this.transparentStage)}
            >Transparent stage</blocky-button
          >
        </div>
        <div>
          <div class="label">Frames (1–${this.duration})</div>
          <div class="frame-row">
            <input
              type="number"
              min="1"
              max=${this.duration}
              step="1"
              .value=${String(this.frameFrom)}
              aria-label="From frame"
              @change=${(e: Event) => {
                this.frameFrom = this.clampFrame(
                  (e.target as HTMLInputElement).value,
                );
              }}
            />
            <span class="sep">to</span>
            <input
              type="number"
              min="1"
              max=${this.duration}
              step="1"
              .value=${String(this.frameTo)}
              aria-label="To frame"
              @change=${(e: Event) => {
                this.frameTo = this.clampFrame(
                  (e.target as HTMLInputElement).value,
                );
              }}
            />
          </div>
        </div>
      </div>
      <blocky-button
        flat
        accent
        stretch
        ?disabled=${this.exporting}
        @click=${() => this.export()}
        >${this.exporting ? "Exporting…" : "Export"}</blocky-button
      >
    `);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "flipcel-svg-export-popup": FlipCelSvgExportPopup;
  }
}
