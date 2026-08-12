/**
 * Artistic Text fonts — presets (system + Google CSS2) and a file picker.
 */
import { Store } from "../state/store";

export interface ArtisticTextFont {
  /** CSS font-family (system keyword or registered FontFace name). */
  family: string;
  /** Display name in settings (file name or preset). */
  label: string;
}

export const ARTISTIC_TEXT_FONTS = [
  { family: "sans-serif", label: "Sans Serif" },
  { family: "serif", label: "Serif" },
  { family: "monospace", label: "Monospace" },
  { family: "Inter", label: "Inter" },
  { family: "Roboto", label: "Roboto" },
  { family: "Open Sans", label: "Open Sans" },
  { family: "Lato", label: "Lato" },
  { family: "Montserrat", label: "Montserrat" },
  { family: "Poppins", label: "Poppins" },
  { family: "Oswald", label: "Oswald" },
  { family: "Playfair Display", label: "Playfair Display" },
  { family: "Merriweather", label: "Merriweather" },
  { family: "Pacifico", label: "Pacifico" },
  { family: "Bebas Neue", label: "Bebas Neue" },
] as const;

export const ARTISTIC_TEXT_FONT_FILE = "__file__";

export const artisticTextFontStore = new Store<ArtisticTextFont>({
  family: "sans-serif",
  label: "Sans Serif",
});

const SYSTEM = new Set(["sans-serif", "serif", "monospace"]);

/** Canvas / CSS `font` value; quotes named families, leaves generics bare. */
export function cssFont(sizePx: number, family: string): string {
  const spec = SYSTEM.has(family) ? family : JSON.stringify(family);
  return `${sizePx}px ${spec}`;
}

let fontSeq = 0;
let previousFace: FontFace | null = null;

/** Native file picker for a single font file. */
export function pickFontFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2";
    input.style.display = "none";
    document.body.appendChild(input);

    const cleanup = () => input.remove();

    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    });
    input.addEventListener("cancel", () => {
      cleanup();
      resolve(null);
    });

    input.click();
  });
}

/** Load a font file into `document.fonts` and select it for Artistic Text. */
export async function loadArtisticTextFontFile(file: File): Promise<ArtisticTextFont> {
  const buffer = await file.arrayBuffer();
  const family = `FlipCelUserFont-${++fontSeq}`;
  const face = new FontFace(family, buffer);
  await face.load();
  document.fonts.add(face);

  if (previousFace) {
    document.fonts.delete(previousFace);
  }
  previousFace = face;

  const label = file.name.replace(/\.[^.]+$/i, "") || file.name;
  const next = { family, label };
  artisticTextFontStore.set(next);
  return next;
}

export async function pickAndLoadArtisticTextFont(): Promise<ArtisticTextFont | null> {
  const file = await pickFontFile();
  if (!file) return null;
  return loadArtisticTextFontFile(file);
}

let googleLink: HTMLLinkElement | null = null;

/** Select a preset. Google families load via CSS2 (no API key). */
export async function selectArtisticTextFont(family: string): Promise<void> {
  const preset = ARTISTIC_TEXT_FONTS.find((f) => f.family === family);
  if (!preset) return;
  if (!SYSTEM.has(preset.family)) {
    if (!googleLink) {
      googleLink = document.createElement("link");
      googleLink.rel = "stylesheet";
      document.head.appendChild(googleLink);
    }
    const spec = encodeURIComponent(preset.family).replace(/%20/g, "+");
    await new Promise<void>((resolve, reject) => {
      googleLink!.onload = () => resolve();
      googleLink!.onerror = () => reject(new Error("Google Fonts CSS failed"));
      googleLink!.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
    });
    await document.fonts.load(`48px ${JSON.stringify(preset.family)}`);
  }
  artisticTextFontStore.set({ family: preset.family, label: preset.label });
}
