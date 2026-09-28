# Relax FR-40's "every instance" check for single-stitch selections

*2026-09-28*

## What was asked

QA-flagged follow-up (#252 → #267): a single freshly-placed stitch (e.g. a
plain knit) almost never shows the picker's recolor chip, because FR-40
(#211/#224) requires every other confirmed placement sharing that
`(symbolId, colorId)` combo *anywhere on the chart* to already be part of
the selection — and for a common symbol, some other unselected instance
almost always exists elsewhere. The chip effectively never appears for a
lone stitch.

## What was found

FR-40 is a deliberate, tested rule (`src/ui/colorwork.test.ts`), not an
accidental gap, so relaxing it needed a product decision rather than a
mechanical fix. Investigation showed the underlying mutation path
(`applyColorToSlot` → `docStore.recolorQuickSlot`/`recolorPlacements`) was
already safe for this case: it mints a *new*, distinct colored quick slot
and recolors only the targeted placement(s), leaving every other same-symbol
placement on the chart untouched. FR-40's original rationale — that
recoloring a subset would silently leave an unselected sibling a mismatched
outlier — doesn't apply to a single targeted placement, since there is no
partial-subset mutation happening: the one placement is fully accounted for
and nothing else is touched.

## What was decided

`tamaradidproduct` approved the issue's suggested approach on #267: "yes,
singleton selections should always show the chip; multi-selections keep the
FR-40 all-or-nothing rule."

`currentSlotForPicker` (`src/ui/colorwork.ts`) now only runs the "every
other instance must be selected" check when `target.selectionIds.length > 1`.
A single-placement target always computes and returns its slot, so the chip
renders unconditionally for a lone stitch. Multi-selections are unaffected —
the all-or-nothing rule from #211/#224 still applies exactly as before.

`src/ui/colorwork.test.ts`'s single-stitch case (previously asserting the
chip was suppressed when a sibling existed elsewhere) now asserts the chip
*is* shown; the multi-selection all-or-nothing coverage from #211/#224 is
kept as its own test.

## Alternatives considered

- **Leaving FR-40 as-is and instead surfacing a different affordance** (e.g.
  a "recolor just this one" secondary action) was not pursued — it adds UI
  surface for a case the existing single-target mutation path already
  handles safely, with no mismatched-outlier risk to warn about.
- **Dropping the "every instance" check entirely, even for multi-selections**
  was rejected — a multi-selection recolor genuinely can leave a partial,
  mismatched subset behind if a matching instance outside the selection is
  missed, which is the exact case #211/#224 exists to prevent. That risk
  doesn't shrink just because the trigger for the original chip issue
  turned out to be the singleton path.
