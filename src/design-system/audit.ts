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

const rawButtons = perFile(/<button\b/g).filter((r) => r.file !== "Button.tsx");
const ownLookButtons = perFile(/variant="unstyled"/g);
// Hidden file inputs and the native custom-color picker are meant to stay raw.
const inputs = source
  .map(([p, text]) => ({
    file: shortName(p),
    n: (text.match(/<input\b[^>]*>/gs) ?? []).filter((tag) => !/type="(file|color)"/.test(tag)).length,
  }))
  .filter((r) => r.n > 0 && !["Field.tsx"].includes(r.file));
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

// Floating surfaces that draw their own popover-level shadow instead of
// using <Popover>. The glass docks are deliberate and excluded.
const nonPopoverOverlays = Object.entries(sheets).flatMap(([, text]) =>
  [...text.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{[^{}]*box-shadow:\s*var\(--shadow-3\)[^{}]*\}/g)]
    .map((m) => m[1]!.trim().split(/\s*,\s*/)[0]!)
    .filter((sel) => !/^\.(popover|toolDock|panDock|referenceDock|referenceImageQuickDock)/.test(sel)),
);

// Radio groups built by hand rather than with SegmentedControl.
const handRadioGroups = perFile(/role="radiogroup"/g).filter((r) => r.file !== "SegmentedControl.tsx");

const fmt = (rows: { file: string; n: number }[]) => rows.map((r) => `${r.file} (${r.n})`);

export const backlog: BacklogItem[] = [
  {
    id: "own-look-buttons",
    area: "Components",
    title: "Unify buttons that still have their own look",
    count: ownLookButtons.reduce((n, r) => n + r.n, 0) + rawButtons.reduce((n, r) => n + r.n, 0),
    unit: "custom-styled buttons",
    detail: "Every button now goes through Button, but these use variant=\"unstyled\" and keep a component-specific look (tool dock, quick slots, glossary row actions, menus). Many could share a small set of shared looks: icon button, toolbar button, menu item.",
    where: fmt([...ownLookButtons, ...rawButtons]),
    request: "Group the variant=\"unstyled\" buttons in src/ui by look (icon buttons, toolbar/dock buttons, menu items, list rows). Add shared Button variants or classes for the groups that are visually the same, and move them over. Leave genuinely one-off controls alone, and keep the visual result within 1-2px.",
    effort: "L",
  },
  {
    id: "form-controls",
    area: "Components",
    title: "Move remaining inputs onto TextField / Slider / Checkbox",
    count: inputs.reduce((n, r) => n + r.n, 0),
    unit: "raw <input>",
    detail: "Inputs not yet using the shared form controls in ui/Field.tsx. Hidden file inputs and the native color picker are excluded on purpose.",
    where: fmt(inputs),
    request: "Migrate any remaining raw <input> elements in src/ui to TextField, Slider or Checkbox from src/ui/Field.tsx.",
    effort: "M",
  },
  {
    id: "segmented",
    area: "Components",
    title: "Move hand-built radio groups onto SegmentedControl",
    count: handRadioGroups.reduce((n, r) => n + r.n, 0),
    unit: "radio groups",
    detail: "Single-choice groups built by hand instead of with SegmentedControl, which brings arrow-key navigation and one tab stop. The tool dock is a toolbar of toggles, not a radio group, so it's excluded.",
    where: fmt(handRadioGroups),
    request: "Move hand-built role=radiogroup groups in src/ui onto SegmentedControl (appearance=\"custom\" where they need their own look).",
    effort: "S",
  },
  {
    id: "overlays",
    area: "Components",
    title: "Floating surfaces outside Popover",
    count: nonPopoverOverlays.length,
    unit: "surfaces",
    detail: "Rules that draw a popover-level shadow (--shadow-3) without the shared Popover surface. Glass docks are excluded on purpose.",
    where: nonPopoverOverlays,
    request: "Review the floating surfaces in src/styles that draw --shadow-3 without .popover (listed on the style guide) and move true popovers onto <Popover>; leave floating action buttons as they are.",
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
    request: "Split the largest components in src/ui further (GlossarySection: inline search and results; StitchPicker: search results list; ReferenceImagePanel: calibration editor) into one file per sub-surface, with no behavior change. Split their stylesheets the same way.",
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
