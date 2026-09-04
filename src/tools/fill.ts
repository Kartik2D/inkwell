import type { ToolDefinition, SettingsSchema } from "./types";

const fillSettings = {
  scope: {
    type: "toggle",
    options: ["active", "all"] as const,
    default: "all",
    label: "Layers",
  },
  gap: {
    type: "range",
    min: 0,
    max: 20,
    step: 1,
    default: 0,
    label: "Fill gap (px)",
  },
} as const satisfies SettingsSchema;

/** Click tool — vector pocket at gap 0, raster gas-pressure when gap > 0. */
export const fill: ToolDefinition<typeof fillSettings, "fill"> = {
  id: "fill",
  name: "Fill",
  hotkey: "f",
  icon: "09",
  settings: fillSettings,

  onStart() {},
  onMove() {},
  onEnd() {
    return null;
  },
};
