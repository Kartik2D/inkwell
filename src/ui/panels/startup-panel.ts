import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { EXAMPLE_DOCUMENTS } from "../../document/startup-document";
import {
  themeModeStore,
  THEME_OPTIONS,
  THEMES,
  StoreController,
  type ThemeMode,
} from "../../state";
import { FloatingPanel } from "../primitives/floating-panel";
import { raisePanelZIndex } from "../primitives/panel-anchor";
import { renderThemePreview } from "../theme-preview";

function renderExamplePreview(id: string) {
  const glyph =
    id === "icons"
      ? html`
          <rect x="8" y="6" width="8" height="7" rx="1.5" fill="#5a5a5a" />
          <rect x="20" y="6" width="8" height="7" rx="1.5" fill="#8a8a8a" />
          <rect x="8" y="15" width="8" height="7" rx="1.5" fill="#8a8a8a" />
          <rect x="20" y="15" width="8" height="7" rx="1.5" fill="#5a5a5a" />
        `
      : html`<circle cx="18" cy="14" r="8" fill="#1e80fc" />`;
  return html`
    <svg
      class="theme-preview"
      viewBox="0 0 36 28"
      width="36"
      height="28"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="36" height="28" rx="6" fill="#e8e8e8" />
      ${glyph}
    </svg>
  `;
}

/**
 * Launch chooser shown on every app start.
 * A blank document is already loaded underneath — dismiss / Create new keep it.
 * Normal floating window (no modal scrim); closing hides it for the session.
 */
@customElement("flipcel-startup-panel")
export class FlipCelStartupPanel extends FloatingPanel {
  @property({ type: Boolean }) canRestoreAutosave = false;

  private themeMode = new StoreController(this, themeModeStore);

  static styles = css`
    ${FloatingPanel.styles}

    :host {
      --panel-width: 320px;
      z-index: 1100;
    }

    .block {
      flex: 0 0 auto;
      height: auto;
      min-height: 0;
    }

    .panel-body,
    .panel-body > .face {
      flex: 0 0 auto;
      min-height: 0;
      height: auto;
      overflow: visible;
    }

    .startup-welcome {
      margin: 0 0 var(--flipcel-space-3, 12px);
      padding: 0 var(--flipcel-space-1, 4px);
      text-align: center;
      font-size: 20px;
      font-weight: 600;
      line-height: 1.2;
      letter-spacing: -0.025em;
      color: var(--flipcel-text-primary, #1a1a1a);
    }

    .startup-chip-btn {
      width: 72px;
    }

    .startup-chip {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      width: 100%;
      min-width: 0;
      padding: 2px 0;
      box-sizing: border-box;
    }

    .startup-chip .theme-preview {
      display: block;
      width: 32px;
      height: 24px;
      flex: 0 0 auto;
      border-radius: 5px;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
    }

    .startup-chip-label {
      font-size: 10px;
      line-height: 1.1;
      font-weight: 500;
      letter-spacing: var(--flipcel-letter-spacing, -0.011em);
      text-align: center;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .startup-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      width: 100%;
    }

    .startup-actions blocky-button {
      flex: 1 1 0;
      min-width: 0;
    }

    .startup-actions blocky-button:last-child {
      flex: 1 1 100%;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.pinned = true;
    this.showPinnedClose = true;
    this.draggable = true;
    this.resizable = false;
  }

  /** Open as a normal floating window, centered in the viewport. */
  async show() {
    this.pinned = true;
    this.style.display = "";
    this.style.right = "auto";
    this.style.bottom = "auto";
    raisePanelZIndex(this);
    await this.updateComplete;
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const width = this.offsetWidth || 280;
    const height = this.offsetHeight || 140;
    this.style.left = `${Math.max(8, (window.innerWidth - width) / 2)}px`;
    this.style.top = `${Math.max(8, (window.innerHeight - height) / 2)}px`;
    this.playShowAnimation();
  }

  private dismiss() {
    this.hidePanel();
  }

  private loadFile() {
    this.dispatchEvent(
      new CustomEvent("startup-load-file", { bubbles: true, composed: true }),
    );
  }

  private restorePrevious() {
    this.dispatchEvent(
      new CustomEvent("startup-restore-autosave", { bubbles: true, composed: true }),
    );
  }

  private loadExample(id: string) {
    this.dispatchEvent(
      new CustomEvent("startup-load-example", {
        detail: id,
        bubbles: true,
        composed: true,
      }),
    );
    this.hidePanel();
  }

  private themeAriaLabel(mode: ThemeMode): string {
    return `Theme: ${THEMES[mode].label}`;
  }

  render() {
    return this.renderFloatingBlock(
      undefined,
      html`
        <h2 class="startup-welcome">Welcome to FlipCel</h2>

        <flipcel-panel-section data-interactive>
          <flipcel-scroll-strip
            label="Pick a theme"
            center-label
            flush
            rows="2"
          >
            ${THEME_OPTIONS.map(
              (mode) => html`
                <blocky-button
                  class="startup-chip-btn"
                  flat
                  ?active=${this.themeMode.value === mode}
                  aria-label=${this.themeAriaLabel(mode)}
                  @click=${() => this.themeMode.set(mode)}
                >
                  <span class="startup-chip">
                    ${renderThemePreview(mode)}
                    <span class="startup-chip-label">${THEMES[mode].label}</span>
                  </span>
                </blocky-button>
              `,
            )}
          </flipcel-scroll-strip>
        </flipcel-panel-section>

        <flipcel-panel-section data-interactive>
          <flipcel-scroll-strip
            label="Open an example"
            center-label
            flush
            rows="1"
          >
            ${EXAMPLE_DOCUMENTS.map(
              (example) => html`
                <blocky-button
                  class="startup-chip-btn"
                  flat
                  aria-label=${`Open example: ${example.label}`}
                  @click=${() => this.loadExample(example.id)}
                >
                  <span class="startup-chip">
                    ${renderExamplePreview(example.id)}
                    <span class="startup-chip-label">${example.label}</span>
                  </span>
                </blocky-button>
              `,
            )}
          </flipcel-scroll-strip>
        </flipcel-panel-section>

        <flipcel-panel-section title="File" data-interactive>
          <div class="startup-actions">
            <blocky-button flat large stretch @click=${() => this.loadFile()}
              >Open</blocky-button
            >
            <blocky-button
              flat
              large
              stretch
              ?disabled=${!this.canRestoreAutosave}
              @click=${() => this.restorePrevious()}
              >Restore</blocky-button
            >
            <blocky-button flat large accent stretch @click=${() => this.dismiss()}
              >New</blocky-button
            >
          </div>
        </flipcel-panel-section>
      `,
    );
  }
}
