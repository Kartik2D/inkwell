/**
 * Shared help copy for button popups and the Tutorials panel.
 */

import { formatBinding, shortcutsStore, type ToolActionId } from "../../input/shortcuts";

export type HelpSection =
  | "Tools"
  | "Dock"
  | "Playback"
  | "Timeline"
  | "Settings"
  | "View";

export type HelpId =
  | "tool.brush"
  | "tool.lasso"
  | "tool.shape"
  | "tool.fill"
  | "tool.select"
  | "tool.direct-select"
  | "tool.create-points"
  | "tool.artistic-text"
  | "tool.magnet"
  | "tool.magic-move"
  | "tool.magic-morph"
  | "tool.pan"
  | "tool.eyedropper"
  | "dock.file"
  | "dock.settings"
  | "dock.layers"
  | "dock.wheel"
  | "dock.view"
  | "dock.assist"
  | "dock.tools"
  | "dock.color"
  | "dock.undo"
  | "dock.redo"
  | "dock.filename"
  | "dock.frame"
  | "dock.zoom"
  | "playback.lock-time"
  | "timeline.keyframe"
  | "timeline.blank"
  | "timeline.clear"
  | "timeline.tag"
  | "timeline.auto-hold"
  | "timeline.emf"
  | "layers.add"
  | "layers.delete"
  | "layers.lock"
  | "layers.visibility"
  | "layers.merge-down"
  | "settings.history"
  | "settings.shortcuts"
  | "settings.tutorials"
  | "settings.reset-ui"
  | "view.onion-active"
  | "view.onion-all";

export type HelpEntry = {
  id: HelpId;
  title: string;
  body: string;
  section: HelpSection;
};

const SECTION_ORDER: readonly HelpSection[] = [
  "Tools",
  "Dock",
  "Playback",
  "Timeline",
  "Settings",
  "View",
];

