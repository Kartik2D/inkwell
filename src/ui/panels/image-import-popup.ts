import { html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { PopupWindow } from "../primitives/popup-window";
import {
  anchorPanelBelowTrigger,
  raisePanelZIndex,
} from "../primitives/panel-anchor";
import {
  DEFAULT_IMAGE_IMPORT_OPTIONS,
  TURN_POLICY_OPTIONS,
  type ImageImportOptions,
} from "../../import/image-import";

export type { ImageImportOptions };

export type ImageImportDetail = {
  file: File;
  options: ImageImportOptions;
};

/**
 * Tracer options popup for importing a bitmap as vector paths.
 * Opened from Settings → Import Image or by dropping an image on the app.
 */
@customElement("flipcel-image-import-popup")
export class FlipCelImageImportPopup extends PopupWindow {
  static styles = css`
    ${PopupWindow.styles}

    :host {
      --panel-width: 280px;
      font-size: 12px;
    }

    .hint {
      margin: 0;
      color: var(--flipcel-text-secondary, #6b6b6b);
      font-weight: 500;
      line-height: 1.3;
      word-break: break-all;
    }

    .opt-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
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

    .slider-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .slider-row input[type="range"] {
      width: 100%;
      margin: 0;
    }

    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
  `;

  @state() private fileName = "";
  @state() private importing = false;
  @state() private extractcolors = DEFAULT_IMAGE_IMPORT_OPTIONS.extractcolors;
  @state() private snapToDocumentColors =
    DEFAULT_IMAGE_IMPORT_OPTIONS.snapToDocumentColors;
  @state() private turdsize = DEFAULT_IMAGE_IMPORT_OPTIONS.turdsize;
  @state() private turnpolicy = DEFAULT_IMAGE_IMPORT_OPTIONS.turnpolicy;
  @state() private alphamax = DEFAULT_IMAGE_IMPORT_OPTIONS.alphamax;
  @state() private opticurve = DEFAULT_IMAGE_IMPORT_OPTIONS.opticurve;
  @state() private opttolerance = DEFAULT_IMAGE_IMPORT_OPTIONS.opttolerance;
  @state() private threshold = DEFAULT_IMAGE_IMPORT_OPTIONS.threshold;
  @state() private posterizelevel = DEFAULT_IMAGE_IMPORT_OPTIONS.posterizelevel;
  @state() private posterizationalgorithm =
    DEFAULT_IMAGE_IMPORT_OPTIONS.posterizationalgorithm;

  private file: File | null = null;

  private options(): ImageImportOptions {
    return {
      turdsize: this.turdsize,
      turnpolicy: this.turnpolicy,
      alphamax: this.alphamax,
      opticurve: this.opticurve,
      opttolerance: this.opttolerance,
      threshold: this.threshold,
      extractcolors: this.extractcolors,
      posterizelevel: this.posterizelevel,
      posterizationalgorithm: this.posterizationalgorithm,
      snapToDocumentColors: this.snapToDocumentColors,
    };
  }

  /**
   * Open with a file ready to import. Anchor below a trigger when provided;
   * otherwise center in the viewport (drag-drop).
   */
  async openForFile(file: File, anchor?: HTMLElement | null): Promise<void> {
    this.file = file;
    this.fileName = file.name;
    this.importing = false;
    this.style.display = "";
    await this.updateComplete;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );

    if (anchor) {
      anchorPanelBelowTrigger(this, anchor);
    } else {
      const rect = this.getBoundingClientRect();
      const left = Math.max(8, (window.innerWidth - rect.width) / 2);
      const top = Math.max(8, (window.innerHeight - rect.height) / 2);
      this.style.left = `${Math.round(left)}px`;
      this.style.top = `${Math.round(top)}px`;
      this.style.right = "auto";
      this.style.bottom = "auto";
    }
    raisePanelZIndex(this);
    this.playShowAnimation();
  }

  private import() {
    if (this.importing || !this.file) return;
    this.importing = true;
    this.dispatchEvent(
      new CustomEvent<ImageImportDetail>("image-import", {
        detail: { file: this.file, options: this.options() },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Called by the app when the import finishes (success or fail). */
  importFinished() {
    this.importing = false;
    this.file = null;
    this.hidePanel();
  }

  override hidePanel() {
    if (!this.importing) {
      this.file = null;
    }
    super.hidePanel();
  }

  render() {
    return this.renderPopupBlock(html`
      <p class="hint">Trace ${this.fileName || "image"}</p>
      <div class="opt-row">
        <div class="toggle-row">
          <blocky-button
            flat
            stretch
            ?accent=${this.extractcolors}
            title="Extract multiple colors (posterize)"
            @click=${() => (this.extractcolors = !this.extractcolors)}
            >Extract colors</blocky-button
          >
          <blocky-button
            flat
            stretch
            ?accent=${this.snapToDocumentColors}
            title="Remap fills to the nearest document color"
            @click=${() =>
              (this.snapToDocumentColors = !this.snapToDocumentColors)}
            >Snap to doc colors</blocky-button
          >
          <blocky-button
            flat
            stretch
            ?accent=${this.opticurve}
            title="Optimize curves after tracing"
            @click=${() => (this.opticurve = !this.opticurve)}
            >Optimize curves</blocky-button
          >
        </div>

        ${this.extractcolors
          ? html`
              <div class="slider-row">
                <span class="label"
                  >Posterize level: ${this.posterizelevel}</span
                >
                <input
                  type="range"
                  min="1"
                  max="32"
                  step="1"
                  .value=${String(this.posterizelevel)}
                  @input=${(e: Event) => {
                    this.posterizelevel = Number(
                      (e.target as HTMLInputElement).value,
                    );
                  }}
                />
              </div>
              <div>
                <div class="label">Posterize algorithm</div>
                <div class="chip-row">
                  <blocky-button
                    flat
                    stretch
                    ?accent=${this.posterizationalgorithm === 0}
                    @click=${() => (this.posterizationalgorithm = 0)}
                    >Simple</blocky-button
                  >
                  <blocky-button
                    flat
                    stretch
                    ?accent=${this.posterizationalgorithm === 1}
                    @click=${() => (this.posterizationalgorithm = 1)}
                    >Interpolation</blocky-button
                  >
                </div>
              </div>
            `
          : html`
              <div class="slider-row">
                <span class="label"
                  >Threshold: ${this.threshold.toFixed(2)}</span
                >
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  .value=${String(this.threshold)}
                  @input=${(e: Event) => {
                    this.threshold = Number(
                      (e.target as HTMLInputElement).value,
                    );
                  }}
                />
              </div>
            `}

        <div class="slider-row">
          <span class="label">Turd size: ${this.turdsize}</span>
          <input
            type="range"
            min="0"
            max="20"
            step="1"
            .value=${String(this.turdsize)}
            @input=${(e: Event) => {
              this.turdsize = Number((e.target as HTMLInputElement).value);
            }}
          />
        </div>

        <div class="slider-row">
          <span class="label">Corner threshold: ${this.alphamax.toFixed(2)}</span>
          <input
            type="range"
            min="0"
            max="1.34"
            step="0.01"
            .value=${String(this.alphamax)}
            @input=${(e: Event) => {
              this.alphamax = Number((e.target as HTMLInputElement).value);
            }}
          />
        </div>

        ${this.opticurve
          ? html`
              <div class="slider-row">
                <span class="label"
                  >Curve tolerance: ${this.opttolerance.toFixed(2)}</span
                >
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  .value=${String(this.opttolerance)}
                  @input=${(e: Event) => {
                    this.opttolerance = Number(
                      (e.target as HTMLInputElement).value,
                    );
                  }}
                />
              </div>
            `
          : nothing}

        <div>
          <div class="label">Turn policy</div>
          <div class="chip-row">
            ${TURN_POLICY_OPTIONS.map(
              (opt) => html`
                <blocky-button
                  flat
                  ?accent=${this.turnpolicy === opt.value}
                  @click=${() => (this.turnpolicy = opt.value)}
                  >${opt.label}</blocky-button
                >
              `,
            )}
          </div>
        </div>
      </div>
      <blocky-button
        flat
        accent
        stretch
        ?disabled=${this.importing || !this.fileName}
        @click=${() => this.import()}
        >${this.importing ? "Tracing…" : "Import"}</blocky-button
      >
    `);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "flipcel-image-import-popup": FlipCelImageImportPopup;
  }
}
