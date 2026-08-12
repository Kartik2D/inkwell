/**
 * Bundled demo documents for the welcome panel.
 * "New" still creates a blank document — see TimelineSession.onDocNew.
 */
import bounceRaw from "./startup.json";
import iconsRaw from "./icons.json";
import { parseSerializedDocument } from "./persistence";
import type { SerializedDocument } from "./document";

export const EXAMPLE_DOCUMENTS: readonly {
  id: string;
  label: string;
  document: SerializedDocument;
}[] = [
  { id: "bounce", label: "Bounce.json", document: parseSerializedDocument(bounceRaw) },
  { id: "icons", label: "Icons.json", document: parseSerializedDocument(iconsRaw) },
];
