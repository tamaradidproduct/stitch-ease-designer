# Stitch picker / glossary consistency — 2026-10-03

A review of the stitch picker and the glossary panel found places where the
two disagreed. Decisions (now FR-66 in `docs/PRD.md`):

## Color chip
- **Problem:** the same chip recolored placed stitches on a picker quick tile
  but only added a new colored pen on glossary and drawer rows.
- **Decision:** one rule everywhere.
  - If some plain placements stay untouched, add a new colored stitch.
  - If there are none, or all are being recolored, replace the plain chip in
    place.
  - Plain knit/purl stay available below the colored one, since every chart
    starts with them.

## Search
- **Problem:** the picker's search was blank until you typed, while the
  glossary's listed everything.
- **Decision:** match the glossary.
  - The list opens grouped by category.
  - Glossary entries are hidden until a query, then tagged "Added".
- The glossary search also finds motifs. Picking one arms it; motifs are
  already in the glossary.
- The glossary result action is renamed from "Add" to "Select", since it
  also arms the stitch.

## Motif rows
- **Problem:** a numbered motif row's X only unpinned it from its slot,
  while an unslotted row's X deleted the motif.
- **Decision:** make it consistent with stitches. The X (no copies only)
  removes the motif, i.e. deletes it (undoable).
- Unslotted motifs get working Move up/down. Reordering them among
  themselves is still valuable.

## "Current" tag
- Must match the chip exactly: the same (symbol, color) key.

## Wording
- **Alternatives:** "recent", "shortcut", "glossary".
- **Decision:** "quick" for the numbered slots, the best fit among those.
- Trash button: "Clear" (label) / "Clear stitch".

## Counts
- The header counts colored and plain variants as separate stitch types, and
  counts motifs.
- Row counts stay loose-only.
  - Stitches inside motif copies don't count toward, or get selected by,
    their stitch's row.
  - A cable counts once on its own row. The knit/purl it's worked as don't
    count.
  - The stitch numbers below the chart still count every cable cell. For
    example, three 2/2 cables = cable (3), knit/purl (0), row total 12.
  - An earlier draft counted both; it was rejected.

## Deferred to the motif swap/replace finding (#346)
- The picker drawer offers stitches/motifs that can't go into a cable cell,
  and choosing one silently does nothing.
- Picker quick tiles disable choices that don't fit the selection, while the
  drawer and search hide them.

## Picker counts
- Not needed. The picker stays count-free; counts live in the glossary.
