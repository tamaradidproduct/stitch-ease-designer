# Editable design system: one token source, page-driven updates (2026-10-06)

## Asked

Re-audit the app so that every visual value is either linked to a
token/component or listed on the style-guide page. Ideally, editing the
page should propagate changes across the app.

## Decided

- **Off-scale values snap to the scale.** Chosen over adding in-between
  tokens. The spacing scale gains a 10px step (and `--space-px`), radius
  gains `2xs` and `circle`, and type gains a 9px `3xs`. Shifts are
  1–2px. Glossary rows round down so the side panel doesn't start scrolling
  at 800px tall.
- **`src/design/tokens.json` is the single source.** It generates the CSS
  custom properties and a TS module, so the canvas, cursors, trace presets
  and colorwork ink use the same values as the chrome.
- **New token families:** success, motif accent, highlight, trace colors,
  canvas and cursor colors, border widths, icon sizes, panel and page
  widths.
- **Tests guard the rules.** They fail on raw colors or raw px
  spacing/radius/type in component stylesheets, on undeclared custom
  properties, and on stale generated files.
- **The style guide is built from the repo.** It uses the real React
  components, and component geometry is listed automatically.
- **Propagation is "Apply to app".** The button starts a Claude Code session
  that opens a PR for review. This was chosen over copying JSON by hand and
  over auto-merging.

## Not decided / left as-is

- **Colorwork swatch hexes** stay data, because they're stored ids in saved
  charts.
- **Component geometry** (fixed sizes of individual parts) is listed on the
  page and changed through the request note, not tokenized.
- **Dark mode** is still undecided.

No PRD change: this is design tooling and UI architecture, not product
behavior.