export const HELP_CATALOG: Record<HelpId, HelpEntry> = {
  "tool.brush": {
    id: "tool.brush",
    title: "Brush",
    body: "Paint strokes on the active layer.",
    section: "Tools",
  },
  "tool.lasso": {
    id: "tool.lasso",
    title: "Lasso Fill",
    body: "Draw a freeform shape. Style: fill or stroke (stroke is traced from the pixel canvas).",
    section: "Tools",
  },
  "tool.shape": {
    id: "tool.shape",
    title: "Shape",
    body: "Drag to place a primitive (circle, rect, poly, star, cross, arrow, heart). Hold Shift to lock aspect. Style: fill commits a clean vector path; stroke traces from the pixel canvas.",
    section: "Tools",
  },
  "tool.fill": {
    id: "tool.fill",
    title: "Fill",
    body: "Click a shape or enclosed pocket to recolor or fill it. Layers: Active uses the current layer; All uses unlocked visible layers as walls (new fills still go on the active layer).",
    section: "Tools",
  },
  "tool.select": {
    id: "tool.select",
    title: "Select",
    body: "Drag a rectangle or freeform lasso to extract a selection. Hold Shift to add to selection, or to lock a rect marquee to a square.",
    section: "Tools",
  },
  "tool.direct-select": {
    id: "tool.direct-select",
    title: "Direct Select",
    body: "Drag a rectangle or lasso to select vertices on the active layer. Hold Shift to add anchors, or to lock a rect marquee to a square.",
    section: "Tools",
  },
  "tool.create-points": {
    id: "tool.create-points",
    title: "Create Points",
    body: "Click to place points. Click near the first point (with 3+) to close. Style: fill (vector) or stroke (traced). Dock + Ctrl switch curve type. Hold Shift to lock the rubber-band to H/V.",
    section: "Tools",
  },
  "tool.artistic-text": {
    id: "tool.artistic-text",
    title: "Artistic Text",
    body: "Drag to place and set size, then type. Enter places the text as vector paths; Shift+Enter adds a line. Escape cancels. Hold the tool to pick a font.",
    section: "Tools",
  },
  "tool.magnet": {
    id: "tool.magnet",
    title: "Magnet",
    body: "Snap and nudge artwork.",
    section: "Tools",
  },
  "tool.magic-move": {
    id: "tool.magic-move",
    title: "Magic Move",
    body: "Lasso a selection, then draw a trajectory with crossing timing ticks. When the chart is valid, an Apply popup appears.",
    section: "Tools",
  },
  "tool.magic-morph": {
    id: "tool.magic-morph",
    title: "Magic Morph",
    body: "With the playhead on a hold, draw a trajectory with timing ticks. Apply morphs to the next keyframe using chart ratios.",
    section: "Tools",
  },
  "tool.pan": {
    id: "tool.pan",
    title: "Pan",
    body: "Drag to pan the view; scroll to zoom.",
    section: "Tools",
  },
  "tool.eyedropper": {
    id: "tool.eyedropper",
    title: "Eyedropper",
    body: "Click artwork to pick its color.",
    section: "Tools",
  },
  "dock.file": {
    id: "dock.file",
    title: "Document",
    body: "Document name, stage size and color, and new / save / open / import / export.",
    section: "Dock",
  },
  "dock.settings": {
    id: "dock.settings",
    title: "Settings",
    body: "History, shortcuts, tutorials, theme, wheel feel, alias fix, and reset UI.",
    section: "Dock",
  },
  "dock.layers": {
    id: "dock.layers",
    title: "Layers",
    body: "Layers list and timeline.",
    section: "Dock",
  },
  "dock.wheel": {
    id: "dock.wheel",
    title: "Wheel",
    body: "Jog wheel for scrubbing and playback.",
    section: "Dock",
  },
  "dock.view": {
    id: "dock.view",
    title: "View",
    body: "Onion skin, grid, and brush-size indicator.",
    section: "Dock",
  },
  "dock.assist": {
    id: "dock.assist",
    title: "Assist",
    body: "Snapping, symmetry, and Quick Shape.",
    section: "Dock",
  },
  "dock.tools": {
    id: "dock.tools",
    title: "Tools",
    body: "Show or hide the tools rail. The label shows the active tool.",
    section: "Dock",
  },
  "dock.color": {
    id: "dock.color",
    title: "Color",
    body: "Color panel. The swatch shows the current paint color.",
    section: "Dock",
  },
  "dock.undo": {
    id: "dock.undo",
    title: "Undo",
    body: "Undo the last document change.",
    section: "Dock",
  },
  "dock.redo": {
    id: "dock.redo",
    title: "Redo",
    body: "Redo the last undone change.",
    section: "Dock",
  },
  "dock.filename": {
    id: "dock.filename",
    title: "Document name",
    body: "Name of the current document. Saved in the file and used when downloading.",
    section: "Dock",
  },
  "dock.frame": {
    id: "dock.frame",
    title: "Frame",
    body: "Shows the current frame. Click to play or pause the timeline.",
    section: "Dock",
  },
  "dock.zoom": {
    id: "dock.zoom",
    title: "Zoom",
    body: "Shows the current zoom. Click to fit the stage in view.",
    section: "Dock",
  },
  "playback.lock-time": {
    id: "playback.lock-time",
    title: "Lock Time (LT)",
    body: "When on, changing fps rescales keyframes so the shot keeps the same wall-clock length (e.g. 30→60 fps turns each frame into a two-frame hold).",
    section: "Playback",
  },
  "timeline.keyframe": {
    id: "timeline.keyframe",
    title: "Convert to keyframe",
    body: "Convert the current frame to a keyframe that copies the current artwork.",
    section: "Timeline",
  },
  "timeline.blank": {
    id: "timeline.blank",
    title: "Convert to blank",
    body: "Convert the current frame to a blank keyframe.",
    section: "Timeline",
  },
  "timeline.clear": {
    id: "timeline.clear",
    title: "Clear frames",
    body: "Delete selected frames, or the frame at the playhead if nothing is selected.",
    section: "Timeline",
  },
  "timeline.tag": {
    id: "timeline.tag",
    title: "Tag frames",
    body: "Create a named tag over the selected frames, or 3 frames from the playhead when nothing is selected (shorter if another tag is in the way). Tags overlay the scrubber; click for rename/delete, drag edges to resize.",
    section: "Timeline",
  },
  "timeline.auto-hold": {
    id: "timeline.auto-hold",
    title: "Auto hold",
    body: "When on, new keyframes extend the previous keyframe’s hold.",
    section: "Timeline",
  },
  "timeline.emf": {
    id: "timeline.emf",
    title: "Edit Multiple Frames",
    body: "When on, selecting a frame range edits those frames together on stage.",
    section: "Timeline",
  },
  "layers.add": {
    id: "layers.add",
    title: "Add layer",
    body: "Add a new layer above the selected layer.",
    section: "Timeline",
  },
  "layers.delete": {
    id: "layers.delete",
    title: "Delete layer",
    body: "Delete the current layer (stage and the last drawing layer cannot be removed).",
    section: "Timeline",
  },
  "layers.lock": {
    id: "layers.lock",
    title: "Lock",
    body: "Lock the layer so it can’t be edited or selected. Unlock to draw and transform on it again.",
    section: "Timeline",
  },
  "layers.visibility": {
    id: "layers.visibility",
    title: "Show / Hide",
    body: "Toggle whether this layer is visible on the stage. Hidden layers are skipped for drawing and selection.",
    section: "Timeline",
  },
  "layers.merge-down": {
    id: "layers.merge-down",
    title: "Merge Down",
    body: "Flatten this layer into the layer below it on every frame, then remove this layer.",
    section: "Timeline",
  },
  "settings.history": {
    id: "settings.history",
    title: "History",
    body: "Open the undo history window to jump to any snapshot.",
    section: "Settings",
  },
  "settings.shortcuts": {
    id: "settings.shortcuts",
    title: "Shortcuts",
    body: "Open the shortcuts window to view or remap keys, and see touch gestures (2-finger tap undo, 3-finger tap redo).",
    section: "Settings",
  },
  "settings.tutorials": {
    id: "settings.tutorials",
    title: "Tutorials",
    body: "Short walkthroughs for Morph, Move, holds, and Lock Time. Hover a control (or long-press) for quick tips.",
    section: "Settings",
  },
  "settings.reset-ui": {
    id: "settings.reset-ui",
    title: "Reset UI",
    body: "Restore panel positions, sizes, and dock layout to defaults.",
    section: "Settings",
  },
  "view.onion-active": {
    id: "view.onion-active",
    title: "Onion: Active",
    body: "Onion skin shows Nearest Frame on the active layer only.",
    section: "View",
  },
  "view.onion-all": {
    id: "view.onion-all",
    title: "Onion: All",
    body: "Onion skin shows Nearest Frame across all layers.",
    section: "View",
  },
};

