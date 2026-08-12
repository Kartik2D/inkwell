import type { ToolDefinition, SettingsSchema } from "./types";

const selectSettings = {
  shape: {
    type: "toggle",
    options: ["rect", "lasso"] as const,
    default: "rect",
  },
  scope: {
    type: "toggle",
    options: ["active", "all"] as const,
    default: "all",
    label: "Layers",
  },
  hideGizmoWhileMoving: {
    type: "toggle",
    options: ["off", "on"] as const,
    default: "off",
    label: "Hide gizmo while moving",
  },
} as const satisfies SettingsSchema;

export const select: ToolDefinition<typeof selectSettings, "select"> = {
  id: "select",
  name: "Select",
  hotkey: "v",
  icon: "01",
  settings: selectSettings,
  dockModeSetting: "shape",

  onStart() {},
  onMove() {},
  onEnd() {
    return null;
  },
};
