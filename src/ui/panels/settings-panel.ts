import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import {
  themeModeStore,
  wheelFrictionStore,
  wheelDirectionStore,
  THEME_OPTIONS,
  THEMES,
  WHEEL_FRICTION_OPTIONS,
  WHEEL_DIRECTION_OPTIONS,
  StoreController,
} from "../../state";
import { FloatingPanel } from "../primitives/floating-panel";
import { renderThemePreview } from "../theme-preview";

@customElement("flipcel-universal-panel")
export class FlipCelUniversalPanel extends FloatingPanel {
  @property({ type: Boolean }) aliasFixEnabled = false;
  @property({ type: Boolean }) historyWindowVisible = false;
  @property({ type: Boolean }) keyboardShortcutsVisible = false;
  @property({ type: Boolean }) tutorialsVisible = false;

  private themeMode = new StoreController(this, themeModeStore);
  private wheelFriction = new StoreController(this, wheelFrictionStore);
  private wheelDirection = new StoreController(this, wheelDirectionStore);

  static styles = css`
    ${FloatingPanel.styles}

    :host {
      --panel-width: 280px;
    }

    .theme-chip-btn {
      width: 76px;
    }

    .theme-option {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      min-width: 0;
      padding: 2px 0;
      box-sizing: border-box;
    }

    .theme-preview {
      display: block;
      width: 36px;
      height: 28px;
      flex: 0 0 auto;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
    }

    .theme-label {
      font-size: 12px;
      line-height: 1.1;
      font-weight: 600;
    }
  `;

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true })
    );
  }

  render() {
    return this.renderFloatingBlock(
      "Settings",
      html`
            <flipcel-panel-section data-interactive>
              <div class="row">
                <blocky-button
                  flat
                  .help=${"settings.history"}
                  ?active=${this.historyWindowVisible}
                  @click=${() => {
                    this.historyWindowVisible = !this.historyWindowVisible;
                    this.emit("history-window-toggle", this.historyWindowVisible);
                  }}
                  >History</blocky-button
                >
                <blocky-button
                  flat
                  .help=${"settings.shortcuts"}
                  ?active=${this.keyboardShortcutsVisible}
                  @click=${() => {
                    this.keyboardShortcutsVisible = !this.keyboardShortcutsVisible;
                    this.emit(
                      "keyboard-shortcuts-toggle",
                      this.keyboardShortcutsVisible,
                    );
                  }}
                  >Shortcuts</blocky-button
                >
              </div>

              <div class="row">
                <blocky-button
                  flat
                  .help=${"settings.tutorials"}
                  ?active=${this.tutorialsVisible}
                  @click=${() => {
                    this.tutorialsVisible = !this.tutorialsVisible;
                    this.emit("tutorials-toggle", this.tutorialsVisible);
                  }}
                  >Tutorials</blocky-button
                >
              </div>
            </flipcel-panel-section>

            <flipcel-panel-section title="Animation Wheel" data-interactive>
              <label>
                <span>Friction</span>
                <div class="row">
                  ${WHEEL_FRICTION_OPTIONS.map(
                    (level) => html`
                      <blocky-button
                        flat
                        ?active=${this.wheelFriction.value === level}
                        @click=${() => this.wheelFriction.set(level)}
                        >${level.charAt(0).toUpperCase() + level.slice(1)}</blocky-button
                      >
                    `,
                  )}
                </div>
              </label>
              <label>
                <span>Direction</span>
                <div class="row">
                  ${WHEEL_DIRECTION_OPTIONS.map(
                    (direction) => html`
                      <blocky-button
                        flat
                        ?active=${this.wheelDirection.value === direction}
                        @click=${() => this.wheelDirection.set(direction)}
                        >${direction === "clockwise"
                          ? "Clockwise"
                          : "Counterclockwise"}</blocky-button
                      >
                    `,
                  )}
                </div>
              </label>
            </flipcel-panel-section>

            <flipcel-panel-section data-interactive>
              <flipcel-scroll-strip label="Theme" flush rows="2">
                ${THEME_OPTIONS.map(
                  (mode) => html`
                    <blocky-button
                      class="theme-chip-btn"
                      flat
                      ?active=${this.themeMode.value === mode}
                      @click=${() => this.themeMode.set(mode)}
                    >
                      <span class="theme-option">
                        ${renderThemePreview(mode)}
                        <span class="theme-label">${THEMES[mode].label}</span>
                      </span>
                    </blocky-button>
                  `,
                )}
              </flipcel-scroll-strip>
            </flipcel-panel-section>

            <flipcel-panel-section title="Alias Fix" data-interactive>
              <div class="toggle">
                <span>Alias fix</span>
                <input
                  type="checkbox"
                  .checked=${this.aliasFixEnabled}
                  @change=${(e: Event) => {
                    this.aliasFixEnabled = (e.target as HTMLInputElement).checked;
                    this.emit("alias-fix-toggle", this.aliasFixEnabled);
                  }}
                />
              </div>
            </flipcel-panel-section>
      `,
    );
  }
}
