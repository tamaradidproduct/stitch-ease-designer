/**
 * Consolidation backlog: places where the UI still sidesteps the design
 * system. Counted from the source at build time, so the list shrinks on its
 * own as items are fixed and the page is rebuilt.
 */
import { geometry } from "./geometry";

const components = import.meta.glob<string>("../ui/*.tsx", { query: "?raw", import: "default", eager: true });
const sheets = import.meta.glob<string>("../styles/*.css", { query: "?raw", import: "default", eager: true });

const shortName = (path: string) => path.split("/").pop()!;
const source = Object.entries(components).filter(([p]) => !p.endsWith(".test.tsx") && !p.endsWith("/icons.tsx"));
const tests = new Set(
  Object.keys(import.meta.glob("../ui/*.test.{ts,tsx}")).map((p) => shortName(p).replace(/\.test\.tsx?$/, "")),
);

function count(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

/** Per-file counts, highest first, skipping zeros. */
function perFile(re: RegExp): { file: string; n: number }[] {
  return source
    .map(([p, text]) => ({ file: shortName(p), n: count(text, re) }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
}

export type BacklogItem = {
  id: string;
  area: "Components" | "Tokens" | "Structure" | "Platform";
  title: string;
  /** Live count of what's left, or null for items that aren't countable. */
  count: number | null;
  unit: string;
  detail: string;
  where: string[];
  /** Sent to Claude Code as part of the Apply request when the item is added. */
  request: string;
  effort: "S" | "M" | "L";
};

const bespokeButtons = perFile(/<button\b/g);
const inputs = perFile(/<input\b/g);
const inlineStyles = perFile(/style=\{\{/g);
// MotifGlyph/MotifCellGlyph draw the motif mark inline on purpose.
const inlineSvgs = perFile(/<svg\b/g).filter((r) => r.file !== "motifUi.tsx");
const large = source
  .map(([p, text]) => ({ file: shortName(p), n: text.split("\n").length }))
  .filter((r) => r.n > 500)
  .sort((a, b) => b.n - a.n);
const untested = source
  .map(([p]) => shortName(p).replace(/\.tsx$/, ""))
  .filter((name) => !tests.has(name) && !/^use[A-Z]/.test(name));

const sizeValues = new Map<string, number>();
for (const g of geometry) {
  const m = g.declaration.match(/^(width|height|min-width|min-height):\s*(\d+px)$/);
  if (m) sizeValues.set(m[2]!, (sizeValues.get(m[2]!) ?? 0) + 1);
}
const repeatedSizes = [...sizeValues.entries()].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]);

const localZ = Object.entries(sheets).flatMap(([p, text]) =>
  (text.match(/z-index:\s*\d+/g) ?? []).map(() => shortName(p)),
);

const nonPopoverOverlays = ["refpanel__helpPopover", "refpanel__quickOpacityPopover", "picker__selectionBubbles", "suggestReview__menu"]
  .filter((cls) => Object.values(sheets).some((t) => t.includes(`.${cls}`)));

const segmented = Object.values(sheets).reduce((n, t) => n + count(t, /\.[a-zA-Z]+__toggle\b[^{]*\{/g), 0);

const fmt = (rows: { file: string; n: number }[]) => rows.map((r) => `${r.file} (${r.n})`);

export const backlog: BacklogItem[] = [
  {
    id: "bespoke-buttons",
    area: "Components",
    title: "Move bespoke buttons onto Button / IconButton",
    count: bespokeButtons.reduce((n, r) => n + r.n, 0),
    unit: "raw <button>",
    detail: "Tool dock, picker quick slots, glossary row actions and panel headers still render their own <button> with block-specific styles. Moving them to Button/IconButton gives consistent sizes, focus rings, labels and type=\"button\".",
    where: fmt(bespokeButtons),
    request: "Migrate the raw <button> elements in the files with the most of them (start with RightPanel.tsx and ReferenceImagePanel.tsx) onto Button/IconButton from src/ui/Button.tsx. Keep each block's class for layout, remove style declarations that duplicate .btn, and confirm no visual change beyond token snapping.",
    effort: "L",
  },
  {
    id: "form-controls",
    area: "Components",
    title: "Add shared form controls (TextField, Slider, Checkbox)",
    count: inputs.reduce((n, r) => n + r.n, 0),
    unit: "raw <input>",
    detail: "Text inputs, range sliders, checkboxes and file inputs are styled per block. No shared component sets their height, border, focus ring or label pattern.",
    where: fmt(inputs),
    request: "Create TextField, Slider and Checkbox components in src/ui (styled only with tokens; focus ring via --accent-ring), add them to the style guide, and migrate the existing <input> elements to them.",
    effort: "M",
  },
  {
    id: "segmented",
    area: "Components",
    title: "Extract a SegmentedControl",
    count: segmented,
    unit: "toggle groups",
    detail: "Pattern settings (flat/round, RS/WS, corner) and the trace-color presets each build their own radio-style toggle row.",
    where: ["patternSettings.css", "PatternSettingsMenu.tsx"],
    request: "Extract a SegmentedControl component (role=radiogroup, arrow-key navigation) from the pattern settings toggles, use it there, and add it to the style guide.",
    effort: "S",
  },
  {
    id: "overlays",
    area: "Components",
    title: "Bring the remaining overlays onto Popover",
    count: nonPopoverOverlays.length,
    unit: "overlays",
    detail: "These floating or inline panels still set their own surface (background, border, radius, shadow) instead of the shared Popover surface.",
    where: nonPopoverOverlays,
    request: `Move ${nonPopoverOverlays.join(", ")} onto the shared Popover surface where they float, or document why they're inline panels, and make sure each one closes through useDismissOnOutsideOrEscape.`,
    effort: "S",
  },
  {
    id: "repeated-sizes",
    area: "Tokens",
    title: "Turn repeated component sizes into tokens",
    count: repeatedSizes.length,
    unit: "sizes used 4+ times",
    detail: "These px sizes repeat across components (tool buttons, tile boxes, icon buttons). They behave like a control-size scale but aren't linked to one, so changing \"the tool button size\" means editing many files.",
    where: repeatedSizes.map(([v, n]) => `${v} × ${n}`),
    request: "Review the repeated width/height values in src/styles (most frequent first), map the ones that are control or tile sizes onto --control-* / new size tokens in src/design/tokens.json, and snap near-duplicates. Leave one-off geometry alone.",
    effort: "M",
  },
  {
    id: "geometry",
    area: "Tokens",
    title: "Review one-off component geometry",
    count: geometry.length,
    unit: "raw px values",
    detail: "Fixed widths, heights and offsets that belong to a single component. Fine as geometry, but worth a pass for anything that should follow the scale.",
    where: ["See Component geometry below"],
    request: "Go through the raw px declarations in src/styles (the style guide's Component geometry list) and convert any that are really spacing, radius or control sizes into tokens. Keep true one-off geometry as is.",
    effort: "M",
  },
  {
    id: "inline-styles",
    area: "Tokens",
    title: "Check inline styles in components",
    count: inlineStyles.reduce((n, r) => n + r.n, 0),
    unit: "style={{…}}",
    detail: "Most are measured positions (popover left/top), which is fine. Any that set colors, spacing or sizes should move to a class that reads tokens.",
    where: fmt(inlineStyles),
    request: "Audit style={{…}} in src/ui: keep measured positions, and move any static color, spacing or size into the component's stylesheet using tokens.",
    effort: "S",
  },
  {
    id: "local-z",
    area: "Tokens",
    title: "Local z-index values",
    count: localZ.length,
    unit: "literal z-index",
    detail: "Small z-index values inside a component are allowed as local stacking. Worth checking none of them compete with app layers.",
    where: [...new Set(localZ)],
    request: "Check each literal z-index in src/styles is local stacking inside its own component; replace any that stack against other app surfaces with a --z-* token.",
    effort: "S",
  },
  {
    id: "inline-svg",
    area: "Components",
    title: "Inline SVGs outside icons.tsx",
    count: inlineSvgs.reduce((n, r) => n + r.n, 0),
    unit: "inline <svg>",
    detail: "Icons belong in src/ui/icons.tsx so they show up here and stay consistent. MotifGlyph is the one intended exception.",
    where: fmt(inlineSvgs),
    request: "Move any inline <svg> in src/ui (other than MotifGlyph/MotifCellGlyph) into named components in src/ui/icons.tsx.",
    effort: "S",
  },
  {
    id: "large-files",
    area: "Structure",
    title: "Split the largest components",
    count: large.length,
    unit: "files over 500 lines",
    detail: "Large components mix several sub-surfaces, which makes them hard to reuse in the style guide and slow to review.",
    where: fmt(large),
    request: "Split the largest components in src/ui (RightPanel.tsx, StitchPicker.tsx, ReferenceImagePanel.tsx) into one file per sub-surface (e.g. GlossarySection, ExportSection, NavigatorSection), with no behavior change, and add the extracted pieces to the style guide.",
    effort: "L",
  },
  {
    id: "untested",
    area: "Structure",
    title: "Components without tests",
    count: untested.length,
    unit: "components",
    detail: "Components in src/ui with no matching .test file.",
    where: untested,
    request: "Add focused component tests (jsdom, like StitchPicker.test.tsx) for the shared primitives that have none, starting with ConfirmDialog, ColorChip, Popover and QuickTile.",
    effort: "M",
  },
  {
    id: "dark-mode",
    area: "Platform",
    title: "Dark mode",
    count: null,
    unit: "",
    detail: "Not built. With tokens.json in place it's mostly a second value per color token, plus a pass on the canvas, colorwork ink and cursor colors.",
    where: ["src/design/tokens.json", "scripts/build-tokens.mjs"],
    request: "Propose a dark theme: add optional dark values to color tokens in tokens.json, have build-tokens.mjs emit them under prefers-color-scheme: dark, and list which canvas/colorwork decisions need design input. Don't ship it switched on yet.",
    effort: "L",
  },
  {
    id: "figma",
    area: "Platform",
    title: "Publish tokens and components to Figma",
    count: null,
    unit: "",
    detail: "Stitch symbols already sync from Figma. Tokens and UI components have no Figma counterpart or Code Connect mapping yet.",
    where: ["src/design/tokens.json", "src/ui/*"],
    request: "Plan publishing tokens.json as Figma variables and the core components (Button, IconButton, Popover, ConfirmDialog, ColorChip, QuickTile) to the Figma library with Code Connect. Write the plan only; don't change Figma yet.",
    effort: "L",
  },
  {
    id: "palette",
    area: "Platform",
    title: "Make colorwork swatches editable",
    count: 32,
    unit: "swatches",
    detail: "Saved charts store a swatch's hex as its id, so changing a swatch color would orphan existing charts. Decoupling id from color would let the palette become tokens.",
    where: ["src/model/colorPalette.ts", "src/model/types.ts"],
    request: "Propose a migration that gives colorwork swatches stable ids separate from their hex (with a loader that maps old hex ids), so the palette's colors can become editable tokens. Plan and tests only.",
    effort: "L",
  },
];
