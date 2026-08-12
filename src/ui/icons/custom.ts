/**
 * Custom icon SVGs — drop files in `./custom/` as `01.svg`, `02.svg`, …
 * (or any name matching a tool `icon` / phosphor key). Present files override
 * Phosphor; missing names keep Phosphor.
 * Color keys in exports: `#2b2b2b` = primary, `#818181` = muted.
 */
const modules = import.meta.glob("./custom/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const CUSTOM_ICONS: Record<string, string> = {};
for (const [path, raw] of Object.entries(modules)) {
  const name = path.split("/").pop()!.replace(/\.svg$/i, "");
  if (name) CUSTOM_ICONS[name] = raw;
}

/**
 * Map FlipCel-exported grays onto theme colors, then size the root `<svg>`.
 * Dark → currentColor (button/text). Mid-gray → muted currentColor.
 */
export function sizedSvg(raw: string, size: number): string {
  const themed = raw
    .replace(/#2b2b2b/gi, "currentColor")
    .replace(/#818181/gi, "color-mix(in srgb, currentColor 50%, transparent)")
    .replace(/#000000/gi, "currentColor")
    .replace(/\bfill="#000"/gi, 'fill="currentColor"');

  return themed.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    const next = String(attrs)
      .replace(/\swidth="[^"]*"/gi, "")
      .replace(/\sheight="[^"]*"/gi, "");
    return `<svg${next} width="${size}" height="${size}" fill="currentColor">`;
  });
}
