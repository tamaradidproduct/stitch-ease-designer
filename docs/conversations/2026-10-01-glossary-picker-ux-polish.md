# Glossary/picker UX polish: keyboard reorder, disabled-remove tooltip, wording

*2026-10-01*

## What was asked

Issue #326, filed from a glossary/picker code scan, raised five separate UX
gaps:

- Quick-slot reordering is drag-only (HTML5 drag-and-drop), with no keyboard
  path and fragile iPad behavior, despite `moveQuickSlot` already existing
  in the model.
- A placed, non-removable glossary row shows a blank spacer where the
  remove (X) button would be, with no explanation for why removal is
  unavailable.
- Wording drifts across "This pattern," "This chart," "More stitches from
  this pattern," "More stitches in this pattern."
- The glossary search "Added" badge appears only for plain entries; colored
  entries have no equivalent.
- Color affordances differ by surface (quick tiles, drawer/glossary rows,
  the current tile) — unclear whether that's intentional.

## What was decided

`tamaradidproduct` posted a suggested implementation, then two follow-up
comments that refine and approve it:

- **Reorder.** Add explicit "Move up"/"Move down" controls beside each
  quick slot, wired to `moveQuickSlotTo` — treat the keyboard/touch path as
  the primary fix, keep drag-and-drop as an optional pointer shortcut.
  Expose the same action via a documented keyboard shortcut, disabled at
  the ends.
- **Disabled remove tooltip — refined.** Her exact wording overrides the
  issue's own draft: **"Remove placed stitches of this kind first"** (not
  "Remove all placed stitches first").
- **Wording — refined.** Standardize on **"This chart"**, not "This
  pattern," for now.
- **Everything else approved as suggested**, including documenting the
  intended color-affordance matrix in the FR tests rather than changing it.

## What was implemented

- `moveQuickSlotDirection(key, direction)` added to `docStore` as a thin
  wrapper over the existing `moveQuickSlot` model function. "Move up"/"Move
  down" buttons added beside each quick-row item (`RightPanel.tsx`),
  disabled at the ends of their own list — the numbered quick row and the
  overflow list reorder independently, matching the existing drag/drop
  guard that already keeps the two separate. A global `Alt+Up`/`Alt+Down`
  shortcut (`useShortcuts.ts`) reorders whichever quick slot is currently
  armed, documented in the buttons' own tooltips; the overflow list's move
  buttons have no keyboard shortcut, matching its mouse/touch-only drag.
- The blank spacer at the two sites that actually gate on
  `symbolsPlaced.has(key)` (the slotted quick row and the overflow list) is
  now a disabled remove button with the agreed tooltip. The Suggest
  pseudo-row's own spacer was left alone — it was never a removable
  glossary entry.
- Wording standardized to "This chart" at all four identified sites in
  `RightPanel.tsx` and `StitchPicker.tsx`. One existing "This chart" label
  (the matching-repeats search heading) was already correct and untouched.
- The "Added" badge was traced, not copied: it lives in `RightPanel.tsx`'s
  "Add stitch" search dropdown, which browses `allSymbols()` — the bare
  symbol-type library, which has no color concept at all. Every row there
  is structurally plain, so there's no colored-entry case for it to be
  missing an "Added" state for. `StitchPicker.tsx`'s own drawer and
  typed-search results were checked too and have no add/added-style
  indicator at all, colored or plain — no existing precedent to parallel.
  No fix applied; documented in the PR as a traced non-issue rather than a
  gap.
- The color affordance matrix (no chip on a non-current quick tile,
  add-only chip on drawer/glossary rows, recolor chip on the current tile)
  was confirmed against FR-25 and FR-34 as the behavior those requirements
  already specify, not drift. A characterization test was added
  (`StitchPicker.test.tsx`) and a short note recorded in `docs/PRD.md`'s
  "Multicolor stitches (colorwork)" section. No behavior changed.

## Alternatives considered

None raised independently in this thread — the suggested-fix comment was
the only implementation proposal, and the owner's follow-ups were wording
refinements to it rather than alternative approaches.
