# Motifs: reusable stitch groups with linked copies (phase 1)

Source: interactive Claude Code session, 2026-10-01 → 2026-10-02.

## What was decided

- The main job is **building a chart fast**: design a motif once, stamp or
  tile it many times in the same chart, keep iterating.
- Copies are **linked with per-copy overrides**: edits stay local to a copy
  until explicitly pushed to the motif; Reset and Detach are explicit actions.
- Phase 1 placement: **stamp with ghost preview**, **drag-fill / tile**, and
  **mirror while stamping** (knitting-aware symbol swaps).
- **Motifs are pens, not a panel** — they live in quick slots and the
  picker's More drawer; rename/mirror/delete go through that drawer rather
  than a new interaction. A tile doesn't need a full preview of the motif.
- The ghost anchors at the **row-start corner** of the bottom row; direction
  comes from the same seam that pattern info (worked flat/round, first row,
  first stitch) will drive.
- **Deleting a motif** asks the designer what to do with its copies (detach,
  delete, cancel) — detach is never implicit.
- Never overwrite existing stitches.

## Why

- Linked-with-overrides was chosen over "always all copies update" and
  "edit master only" so a designer can try a variation on one copy without
  committing every copy to it.
- Overrides are *derived* (diff between motif and copy) rather than stored,
  so no existing edit path (paint, erase, recolor, replace, move, paste)
  needs to keep a second record in sync.
- No panel: a second "where do I pick things to place" surface would
  duplicate the quick row's arm → paint flow.

## Alternatives considered

- Virtual (render-time) instances — rejected; every tool would need teaching.
- A dedicated Motifs panel — deferred as an optional hidden-by-default panel.
- Swapping copies for another motif, with row-direction push and
  preview/confirm — deferred: needs a decision on how motifs stack across
  mixed-direction rows first.

## Prior art surveyed

Figma/Sketch components with overrides, Unity prefabs, Pyxel Edit /
Aseprite tilemaps (live tiles), Stitchmastery / EnvisioKnit / Stitch Fiddle
repeat boxes, Illustrator pattern swatches, cross-stitch motif libraries.

## Deferred items

Filed as Enhancement findings in the QA Airtable base (#34–#37): swap motif,
mixed-direction rows + vertical stacking, optional Motifs panel, cross-chart
library.
