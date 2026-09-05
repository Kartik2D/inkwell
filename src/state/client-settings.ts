/**
 * Client settings — this machine's prefs, not the document.
 *
 * One `localStorage` blob. Hydrates stores on import; writes are debounced.
 */
import {
  type AllToolSettings,
  type ToolId,
  buildDefaultSettings,
  tools,
} from "../tools/registry";
import { debounce } from "../util/debounce";
import { colorStore, toolSettingsStore, toolStore } from "./drawing";
import {
  THEME_STORAGE_KEY,
  WHEEL_DIRECTION_OPTIONS,
  WHEEL_FRICTION_OPTIONS,
  aliasFixStore,
  autoHoldStore,
  brushSizeIndicatorStore,
  SNAP_TOLERANCE_DEFAULT,
  QUICK_SHAPE_HOLD_MS_DEFAULT,
  clampPixelResScale,
  clampQuickShapeCurveStyle,
  clampQuickShapeHoldMs,
  colorPanelPrefsStore,
  isThemeMode,
  normalizeColorPanelPrefs,
  normalizeSnapSettings,
  normalizeViewOverlaySettings,
  onionSkinStore,
  pixelResScaleStore,
  quickShapeCurveStyleStore,
  quickShapeEnabledStore,
  quickShapeHoldMsStore,
  quickShapeShapesEnabledStore,
  realTimeLockStore,
  snapStore,
  themeModeStore,
  type ColorPanelPrefs,
  type ThemeMode,
  type ViewOverlaySettings,
  type WheelDirection,
  type WheelFriction,
  type SnapSettings,
  viewOverlayStore,
  wheelDirectionStore,
  wheelFrictionStore,
} from "./preferences";

export const CLIENT_SETTINGS_KEY = "flipcel.client";

export interface ClientSettings {
  version: 1;
  theme: ThemeMode;
  wheelFriction: WheelFriction;
  wheelDirection: WheelDirection;
  viewOverlay: ViewOverlaySettings;
  snap: SnapSettings;
  quickShapeEnabled: boolean;
  quickShapeShapesEnabled: boolean;
  quickShapeCurveStyle: number;
  quickShapeHoldMs: number;
  colorPanel: ColorPanelPrefs;
  toolSettings: AllToolSettings;
  tool: ToolId;
  color: string;
  onionSkin: boolean;
  autoHold: boolean;
  realTimeLock: boolean;
  aliasFix: boolean;
  brushSizeIndicator: boolean;
  pixelResScale: number;
}

const TOOL_IDS = new Set<string>(tools.map((t) => t.id));

