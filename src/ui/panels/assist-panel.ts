import { html, css, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import {
  snapStore,
  normalizeSnapSettings,
  SNAP_TOLERANCE_MIN,
  SNAP_TOLERANCE_MAX,
  symmetryStore,
  normalizeSymmetrySettings,
  quickShapeEnabledStore,
  quickShapeShapesEnabledStore,
  quickShapeCurveStyleStore,
  quickShapeHoldMsStore,
  clampQuickShapeCurveStyle,
  clampQuickShapeHoldMs,
  QUICK_SHAPE_HOLD_MS_MIN,
  QUICK_SHAPE_HOLD_MS_MAX,
  type SnapSettings,
  type SymmetryMode,
  type SymmetrySettings,
  StoreController,
} from "../../state";
import { FloatingPanel } from "../primitives/floating-panel";

@customElement("flipcel-assist-panel")
export class FlipCelAssistPanel extends FloatingPanel {
  private snap = new StoreController(this, snapStore);
  private symmetry = new StoreController(this, symmetryStore);
  private quickShapeEnabled = new StoreController(this, quickShapeEnabledStore);
  private quickShapeShapesEnabled = new StoreController(
    this,
    quickShapeShapesEnabledStore,
  );
  private quickShapeCurveStyle = new StoreController(
    this,
    quickShapeCurveStyleStore,
  );
  private quickShapeHoldMs = new StoreController(this, quickShapeHoldMsStore);

  static styles = css`
    ${FloatingPanel.styles}

    :host {
      --panel-width: 600px;
    }

    .symmetry-modes {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px;
    }

    .symmetry-modes blocky-button {
      min-width: 0;
      width: 100%;
    }

    .qs-slider-labels {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--flipcel-text-muted, #666);
      margin-top: 2px;
    }
  `;

  private updateSnap(patch: Partial<SnapSettings>) {
    this.snap.update((v) => normalizeSnapSettings({ ...v, ...patch }));
  }

  private updateSymmetry(patch: Partial<SymmetrySettings>) {
    this.symmetry.update((v) =>
      normalizeSymmetrySettings({ ...v, ...patch }),
    );
  }

  render() {
    const s = this.snap.value;
    const on = s.enabled;
    const sym = this.symmetry.value;
    const qsOn = this.quickShapeEnabled.value;
    const modes: { id: SymmetryMode; label: string }[] = [
      { id: "vertical", label: "Vertical" },
      { id: "horizontal", label: "Horizontal" },
      { id: "radial", label: "Radial" },
    ];
    return this.renderFloatingBlock(
      "Assist",
      html`
        <flipcel-panel-section title="Snapping" data-interactive>
          <div class="toggle">
            <span>Enable snapping</span>
            <input
              type="checkbox"
              .checked=${on}
              @change=${(e: Event) => {
                this.updateSnap({
                  enabled: (e.target as HTMLInputElement).checked,
                });
              }}
            />
          </div>
          <label>
            <span>Tolerance: ${s.tolerancePx}px</span>
            <input
              type="range"
              min=${SNAP_TOLERANCE_MIN}
              max=${SNAP_TOLERANCE_MAX}
              step="1"
              .value=${String(s.tolerancePx)}
              ?disabled=${!on}
              @input=${(e: Event) => {
                this.updateSnap({
                  tolerancePx: parseInt((e.target as HTMLInputElement).value, 10),
                });
              }}
            />
          </label>
          <flipcel-disclosure label="Advanced" data-interactive>
            <div class="toggle">
              <span>Snap to grid</span>
              <input
                type="checkbox"
                .checked=${s.grid}
                ?disabled=${!on}
                @change=${(e: Event) => {
                  this.updateSnap({ grid: (e.target as HTMLInputElement).checked });
                }}
              />
            </div>
            <div class="toggle">
              <span>Snap to stage</span>
              <input
                type="checkbox"
                .checked=${s.stage}
                ?disabled=${!on}
                @change=${(e: Event) => {
                  this.updateSnap({ stage: (e.target as HTMLInputElement).checked });
                }}
              />
            </div>
            <div class="toggle">
              <span>Stage midpoints</span>
              <input
                type="checkbox"
                .checked=${s.stageMidpoints}
                ?disabled=${!on || !s.stage}
                @change=${(e: Event) => {
                  this.updateSnap({
                    stageMidpoints: (e.target as HTMLInputElement).checked,
                  });
                }}
              />
            </div>
            <div class="toggle">
              <span>Object bounding boxes</span>
              <input
                type="checkbox"
                .checked=${s.bounds}
                ?disabled=${!on}
                @change=${(e: Event) => {
                  this.updateSnap({ bounds: (e.target as HTMLInputElement).checked });
                }}
              />
            </div>
            <div class="toggle">
              <span>Box midpoints</span>
              <input
                type="checkbox"
                .checked=${s.boundsMidpoints}
                ?disabled=${!on || !s.bounds}
                @change=${(e: Event) => {
                  this.updateSnap({
                    boundsMidpoints: (e.target as HTMLInputElement).checked,
                  });
                }}
              />
            </div>
            <div class="toggle">
              <span>Object geometry</span>
              <input
                type="checkbox"
                .checked=${s.geometry}
                ?disabled=${!on}
                @change=${(e: Event) => {
                  this.updateSnap({
                    geometry: (e.target as HTMLInputElement).checked,
                  });
                }}
              />
            </div>
            <div class="toggle">
              <span>Self geometry</span>
              <input
                type="checkbox"
                .checked=${s.selfGeometry}
                ?disabled=${!on || !s.geometry}
                @change=${(e: Event) => {
                  this.updateSnap({
                    selfGeometry: (e.target as HTMLInputElement).checked,
                  });
                }}
              />
            </div>
          </flipcel-disclosure>
        </flipcel-panel-section>
        <flipcel-panel-section title="Symmetry" data-interactive>
          <div class="toggle">
            <span>Enable symmetry</span>
            <input
              type="checkbox"
              .checked=${sym.enabled}
              @change=${(e: Event) => {
                this.updateSymmetry({
                  enabled: (e.target as HTMLInputElement).checked,
                });
              }}
            />
          </div>
          <div class="symmetry-modes">
            ${modes.map(
              (m) => html`
                <blocky-button
                  flat
                  stretch
                  ?active=${sym.mode === m.id}
                  ?disabled=${!sym.enabled}
                  @click=${() => this.updateSymmetry({ mode: m.id })}
                  >${m.label}</blocky-button
                >
              `,
            )}
          </div>
          ${sym.mode === "radial"
            ? html`
                <label>
                  <span>Count: ${sym.radialCount}</span>
                  <input
                    type="range"
                    min="2"
                    max="12"
                    step="1"
                    .value=${String(sym.radialCount)}
                    ?disabled=${!sym.enabled}
                    @input=${(e: Event) => {
                      this.updateSymmetry({
                        radialCount: parseInt(
                          (e.target as HTMLInputElement).value,
                          10,
                        ),
                      });
                    }}
                  />
                </label>
              `
            : nothing}
          <p style="margin: 4px 0 0; font-size: 12px; opacity: 0.7;">
            Drag the handle on the canvas to move the axis.
          </p>
        </flipcel-panel-section>
        <flipcel-panel-section title="Quick Shape" data-interactive>
          <div class="toggle">
            <span>Enable quick shape</span>
            <input
              type="checkbox"
              .checked=${qsOn}
              @change=${(e: Event) => {
                this.quickShapeEnabled.set(
                  (e.target as HTMLInputElement).checked,
                );
              }}
            />
          </div>
          <div class="toggle">
            <span>Enable shapes</span>
            <input
              type="checkbox"
              .checked=${this.quickShapeShapesEnabled.value}
              ?disabled=${!qsOn}
              @change=${(e: Event) => {
                this.quickShapeShapesEnabled.set(
                  (e.target as HTMLInputElement).checked,
                );
              }}
            />
          </div>
          <label>
            <span>Hold delay: ${(this.quickShapeHoldMs.value / 1000).toFixed(1)}s</span>
            <input
              type="range"
              min=${QUICK_SHAPE_HOLD_MS_MIN}
              max=${QUICK_SHAPE_HOLD_MS_MAX}
              step="50"
              .value=${String(this.quickShapeHoldMs.value)}
              ?disabled=${!qsOn}
              @input=${(e: Event) => {
                const ms = parseInt((e.target as HTMLInputElement).value, 10);
                this.quickShapeHoldMs.set(clampQuickShapeHoldMs(ms));
              }}
            />
          </label>
          <label>
            <span>Style</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              .value=${String(Math.round(this.quickShapeCurveStyle.value * 100))}
              ?disabled=${!qsOn}
              @input=${(e: Event) => {
                const pct = parseInt((e.target as HTMLInputElement).value, 10);
                this.quickShapeCurveStyle.set(
                  clampQuickShapeCurveStyle(pct / 100),
                );
              }}
            />
            <div class="qs-slider-labels">
              <span>Straight</span>
              <span>Curvy</span>
            </div>
          </label>
        </flipcel-panel-section>
      `,
    );
  }
}
