# Motifs (reusable stitch groups) — Phase 1 design

*Date: 2026-10-02 · Status: approved for implementation*

## Goal

Help a designer **build a chart fast**: design a motif once, stamp or tile it
many times in the same chart, and keep iterating on it — with each copy able
to carry its own local tweaks (overrides) until they're pushed back to the
motif.

## Prior art considered

| Pattern | Seen in | Takeaway |
|---|---|---|
| Linked components + overrides | Figma, Sketch symbols, Unity prefabs | Instances linked to a master; local overrides; push/reset/detach |
| Live tiles | Pyxel Edit, Aseprite tilemaps, Tiled | Edit once, every copy repaints |
| Repeat box ×N | Stitchmastery, EnvisioKnit, Stitch Fiddle | Bordered "repeat N times" region (communication, not reuse) — deferred |
| Pattern fill | Illustrator pattern swatches, embroidery fills | Drag a region → tiled with the motif |
| Custom brush / stamp | Aseprite, Photoshop brushes, cross-stitch motif libraries | Arm a motif as the pen, ghost preview, click to stamp |

## What already exists

- `RepeatDefinition` (`src/model/types.ts`) + `createRepeat` / `instantiateRepeat`
  (`src/state/docStore.ts`), `Cmd/Ctrl+G`, a "Repeat" selection bubble, and
  motif search results in the picker.
- `Placement.groupId` makes grouped stitches select/move as a unit.
- Copies are **detached** (no link back to the definition); no rename, delete,
  browse, preview or canvas indicator.

## Decisions

1. **Terminology.** UI says **Motif** (was "Repeat"). Stored data keeps the
   `repeats` key / `RepeatDefinition` type — no migration.
2. **Model: materialized instances + derived overrides.**
   - Every copy stays real `Placement`s in the index, so selection, Suggest,
     export, numbering and colorwork keep working untouched.
   - New `MotifInstance { id, motifId, col, row, mirrored? }`, stored with the
     chart beside `repeats`. `id` equals the copy's placements' `groupId`.
     `col`/`row` are the footprint's bottom-left cell.
   - Overrides are **computed**, never stored: the diff between what the motif
     says belongs in the footprint and the copy's actual stitches. Rejected:
     virtual instances (every tool would need teaching) and stored overrides
     (every edit path would have to maintain them).
3. **Membership.** A copy's stitches are the placements with its `groupId`.
   Placing a stitch in an empty cell inside a copy's footprint joins that copy
   (an "added" override). Erasing/replacing/recoloring members are overrides.
4. **Footprint** (width × height) is fixed at motif creation; Push can't grow it.
5. **Copy actions** (selection bubbles on a selected copy):
   - **Push to motif** — this copy's current stitches become the motif; other
     copies are re-materialized and **keep their own overrides** (a local
     override wins on conflict). Shown only when the copy has overrides.
   - **Reset** — discard this copy's overrides. Shown only with overrides.
   - **Detach** — stitches become plain, unlinked placements.
   - **Mirror** — flip this copy.
6. **Mirror.** Knitting-aware horizontal flip: columns reversed within the
   footprint and directional symbols swapped (left↔right cables incl. purl and
   `_hr` variants, `k2tog`↔`skpo`, `k2tog_alt`↔`ssk_alt`, `p2tog`↔`ssp`,
   `tk2tog`↔`tssk`, `m1l`↔`m1r`, `m1lp`↔`m1rp`). Symmetric stitches unchanged.
   Push from a mirrored copy un-mirrors back into the motif.
7. **Motifs are pens, not a panel.**
   - Quick-slot / glossary key `motif:<id>` (symbol ids never contain `:`).
   - Tile: generic motif glyph + `W×H` badge; name in tooltip/drawer row. No
     full preview.
   - "More → This pattern" drawer lists motifs; rename / mirror / delete live in
     that drawer, not on canvas or in a new panel.
   - Excluded from the chart key/legend and the export glossary.
8. **Stamp.** An armed motif shows a full-size ghost on the canvas; click places
   a linked copy and stays armed; `Esc` disarms. A copy that would collide is
   drawn red and refuses to place — nothing is ever overwritten.
9. **Anchor.** The ghost hangs off the hovered cell at the **row-start corner**
   of its bottom row, read via the `rowDirectionAt` seam (today every row is
   `rtl`, so bottom-right). When `worked`/`firstRow`/`firstStitch` start
   driving row direction, stamping follows automatically.
10. **Drag-fill.** Dragging with a motif armed tiles as many whole copies as fit
    edge-to-edge from the anchor corner; colliding tiles are skipped and the
    count reported. One undo step.
11. **`X`** toggles mirror on the armed stamp (ghost flips live).
12. **Canvas indicator.** Dashed footprint outline on a hovered/selected copy;
    overridden cells get a small dot while the copy is selected.
13. **Duplicate / paste / move.** Moving a whole copy shifts its origin;
    duplicating or pasting a whole copy creates a new **linked** copy.
14. **Deleting a motif** asks: **Detach copies** · **Delete copies** · **Cancel**.
15. **Undo.** Every motif action is one undo step; motif + instance lists are
    snapshotted on the history entry (extends today's `repeats` snapshot).

## Deferred (filed as Airtable Enhancement findings #34–#37)

- Swap a copy / all copies for another motif (row-direction push, preview +
  confirm, shear conflicts, gap vs pull on shrink, "Swap to…" in delete dialog).
- Motif behavior across mixed-direction rows (flat RS/WS) and vertical stacking.
- Optional hidden-by-default Motifs panel.
- Cross-chart motif library.

## Testing

- Unit (docStore/model): create, stamp, collision refusal, fill counts,
  override derivation, push preserving other copies' overrides, reset, detach,
  mirror symbol map + un-mirror on push, delete (detach/delete), move/duplicate
  keep linkage, undo/redo of each, serialize round-trip incl. legacy charts with
  `repeats` but no instances.
- Browser: stamp ghost, drag-fill, bubbles, drawer management, outline.
