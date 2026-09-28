# Give the floating recolor/add-only chip real contrast against pale tiles

*2026-09-28*

## What was asked

QA follow-up (#249 → #265): the small circular color chip that sits on the
bottom-right corner of a stitch tile in the floating `StitchPicker` is nearly
invisible against a pale/uncolored tile. Investigation traced this to
`.colorChip` in `src/styles.css`: both its `border` and `background` were set
to `var(--bg)` (the page background) with a muted-gray icon on top —
background-on-background fill plus a low-contrast glyph, which reads as
missing rather than as a control.

## What was found

`ColorChip` (`src/ui/ColorChip.tsx`) is one shared component rendered in five
places across `RightPanel.tsx` and `StitchPicker.tsx`, in two modes:

- **`recolor`** — the restrictive chip on the picker's quick-slot tiles
  (`.picker__quickColorChip`), absolutely positioned over the tile itself.
  This is the "floating chart" affordance the original QA report (#249)
  flagged, and the one actually at risk of blending into a pale tile.
- **`add-only`** — the permissive chip on plain glossary/drawer rows
  (`.glossary__colorChip`, `.picker__itemColorChip`), laid out inline
  (`position: static`) next to other flat icon buttons in a list row, not
  overlaid on any tile artwork. These already override `.colorChip`'s border
  to `transparent` and read fine against the row background.

Because "too weak" has no objective contrast threshold in the code, and a
change to the shared base class has knock-on effects across all five sites,
this needed a human decision rather than a unilateral visual call — hence
the issue.

## What was decided

`tamaradidproduct` approved the issue's suggested direction with "Implement":
give `.colorChip` a solid border in `var(--border)` instead of `var(--bg)`,
plus a subtle drop shadow, so the chip reads as a control regardless of the
tile's own color.

Implementation: `.colorChip`'s base border changed from `var(--bg)` to
`1.5px solid var(--border)`, and a soft `box-shadow` was added. The two
inline/static variants (`.picker__itemColorChip`, `.glossary__colorChip`)
explicitly reset `box-shadow: none` alongside their existing
`border-color: transparent` override, since they sit in a list row next to
other flat icon buttons (e.g. `.glossary__remove`) that have no shadow — the
affordance problem was specific to the chip floating over a tile, not to
those inline rows, and adding a shadow there would have been a visual
regression rather than a fix. All five render sites (2× `recolor` on the
picker's quick tiles, 1× `add-only` in the picker's drawer list, 2× `add-only`
in the glossary panel) were checked against the change.

## Alternatives considered

- **A bigger chip or an always-on colored border regardless of theme** was
  not pursued — the issue's own suggested direction (border in an existing
  token, optionally with a shadow) was already concrete and approved, and a
  larger structural change wasn't needed to fix the contrast problem.
- **Applying the shadow uniformly to all five sites** was rejected once the
  inline glossary/drawer rows were checked — those chips already read fine
  against their row background, and a shadow there would have made them
  inconsistent with the other flat icon buttons in the same row.
