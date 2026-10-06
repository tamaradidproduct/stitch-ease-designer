# Design system

How the UI layer is put together, and the rules for adding to it. The
inventory that motivated this structure is summarized in
`docs/conversations/2026-10-05-design-system-inventory.md`.

## Stylesheets

`src/styles.css` is only an ordered `@import` index over `src/styles/*.css`.
**Import order is cascade order**: tokens, base, shared primitives
(`buttons`, `popover`, `glyph`, `color`), then feature surfaces. Each BEM
block (`.picker`, `.glossary`, `.refpanel`…) lives in its own file. A new
block gets a new file and an import line, so it isn't appended to an
existing file.

When an element carries classes from two blocks (e.g. `btn
refpanel__headerAction`, `toolDock__button referenceDock__apply`), the file
imported later wins any same-specificity conflict. `referenceDock.css`
deliberately loads before `toolbar.css` so `.toolDock__button` keeps
winning.

## Tokens (`src/design/tokens.json`)

`src/design/tokens.json` is the **only** place token values live. Each
token has a value and a description, grouped by kind. `npm run tokens`
generates:

- `src/styles/tokens.css`: the `:root` custom properties every stylesheet uses.
- `src/design/tokens.generated.ts`: the same values for the canvas renderer,
  cursor builder, trace presets and colorwork ink (`import { tokens, alpha }
  from "../design/tokens"`).

Never edit either generated file by hand. `npm run build` fails if they're
stale.

Groups: neutrals, accent, danger, success, suggest mode, motifs & trace,
banners, surfaces, chart canvas (canvas, grid, cell, colorwork ink, cursor
preview), type (7 sizes, 3 weights), spacing (`--space-px`, then
`--space-1`…`--space-11` = 2 · 4 · 6 · 8 · 10 · 12 · 16 · 20 · 24 · 32 ·
64px), radius (`2xs`…`xl`, `full`, `circle`), border widths, icon and
control sizes, layout (`--panel-width`, `--page-max-width`), elevation,
layers, motion.

Aliases: a value of `"{other-token}"` links a token to another one (CSS
gets `var(--other-token)`, TS gets the resolved value). Used where two
tokens must move together, e.g. `--info-bg` follows `--accent-soft-bg`,
`--tooltip-bg` follows `--text`.

Rules, enforced by `src/design/tokens.test.ts`:

- **Colors:** a component stylesheet never contains a hex or `rgb()` value.
  Use a token, or add one to `tokens.json`. The trace-colors hue wheel is
  the one deliberate exception.
- **Spacing, radius and type:** a component stylesheet never uses a raw px
  value for `gap`, `padding`, `margin`, `border-radius`, `font-size` or
  `font`. Snap the value to the scale; don't add an off-scale value.
- **Custom properties:** every one a stylesheet references must be declared.
- **Geometry:** raw px values are fine for component geometry (a 38px tool
  button, a popover's width). The style guide lists every one under
  "Component geometry".
- **Line height and letter spacing:** use `--leading-*` and `--tracking-*`.
- **Hover:** every `:hover` rule sits inside `@media (hover: hover)`, so it
  doesn't stick after a tap on iPad.
- **Disabled and focus:** disabled controls use `--opacity-disabled`.
  Keyboard focus comes from one global `:focus-visible` ring
  (`--focus-outline`, `--focus-offset`); don't set `outline: none` on a
  focusable element.
- **Layers:** `z-index` 1–6 inside a component is local stacking. Anything
  that stacks against other app surfaces uses a `--z-*` layer.
- **Motion:** `prefers-reduced-motion` is handled globally in `base.css`.
- **Colorwork palette:** the 32 swatches in `model/colorPalette.ts` are data,
  not tokens. Saved charts store a swatch's hex as its id, so changing one
  needs a migration.

## Living style guide (`docs/design-system.html`)

`design-system.html` + `src/design-system/` is a second Vite entry that
renders the real components and every token. `npm run design-system`
bundles it into one self-contained file, `docs/design-system.html`, and
`dist-design-system/artifact.html` for publishing to claude.ai. Rebuild it
whenever tokens or components change.

The published page has a token editor:

1. Edit any value. The whole page previews it live. The draft is shared
   through the artifact's store, so a teammate sees the same draft.
2. Optionally describe other changes (components, layout, copy) in the
   request note.
3. **Apply to app** starts a Claude Code cloud session through the Claude
   Code Remote connector. It edits `tokens.json`, regenerates everything,
   runs build, lint and tests, and opens a PR. The PR is never merged
   automatically. Once it merges and the page is rebuilt, the draft clears
   itself, because the edited values now equal the source.

## Components

| Component | File | Use for |
| --- | --- | --- |
| `Button` | `ui/Button.tsx` | Every button. `variant` default / primary / quiet / unstyled, `danger`, `size` sm / md / lg (`--control-sm/md/lg`), `on` (toggle). `unstyled` keeps a component's own look but still goes through Button. |
| `IconButton` | `ui/Button.tsx` | Icon-only buttons. `label` (required, becomes `aria-label`), optional `tooltip`. |
| `TextField`, `Slider`, `Checkbox` | `ui/Field.tsx` | Every input. TextField variants: default, inline (edit a title in place), rename (replaces a row label), unstyled (inside a styled search box). |
| `SegmentedControl` | `ui/SegmentedControl.tsx` | Single-choice groups (role=radiogroup, arrow keys). `appearance="custom"` for a component's own look. |
| `Popover` | `ui/Popover.tsx` | Floating surfaces. In-flow quiet boxes use the `.inset` class instead. |
| `SideModule` | `ui/SideModule.tsx` | A right-panel card: title, subtitle, optional disclosure toggle, body. |
| `ConfirmDialog` | `ui/ConfirmDialog.tsx` | Confirmation. Use it instead of `window.confirm()`. |
| `ColorChip` / `ColorSwatchPopover` | `ui/ColorChip.tsx` | Picking a colorwork color. |
| `SymbolGlyph` | `ui/SymbolGlyph.tsx` | Drawing a stitch symbol exactly as on the canvas. |
| Icons | `ui/icons.tsx` | All icons. Add a new one here; don't inline an `<svg>` in a component. |

Behavior hooks: `useDismissOnOutsideOrEscape` (all overlays) and
`tapActivate` (touch-safe activation).

The right panel is a shell (`RightPanel.tsx`) around one file per card:
`GlossarySection`, `ReferenceImagePanel`, `ExportSection`, `HelpSection`,
`NavigatorSection`. The style guide's Consolidation backlog lists what's
left (buttons that still have their own look, files over 500 lines, and so
on), counted live from the source.