export function getHelp(id: string | null | undefined): HelpEntry | undefined {
  if (!id) return undefined;
  const entry = HELP_CATALOG[id as HelpId];
  if (!entry) return undefined;
  // Tools: title includes the current chord, e.g. "Brush (B)".
  if (entry.section === "Tools") {
    const binding = shortcutsStore.get()[id as ToolActionId];
    if (binding) {
      return { ...entry, title: `${entry.title} (${formatBinding(binding)})` };
    }
  }
  return entry;
}

export function isHelpId(id: string): id is HelpId {
  return Object.prototype.hasOwnProperty.call(HELP_CATALOG, id);
}

/** Topics grouped for the Tutorials panel. */
export function listHelpSections(): { section: HelpSection; entries: HelpEntry[] }[] {
  const buckets = new Map<HelpSection, HelpEntry[]>();
  for (const section of SECTION_ORDER) buckets.set(section, []);
  for (const entry of Object.values(HELP_CATALOG)) {
    buckets.get(entry.section)?.push(entry);
  }
  return SECTION_ORDER.map((section) => ({
    section,
    entries: buckets.get(section) ?? [],
  })).filter((g) => g.entries.length > 0);
}

/** Map tool ids to help catalog ids. */
export function helpIdForTool(toolId: string): HelpId | undefined {
  const id = `tool.${toolId}` as HelpId;
  return HELP_CATALOG[id] ? id : undefined;
}
