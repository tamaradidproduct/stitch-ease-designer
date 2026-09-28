# Distinct hover signifiers for quick-slot drops: empty vs. occupied

*2026-09-28*

## What was decided

Dragging a quick-slot stitch over another quick slot now shows one of two
distinct hover treatments depending on what it's being dropped onto:

- **Dropping onto an empty slot** (fills in place) — highlight the entire
  slot, using the existing hover/drag-over treatment.
- **Dropping onto an occupied slot** (pushes the existing stitches along) —
  show a highlighted line, in that same hover color, between two stitch
  slots at the point the new stitch will be inserted, instead of
  highlighting the whole occupied slot.

`tamaradidproduct` approved this concrete pairing directly on #271:

> If there's an empty slot available, when a user hovers over that slot,
> highlight the entire slot. Otherwise, show a highlighted line in the same
> hover color between two stitch slots to indicate the new stitch placement.

## Why

Issue #271 was split out from #251 (a QA report) after #259 fixed the
underlying logic bug: dragging an overflow stitch onto an already-empty
quick slot used to route through a first-vacant-slot placement followed by
a chain of adjacent swaps, dragging every occupied slot between the two
positions along with it even though the target was already empty (see
`docs/PRD.md`'s Gotcha G-12 and the #259/#279 fix). Once that landed, empty
and occupied drops actually behave differently — fill-in-place vs.
push-down — but the UI still used one identical `[data-drag-over="true"]`
highlight for both, giving no visual hint of which was about to happen.
That ambiguity is what #251's QA report and #271 flagged.

Picking the two concrete treatments was new UI design work, not implied
unambiguously by any existing pattern, so #271 was filed as a
decision-needed ("Bucket B") issue rather than implemented outright.
`tamaradidproduct`'s comment above is the one approval needed to unblock it.

## The fix

- `quickSlotInsertEdge(draggedIndex, targetSlot)` (new, in
  `src/model/quickSlots.ts`) computes which edge of a hovered *occupied*
  slot the insertion line belongs on, derived from `moveQuickSlotTo`'s
  actual shift semantics: the dragged slot lands exactly at `targetSlot`,
  and everything between the two indices shifts by one, so the dragged item
  ends up on the far side of the target from wherever the drag started —
  "after" the target when dragging a lower index onto a higher one, "before"
  when dragging a higher index onto a lower one. A not-yet-slotted dragged
  key (an overflow glossary entry being promoted) always arrives from
  beyond the last slot, so it always resolves to "before."
- `RightPanel.tsx`'s occupied-quick-slot render branch now sets
  `data-insert-edge="before" | "after"` (computed via the helper above)
  instead of `data-drag-over`, so it picks up the new insertion-line CSS
  instead of the full-slot highlight. The empty-slot branch is untouched —
  it already gets the full-slot highlight via `data-drag-over`, matching
  the approved spec as-is.
- `styles.css` adds `.glossary__item[data-insert-edge]::after`, a thin line
  positioned in the row gap above or below the slot, colored with the same
  `--accent-soft-border` token the existing hover/drag-over highlight
  already uses.

See `docs/PRD.md` FR-59 for the shipped spec, next to FR-36 (the colorwork
session's other glossary-row hover/highlight decision).

## Alternatives considered

None recorded beyond the pairing #271 suggested and `tamaradidproduct`
approved outright — an icon, a border-style change, and other insertion-
indicator shapes were named as open options in the issue, but the approval
comment settled on the full-highlight/insertion-line pairing directly, so
no further design exploration was needed before implementing.
