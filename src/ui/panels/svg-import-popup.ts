import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { PopupWindow } from "../primitives/popup-window";
import {
  anchorPanelBelowTrigger,
  raisePanelZIndex,
} from "../primitives/panel-anchor";
import {
  DEFAULT_SVG_IMPORT_OPTIONS,
  remapSvgColorsForPreview,
  type SvgImportOptions,
} from "../../import/svg-import";
import { documentColorsStore } from "../../state";

export type { SvgImportOptions };

export type SvgImportDetail = {
  file: File;
  options: SvgImportOptions;
};

/**
 * Options popup for importing an SVG as fill paths (no tracer).
 * Opened from Settings → Import SVG or by dropping an SVG on the app.
 */
@customElement("flipcel-svg-import-popup")
export class FlipCelSvgImportPopup extends PopupWindow {
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

    .preview {
      width: 100%;
      aspect-ratio: 1;
      max-height: 200px;
      box-sizing: border-box;
      border-radius: var(--flipcel-content-radius, 6px);
      background:
        linear-gradient(45deg, #cfcfcf 25%, transparent 25%) 0 0 / 12px 12px,
        linear-gradient(-45deg, #cfcfcf 25%, transparent 25%) 0 6px / 12px 12px,
        linear-gradient(45deg, transparent 75%, #cfcfcf 75%) 6px -6px / 12px 12px,
        linear-gradient(-45deg, transparent 75%, #cfcfcf 75%) -6px 0 / 12px 12px,
        #e8e8e8;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .preview img {
      display: block;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .preview-empty {
      color: var(--flipcel-text-secondary, #6b6b6b);
      font-weight: 500;
    }
  `;

  @state() private fileName = "";
  @state() private importing = false;
  @state() private snapToDocumentColors =
    DEFAULT_SVG_IMPORT_OPTIONS.snapToDocumentColors;
  @state() private previewUrl = "";

  private file: File | null = null;
  private sourceSvg = "";
  private previewGen = 0;

  async openForFile(file: File, anchor?: HTMLElement | null): Promise<void> {
    this.file = file;
    this.fileName = file.name;
    this.importing = false;
    this.sourceSvg = "";
    this.clearPreviewUrl();
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

    try {
      this.sourceSvg = await file.text();
      await this.refreshPreview();
    } catch {
      this.sourceSvg = "";
      this.clearPreviewUrl();
    }
  }

  private clearPreviewUrl() {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = "";
  }

  private async refreshPreview() {
    const gen = ++this.previewGen;
    if (!this.sourceSvg) {
      this.clearPreviewUrl();
      return;
    }

    let text = this.sourceSvg;
    if (this.snapToDocumentColors) {
      text = remapSvgColorsForPreview(text, documentColorsStore.get());
    }

    const blob = new Blob([text], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    if (gen !== this.previewGen) {
      URL.revokeObjectURL(url);
      return;
    }
    this.clearPreviewUrl();
    this.previewUrl = url;
  }

  private toggleSnap() {
    this.snapToDocumentColors = !this.snapToDocumentColors;
    void this.refreshPreview();
  }

  private import() {
    if (this.importing || !this.file) return;
    this.importing = true;
    this.dispatchEvent(
      new CustomEvent<SvgImportDetail>("svg-import", {
        detail: {
          file: this.file,
          options: { snapToDocumentColors: this.snapToDocumentColors },
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  importFinished() {
    this.importing = false;
    this.file = null;
    this.sourceSvg = "";
    this.clearPreviewUrl();
    this.hidePanel();
  }

  override hidePanel() {
    if (!this.importing) {
      this.file = null;
      this.sourceSvg = "";
      this.clearPreviewUrl();
    }
    super.hidePanel();
  }

  render() {
    return this.renderPopupBlock(html`
      <p class="hint">Import ${this.fileName || "SVG"}</p>
      <div class="opt-row">
        <div class="preview">
          ${this.previewUrl
            ? html`<img src=${this.previewUrl} alt="SVG preview" />`
            : html`<span class="preview-empty">Preview</span>`}
        </div>
        <blocky-button
          flat
          stretch
          ?accent=${this.snapToDocumentColors}
          title="Snap fills to document colors"
          @click=${() => this.toggleSnap()}
          >Snap to doc colors</blocky-button
        >
        <p class="hint">Strokes become fills. No tracing.</p>
        <blocky-button
          flat
          accent
          stretch
          ?disabled=${this.importing || !this.file}
          @click=${() => this.import()}
          >${this.importing ? "Importing…" : "Import"}</blocky-button
        >
      </div>
    `);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "flipcel-svg-import-popup": FlipCelSvgImportPopup;
  }
}