function isToolId(value: unknown): value is ToolId {
  return typeof value === "string" && TOOL_IDS.has(value);
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function isWheelFriction(value: unknown): value is WheelFriction {
  return (
    typeof value === "string" &&
    (WHEEL_FRICTION_OPTIONS as readonly string[]).includes(value)
  );
}

function isWheelDirection(value: unknown): value is WheelDirection {
  return (
    typeof value === "string" &&
    (WHEEL_DIRECTION_OPTIONS as readonly string[]).includes(value)
  );
}

function mergeToolSettings(raw: unknown): AllToolSettings {
  const defaults = buildDefaultSettings() as AllToolSettings;
  if (!raw || typeof raw !== "object") return defaults;
  const incoming = raw as Record<string, Record<string, unknown>>;
  const merged: Record<string, Record<string, unknown>> = { ...defaults };
  for (const tool of tools) {
    const stored = incoming[tool.id];
    if (!stored || typeof stored !== "object") continue;
    const next = { ...(defaults[tool.id] as Record<string, unknown>) };
    for (const key of Object.keys(tool.settings)) {
      if (key in stored) next[key] = stored[key];
    }
    merged[tool.id] = next;
  }
  return merged as AllToolSettings;
}

export function defaultClientSettings(): ClientSettings {
  return {
    version: 1,
    theme: "slab",
    wheelFriction: "medium",
    wheelDirection: "clockwise",
    viewOverlay: normalizeViewOverlaySettings({
      gridEnabled: false,
      onionSkinOutline: false,
      onionSkinLayers: "active",
      gridSpacing: 100,
      gridMajorEvery: 5,
      gridMinorOpacity: 0.06,
      gridMajorOpacity: 0.14,
    }),
    snap: normalizeSnapSettings({
      enabled: true,
      tolerancePx: SNAP_TOLERANCE_DEFAULT,
      grid: false,
      stage: true,
      stageMidpoints: true,
      bounds: true,
      boundsMidpoints: true,
      geometry: true,
      selfGeometry: true,
    }),
    quickShapeEnabled: true,
    quickShapeShapesEnabled: true,
    quickShapeCurveStyle: 0.55,
    quickShapeHoldMs: QUICK_SHAPE_HOLD_MS_DEFAULT,
    colorPanel: normalizeColorPanelPrefs({
      space: "hsv",
      geometry: "square",
      planeX: "s",
      planeY: "v",
    }),
    toolSettings: buildDefaultSettings() as AllToolSettings,
    tool: "brush",
    color: "#037ffc",
    onionSkin: true,
    autoHold: true,
    realTimeLock: false,
    aliasFix: false,
    brushSizeIndicator: true,
    pixelResScale: 1,
  };
}

export function resetClientSettings(): void {
  applyClientSettings(defaultClientSettings());
  persistClientSettings(collectClientSettings());
}

function collectClientSettings(): ClientSettings {
  return {
    version: 1,
    theme: themeModeStore.get(),
    wheelFriction: wheelFrictionStore.get(),
    wheelDirection: wheelDirectionStore.get(),
    viewOverlay: viewOverlayStore.get(),
    snap: snapStore.get(),
    quickShapeEnabled: quickShapeEnabledStore.get(),
    quickShapeShapesEnabled: quickShapeShapesEnabledStore.get(),
    quickShapeCurveStyle: quickShapeCurveStyleStore.get(),
    quickShapeHoldMs: quickShapeHoldMsStore.get(),
    colorPanel: colorPanelPrefsStore.get(),
    toolSettings: toolSettingsStore.get(),
    tool: toolStore.get(),
    color: colorStore.get(),
    onionSkin: onionSkinStore.get(),
    autoHold: autoHoldStore.get(),
    realTimeLock: realTimeLockStore.get(),
    aliasFix: aliasFixStore.get(),
    brushSizeIndicator: brushSizeIndicatorStore.get(),
    pixelResScale: pixelResScaleStore.get(),
  };
}

function applyClientSettings(raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  const s = raw as Partial<ClientSettings>;

  if (isThemeMode(s.theme)) themeModeStore.set(s.theme);
  if (isWheelFriction(s.wheelFriction)) wheelFrictionStore.set(s.wheelFriction);
  if (isWheelDirection(s.wheelDirection)) {
    wheelDirectionStore.set(s.wheelDirection);
  }
  if (s.viewOverlay && typeof s.viewOverlay === "object") {
    viewOverlayStore.set(normalizeViewOverlaySettings(s.viewOverlay));
  }
  if (s.snap && typeof s.snap === "object") {
    snapStore.set(normalizeSnapSettings(s.snap));
  }
  if (typeof s.quickShapeEnabled === "boolean") {
    quickShapeEnabledStore.set(s.quickShapeEnabled);
  }
  if (typeof s.quickShapeShapesEnabled === "boolean") {
    quickShapeShapesEnabledStore.set(s.quickShapeShapesEnabled);
  }
  if (typeof s.quickShapeCurveStyle === "number") {
    quickShapeCurveStyleStore.set(clampQuickShapeCurveStyle(s.quickShapeCurveStyle));
  }
  if (typeof s.quickShapeHoldMs === "number") {
    quickShapeHoldMsStore.set(clampQuickShapeHoldMs(s.quickShapeHoldMs));
  }
  if (s.colorPanel && typeof s.colorPanel === "object") {
    colorPanelPrefsStore.set(normalizeColorPanelPrefs(s.colorPanel));
  }
  if (s.toolSettings) toolSettingsStore.set(mergeToolSettings(s.toolSettings));
  const legacyScale = (s as { scaleBrushWithStage?: unknown }).scaleBrushWithStage;
  if (legacyScale === true) {
    const current = toolSettingsStore.get();
    toolSettingsStore.set({
      ...current,
      brush: { ...current.brush, scaleWithStage: true },
      lasso: { ...current.lasso, scaleWithStage: true },
      shape: { ...current.shape, scaleWithStage: true },
      "create-points": { ...current["create-points"], scaleWithStage: true },
    });
  }
  if (isToolId(s.tool)) toolStore.set(s.tool);
  if (isHexColor(s.color)) colorStore.set(s.color);
  if (typeof s.onionSkin === "boolean") onionSkinStore.set(s.onionSkin);
  if (typeof s.autoHold === "boolean") autoHoldStore.set(s.autoHold);
  if (typeof s.realTimeLock === "boolean") realTimeLockStore.set(s.realTimeLock);
  if (typeof s.aliasFix === "boolean") aliasFixStore.set(s.aliasFix);
  if (typeof s.brushSizeIndicator === "boolean") {
    brushSizeIndicatorStore.set(s.brushSizeIndicator);
  }
  if (typeof s.pixelResScale === "number") {
    pixelResScaleStore.set(clampPixelResScale(s.pixelResScale));
  }
}

function readStoredClientSettings(): unknown {
  try {
    const stored = localStorage.getItem(CLIENT_SETTINGS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore quota / privacy mode / bad JSON
  }
  return null;
}

function persistClientSettings(settings: ClientSettings): void {
  try {
    localStorage.setItem(CLIENT_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota / privacy mode
  }
}

const stored = readStoredClientSettings();
if (stored) {
  applyClientSettings(stored);
} else {
  // Seed theme from the previous dedicated key so the first blob write keeps it.
  try {
    const legacy =
      localStorage.getItem(THEME_STORAGE_KEY) ?? localStorage.getItem("inkwell.theme");
    if (isThemeMode(legacy)) themeModeStore.set(legacy);
  } catch {
    // ignore
  }
}

const persist = debounce(() => persistClientSettings(collectClientSettings()), 200);

for (const store of [
  themeModeStore,
  wheelFrictionStore,
  wheelDirectionStore,
  viewOverlayStore,
  snapStore,
  quickShapeEnabledStore,
  quickShapeShapesEnabledStore,
  quickShapeCurveStyleStore,
  quickShapeHoldMsStore,
  colorPanelPrefsStore,
  toolSettingsStore,
  toolStore,
  colorStore,
  onionSkinStore,
  autoHoldStore,
  realTimeLockStore,
  aliasFixStore,
  brushSizeIndicatorStore,
  pixelResScaleStore,
]) {
  store.subscribe(persist);
}
