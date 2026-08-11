import type { ToolDefinition, SettingsSchema } from "./types";
import { paintModeSetting } from "./paint-mode";

const createPointsSettings = {
  mode: paintModeSetting,
  curve: {
    type: "toggle",
    options: ["smooth", "straight"] as const,
    default: "smooth",
    label: "Curve",
  },
} as const satisfies SettingsSchema;

export const createPoints: ToolDefinition<typeof createPointsSettings, "create-points"> = {
  id: "create-points",
  name: "Create Points",
  hotkey: "p",
  icon: "points",
  settings: createPointsSettings,
  // Dock / Shift stay on curve type — paint mode is settings-only.
  dockModeSetting: "curve",

  onStart() {},
  onMove() {},
  onEnd() {
    return null;
  },
};
