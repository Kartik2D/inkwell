import type { ToolDefinition, SettingsSchema } from "./types";
import { paintModeSetting } from "./paint-mode";

const artisticTextSettings = {
  mode: paintModeSetting,
} as const satisfies SettingsSchema;

export const artisticText: ToolDefinition<
  typeof artisticTextSettings,
  "artistic-text"
> = {
  id: "artistic-text",
  name: "Artistic Text",
  hotkey: "y",
  icon: "A",
  settings: artisticTextSettings,
  dockModeSetting: "mode",

  onStart() {},
  onMove() {},
  onEnd() {
    return null;
  },
};
