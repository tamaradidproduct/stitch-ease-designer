/**
 * The colorwork swatch grid: 8 hue columns x 4 lightness steps, 32 fixed
 * presets. No native `<input type="color">`, no "more colors" escape hatch,
 * no pure white, no "no color" cell - deliberately a closed set of discrete
 * buttons, so one click is always exactly one apply (see StitchPicker's
 * color popover).
 *
 * `ink` is a fixed, tagged property of each swatch, not something computed
 * from luminance at paint time - a single numeric contrast threshold was
 * tried and rejected because a couple of warm hues' dark step land too
 * close to the neutral column's base-row luminance for one cutoff to sort
 * both correctly (FR-28). Every render site (canvas, cursor preview,
 * picker/glossary tile glyphs) reads `ink` off the swatch, never computes it.
 */
export type ColorSwatch = {
  /** Stable id - also the stored `colorId`/`colorPalette` value. */
  id: string;
  hex: string;
  /** Which ink tone reads legibly over this fill. */
  ink: "dark" | "light";
  hue: string;
  step: number;
};

const DARK_INK = "#1e293b";
const LIGHT_INK = "#f8fafc";

/**
 * [hex, ink] per lightness step (lightest first), one row per hue column.
 * Hand-authored rather than derived from a single lightness cutoff - see the
 * `ink` doc comment above. A couple of warm hues (amber, yellow) stay
 * legible with dark ink one step further down than the cooler hues do.
 */
const HUE_COLUMNS: { hue: string; steps: [string, "dark" | "light"][] }[] = [
  { hue: "red", steps: [
    ["#fecdd3", "dark"], ["#fb7185", "dark"], ["#e11d48", "light"], ["#881337", "light"],
  ] },
  { hue: "amber", steps: [
    ["#fde9c8", "dark"], ["#fbbf24", "dark"], ["#d97706", "dark"], ["#92400e", "light"],
  ] },
  { hue: "yellow", steps: [
    ["#fef3c2", "dark"], ["#fde047", "dark"], ["#ca8a04", "dark"], ["#713f12", "light"],
  ] },
  { hue: "green", steps: [
    ["#d3f3d0", "dark"], ["#4ade80", "dark"], ["#16a34a", "light"], ["#14532d", "light"],
  ] },
  { hue: "teal", steps: [
    ["#c8f3ec", "dark"], ["#2dd4bf", "dark"], ["#0d9488", "light"], ["#134e4a", "light"],
  ] },
  { hue: "blue", steps: [
    ["#cfe3fd", "dark"], ["#60a5fa", "dark"], ["#2563eb", "light"], ["#1e3a8a", "light"],
  ] },
  { hue: "purple", steps: [
    ["#e4d4fb", "dark"], ["#a78bfa", "dark"], ["#7c3aed", "light"], ["#4c1d95", "light"],
  ] },
  { hue: "pink", steps: [
    ["#fbd5ee", "dark"], ["#f472b6", "dark"], ["#db2777", "light"], ["#831843", "light"],
  ] },
];

export const COLOR_GRID: readonly ColorSwatch[] = HUE_COLUMNS.flatMap(({ hue, steps }) =>
  steps.map(([hex, ink], step): ColorSwatch => ({ id: hex, hex, ink, hue, step })),
);

const BY_ID = new Map<string, ColorSwatch>(COLOR_GRID.map((s) => [s.id, s]));

export function getSwatch(colorId: string): ColorSwatch | undefined {
  return BY_ID.get(colorId);
}

/** Which ink tone reads legibly over `colorId` - `theme.symbol` for an uncolored placement. */
export function glyphInkFor(colorId: string | undefined, fallback: string): string {
  if (!colorId) return fallback;
  const swatch = getSwatch(colorId);
  return swatch ? (swatch.ink === "dark" ? DARK_INK : LIGHT_INK) : fallback;
}
