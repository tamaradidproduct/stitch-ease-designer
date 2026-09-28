# Marquee-selecting unidentified cells (#268)

**Decision date:** 2026-09-28
**Issue:** [#268](https://github.com/tamaradidproduct/stitch-ease-designer/issues/268) (source: QA finding #255)

## What was found

The marquee-drag handler in `usePaintTool.ts`'s `onPointerMove` (`selecting`
branch) resolves the ids a drag rectangle covers via `resolveGroupIds(doc().index,
bounds)`, which only queries `DocIndex` for real `Placement` objects.
Confirmed placements and still-pending-but-*identified* Suggest results are
both `Placement`s (distinguished only by a `.suggested` flag), so a plain
`Cmd`/`Ctrl`-drag already picks both up fine.

An "unidentified" cell — one Suggest scanned but couldn't match against any
exemplar — is not a placement at all. It's a UI-side flag in
`referenceImageUnrecognized` (a `Set<string>` of cell keys in `uiStore.ts`),
set when the matcher fails and cleared once that cell gets a real match.
Nothing about it exists in `DocIndex`, so the marquee query could never see
it. The only way a plain marquee swept one in was the separate
`includeEmptyCells(e)` chord (`Cmd`/`Ctrl`+`Shift`+`Opt/Alt`-drag), which
indiscriminately folds in *every* genuinely empty cell too — not a targeted
way to grab just the unidentified markers.

## Why it needed a decision, not just a patch

Fixing this meant deciding how unidentified cells should participate in
selection, since they have no placement id of their own — they'd need to be
folded into `selectedEmptyCells`, the convention already used for them
elsewhere (`RightPanel.tsx` / `SuggestReviewMenu.tsx`'s "Replace all"
handling). The open question was whether unidentified cells should be
included under *plain* `Cmd`-drag — matching how identified suggestions
already behave — or stay gated behind the deliberate three-modifier
`includeEmptyCells` chord the way genuinely empty cells intentionally are
(per the PRD's Gotchas section on that chord, FR-21). Making unidentified
cells "cheaper" to select than blank cells is a deliberate asymmetry, and it
also affects how bulk actions treat a mixed batch of real empty cells vs.
unidentified markers once both land in `selectedEmptyCells`.

## Decision

Approved as-is, via the suggested approach in the issue:

> yes, unidentified cells should marquee-select as easily as identified ones

Unidentified markers are treated like identified suggestions for marquee
purposes — always swept into a plain `Cmd`/`Ctrl`-drag — rather than like
blank cells, which stay behind the `includeEmptyCells` chord. They join
`selectedEmptyCells` (not `selectedPlacementIds`, since they have no
placement id), consistent with how the rest of the codebase already treats
them for bulk actions.

## Implementation notes

- New pure helper `resolveUnrecognizedCellsInBounds` in `usePaintTool.ts`
  filters `referenceImageUnrecognized` down to unoccupied cells within a
  marquee's bounds, reusing the existing `unoccupiedCellsFromKeys` filter
  (the same one `RightPanel`/`SuggestReviewMenu` already use to drop stale
  markers whose cell has since gotten a real placement).
- The marquee handler unions the result into `nextEmptyCells` unconditionally
  — alongside, not gated by, the existing `includeEmptyCells(e)` block.
- No change to the `includeEmptyCells` chord itself or to how confirmed/
  identified placements resolve via `resolveGroupIds`.

See `docs/PRD.md` FR-60 for the shipped spec.
