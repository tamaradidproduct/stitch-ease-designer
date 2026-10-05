# Design system inventory and consolidation (2026-10-05)

## Context

An audit of the UI layer found:

- **Tokens:** 12 color tokens and no other tokens. About 25 hardcoded
  colors, and two custom properties (`--accent-strong`, `--accent-ink`)
  that were referenced but never declared.
- **Canvas palette:** copied as hex literals into `canvas/theme.ts`.
- **Scales:** 17 distinct shadows, 11 radii and 15 gap values.
- **Stylesheet:** a single 3,700-line `styles.css`.
- **Buttons:** a `.btn` style with no component behind it.
- **Overlays:** 11 overlay surfaces, each with its own styling.
- **Icons:** about 50 inline SVGs scattered across 13 components.

## Decided

The designer asked to implement the recommendations in code and leave
Figma for later:

1. **Complete the token layer.** Add type, spacing, radius, control-height,
   elevation, layer and motion tokens, plus the missing color families.
2. **Share one palette.** Use one palette for CSS and the canvas, enforced
   by a parity test.
3. **Buttons.** Add `Button` / `IconButton` components and migrate every
   `.btn` call site.
4. **Popovers.** Add a shared `Popover` surface and adopt it in the 8
   floating overlays.
5. **Icons.** Move all inline SVGs into named icon components.
6. **Stylesheets.** Split `styles.css` into per-block files.
7. **Reduced motion.** Add a `prefers-reduced-motion` rule.

The refactor was meant to be visually neutral. The only intended visual
changes:

- **Shadows:** folded into 5 elevation levels. Pattern settings, glossary
  search results and the draw-stop button pick up the shared level.
- **Popover radius:** 8px on every popover. The color popover was 10px and
  glossary search results were 7px. The suggest review menu and the more
  drawer go from 12px and 10px to 8px.
- **Mark editor popover:** moves to the popover layer so floating docks
  can't cover it.
- **Side-panel headings:** weight 650 becomes 600.

These were checked with a before/after computed-style diff across 30 app
states (desktop and tablet).

## Not done / deferred

- **Snapping off-scale spacing and radius values.** This needs a visual
  design pass.
- **Dark mode.** Undecided. The token structure makes it a second token
  block, but the canvas and colorwork ink need their own pass.
- **Figma.** Publishing tokens and components to the library with Code
  Connect is explicitly out of scope for now.
- **Bespoke buttons.** Migrating the remaining bespoke `<button>`s (tool
  dock, picker, glossary rows) onto `Button` / `IconButton` happens
  opportunistically.

No PRD change: this is UI architecture with no change to product behavior.
