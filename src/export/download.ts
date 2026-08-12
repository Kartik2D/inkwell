/** Shared download helpers for multi-file exports. */

export type ExportFile = {
  filename: string;
  bytes: Uint8Array;
  mime: string;
};

export type ExportBundle = "zip" | "files";

/** Flatten zip paths for browser download attributes (no folders). */
export function flattenExportFilename(path: string): string {
  return path.replace(/^\/+/, "").replace(/\//g, "_");
}

/** Trigger one or more downloads (short delay between multiple). */
export async function downloadExportFiles(files: ExportFile[]): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const copy = new Uint8Array(file.bytes.byteLength);
    copy.set(file.bytes);
    const blob = new Blob([copy], { type: file.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (i < files.length - 1) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }
}
