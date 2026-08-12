/**
 * In-app clipboard for select-tool copy/paste.
 * Stores Paper path JSON so paste works across layers and frames.
 */
import { Store } from "../state";

let clipboard: string[] = [];

/** True when the in-app selection clipboard has content. */
export const selectionClipboardStore = new Store(false);

export function hasSelectionClipboard(): boolean {
  return clipboard.length > 0;
}

export function getSelectionClipboard(): readonly string[] {
  return clipboard;
}

export function setSelectionClipboardFromItems(items: paper.PathItem[]): boolean {
  const jsons = items
    .filter((item) => item.parent)
    .map((item) => item.exportJSON({ asString: true }) as string)
    .filter((json) => !!json);
  if (jsons.length === 0) return false;
  clipboard = jsons;
  selectionClipboardStore.set(true);
  return true;
}

export function clearSelectionClipboard(): void {
  clipboard = [];
  selectionClipboardStore.set(false);
}
