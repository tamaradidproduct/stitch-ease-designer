# Consolidate duplicated glossary row, picker tile, and drag-drop code

*2026-10-01*

## What was found

A glossary/picker code scan (issue #323) flagged several pieces of
near-identical, copy-pasted code across `RightPanel.tsx` and
`StitchPicker.tsx`:

- **Glossary rows.** Slotted quick-row rows and overflow glossary rows in
  `RightPanel.tsx` were ~90 near-identical lines each — same glyph, label,
  "All (n)" select-all button, add-only `ColorChip`, and disarm/remove/spacer
  trailing slot. The one real difference: slotted rows armed via
  `setArmedSymbolId` alone (pure arm — the item's already in a quick slot),
  while overflow rows armed via `chooseSymbol`, which also promotes the item
  into a free quick slot. That difference was an implicit side effect of
  which copy-pasted block happened to render for a given item, not something
  named or visible at the call site.
- **Drag-and-drop handlers.** The same `draggingQuickId`/`dragOverQuickId`/
  `dragOverQuickSlot` state and handler shape was hand-wired three times in
  `RightPanel.tsx`: a filled quick slot (reorder/push via `moveQuickSymbolTo`,
  #271), the inline "Add stitch" search box standing in for an empty slot,
  and a plain empty slot. A fourth, differently-shaped drop target (an
  overflow row, which additionally guards against promoting an
  already-slotted item and reorders via `moveGlossaryIdTo`) was explicitly
  called out as not needing to fit the same shape.
- **Picker tiles.** `StitchPicker.tsx`'s quick-slot tile and its dynamic
  sixth tile (FR-30) rendered identical markup, including the recolor
  `ColorChip`. Their `ColorChip` guards were subtly different in form
  (`currentSlot?.key === entry.key` vs. a bare `currentSlot` truthiness
  check) despite being equivalent in practice — the dynamic tile only ever
  exists when it already *is* the current slot.
- **`choose()`'s `reviewingSuggestion` handling.** `StitchPicker.tsx`'s
  `choose()` repeated the same "reviewing a suggestion only parks the pick in
  a quick slot without arming it, so Suggest stays armed for the rest of the
  review pass" logic across its three resolve branches, with one
  (`selectionEmptyCells`) adding its own extra condition.
- **Glyph-size magic numbers.** `58/span`, `54/span`, `48/span` with max
  `22`/`20`/`18` respectively were scattered literal formulas across both
  files.
- **Inline SVGs.** The magnifying-glass search icon was duplicated three
  times (the glossary's inline search box, the picker's morphed search
  field, and its trigger button) instead of living in `src/ui/icons.tsx`
  with the rest.
- **`closeGlossarySearch`.** The helper existed but its two-line body
  (`setSearchSlot(null); setGlossaryQuery("")`) was still inlined twice
  instead of calling it.

## What was decided

The repo owner (`tamaradidproduct`) posted a suggested approach and then
approved it ("Go ahead and implement") with no alternatives seriously
discussed:

1. Add characterization tests first, covering current behavior before
   touching it: arming a slotted row vs. an overflow row, the add-only color
   chip's presence on plain (not colored) rows of both row kinds, and each
   of the three consolidated drag/drop targets.
2. Extract a parameterized `GlossaryRow` whose arming behavior is an
   **explicit, named parameter** — an `armMode: "arm-only" | "arm-and-promote"`
   label plus an `onArm` callback the caller builds per row kind — instead of
   an implicit side effect of which block renders. **This is the one
   deliberate, confirmed behavior-adjacent change in the PR**: not a
   behavior change itself (slotted rows still arm-only, overflow rows still
   arm-and-promote, byte-for-byte the same outcome), but making that split
   visible and named rather than accidental, so the two paths can't quietly
   drift apart the next time someone edits one copy and forgets the other.
3. Extract `useQuickSlotDropTarget` for the three same-shaped drop targets;
   leave the overflow row's drop target separate, as the issue anticipated,
   since it didn't cleanly fit (it shares the hover-highlight half via the
   hook's `trackDragOverKey`, but keeps its own bespoke `onDrop`).
4. Extract `QuickTile` for the picker's two tile call sites, standardizing on
   the key-matching `ColorChip` guard form for both (confirmed equivalent,
   not a behavior change — see the dynamic tile's derivation in
   `StitchPicker.tsx`, which is built directly from `currentSlot.key`).
5. Extract a small `finishResolve` helper in `StitchPicker.tsx` for the
   shared `reviewingSuggestion` step across `choose()`'s three branches.
6. Centralize the glyph-size formula into one `glyphCellSize(span,
   numerator, max)` helper (`src/ui/glyphSize.ts`) — each of its three call
   sites keeps its own existing numerator/max, only the formula itself moved.
7. Reuse one `SearchIcon` (`src/ui/icons.tsx`) at all three inline-SVG sites.
8. Replace the two inlined `closeGlossarySearch` bodies with calls to it.

No other behavior change was intended anywhere in this refactor.

## Why this is safe

Every extraction was verified against the original markup/logic line by
line, plus `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, and `npm run
build` all passing clean after the full refactor. Characterization tests
were added (not just relied on for pre-refactor coverage) in
`src/ui/RightPanel.quickSlotDrop.test.ts` (the two drag/drop targets not
already covered by the pre-existing #308 regression test) and two new files,
`src/ui/RightPanel.glossaryRow.test.ts` (arm-only vs. arm-and-promote
arming, and the add-only chip's presence across all four
slotted/overflow × plain/colored combinations) and additions to
`src/ui/StitchPicker.test.tsx` (the recolor chip's visibility on the active
quick-slot tile vs. the dynamic sixth tile). All pre-existing tests
(`RightPanel.quickSlotDrop.test.ts`'s original #308 case,
`StitchPicker.test.tsx`'s #306/#305 suites) pass unchanged.

## PRD check

`docs/PRD.md`'s "Multicolor stitches (colorwork)" section's File map table
(~L674-693) was updated to point at the new shared files
(`GlossaryRow.tsx`, `QuickTile.tsx`, `useQuickSlotDropTarget.ts`,
`glyphSize.ts`) alongside `RightPanel.tsx`/`StitchPicker.tsx`, including a
short factual note on `GlossaryRow`'s `armMode` split and why it's
deliberately preserved rather than merged. No FR/DNT/G id governs that split
specifically — it's product behavior that already existed (and is explained
by FR-24/FR-26's quick-slot-promotion semantics), not a new spec — so no new
requirement id was added or invented for it.
