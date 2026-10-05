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

## Tokens (`src/styles/tokens.css`)

| Group | Tokens |
| --- | --- |
| Neutrals | `--bg`, `--chrome`, `--border`, `--border-subtle`, `--text`, `--text-muted`, `--text-subtle` |
| Accent | `--accent`, `--accent-soft-bg`, `--accent-soft-border`, `--accent-mid`, `--accent-ring`, `--on-solid` |
| Danger | `--danger`, `--danger-soft-bg`, `--danger-soft-border`, `--danger-wash`, `--danger-strong`, `--danger-ink` |
| Suggest mode | `--suggest`, `--suggest-strong`, `--suggest-wash` |
| Banners | `--warning-bg/-border/-text`, `--info-bg/-border/-text` |
| Surfaces | `--surface-glass` + `--blur-glass` (floating docks), `--overlay-light`, `--tooltip-bg`, `--scrim`, `--hairline-ink` |
| Chart cells | `--cell-stroke`, `--cell-ink` |
| Type | `--font-sans`; sizes `--font-size-2xs` 10 · `xs` 11 · `sm` 12 · `md` 13 (base) · `lg` 16 · `xl` 22; weights `medium` 500 · `semibold` 600 · `bold` 700 |
| Spacing | `--space-1`…`--space-8` = 2 · 4 · 6 · 8 · 12 · 16 · 20 · 24px |
| Radius | `--radius-xs` 4 · `sm` 6 · `md` 8 · `lg` 10 · `xl` 12 · `full` |
| Control height | `--control-sm` 24 · `md` 28 · `lg` 36 |
| Elevation | `--shadow-0` resting card · `1` chip · `2` raised tile · `3` popover/menu/drawer · `4` modal |
| Layers | `--z-dock` 18 · `--z-panel` 19 · `--z-floating` 20 · `--z-popover` 30 · `--z-menu` 40 · `--z-modal` 1000 |
| Motion | `--duration-fast` 100ms · `--duration-base` 140ms · `--ease-standard` |

Rules:

- Use a token for every color. A new color means a new token with a comment
  saying what it's for. No hex in component files.
- Off-scale spacing and radius values (3, 5, 7, 9px…) still exist as
  optical tweaks. Don't add new ones. Snapping the existing ones is a
  visual change that needs its own design pass.
- `z-index` 1–6 inside a component is local stacking and stays literal.
  Anything that stacks against other app surfaces uses a `--z-*` layer.
- `prefers-reduced-motion` is handled globally in `base.css`.
- There's no dark theme yet. If one is added, it should be a second token
  block, and the canvas and colorwork ink rules need their own pass.

### Canvas colors

The canvas renderer can't read CSS variables, so `src/design/tokens.ts`
mirrors the colors it shares with the chrome, and `canvas/theme.ts` reads
from it. `src/design/tokens.test.ts` fails if a mirrored value drifts from
`tokens.css`. It also fails if any stylesheet references an undeclared
custom property.

## Components

| Component | File | Use for |
| --- | --- | --- |
| `Button` | `ui/Button.tsx` | Every text button. `variant` default/primary/quiet, `danger`, `size` sm/md/lg, `on` (toggle). Defaults to `type="button"`. |
| `IconButton` | `ui/Button.tsx` | Icon-only buttons. `label` (required, becomes `aria-label`), optional `tooltip`. |
| `buttonClassName()` | `ui/buttonClassName.ts` | A non-button element styled as a button (e.g. a router `Link`). |
| `Popover` | `ui/Popover.tsx` | Floating surfaces: popovers, menus, drawers. Supplies background, border, radius and shadow. The caller handles position, layer, padding, role and dismissal (`useDismissOnOutsideOrEscape`). |
| `ConfirmDialog` | `ui/ConfirmDialog.tsx` | Confirmation. Use it instead of `window.confirm()`. |
| `ColorChip` / `ColorSwatchPopover` | `ui/ColorChip.tsx` | Picking a colorwork color. |
| `SymbolGlyph` | `ui/SymbolGlyph.tsx` | Drawing a stitch symbol exactly as on the canvas. |
| Icons | `ui/icons.tsx` | All icons. Add a new one here; don't inline an `<svg>` in a component. |

Behavior hooks: `useDismissOnOutsideOrEscape` (all overlays) and
`tapActivate` (touch-safe activation).

Many bespoke buttons (tool dock, picker quick slots, glossary row actions)
still render a raw `<button>` with their own block class. Move them onto
`Button` / `IconButton` when you're already working in that area.
