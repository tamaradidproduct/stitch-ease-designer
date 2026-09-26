# Multiple reference images per chart

**Date:** 2026-09-25

## Decision

A chart can now hold more than one reference image (`ReferenceImage[]`
instead of a single nullable `ReferenceImage`), each independently
positioned, sized, calibrated, and toggled — for charts that come from more
than one source photo, e.g. a chart spanning two scanned pages, or a photo
of the chart plus a separate photo of its color key.

## Scope confirmed for v1

- **Selecting the active image** (the one being moved/resized/calibrated)
  happens only through a list in the reference-image panel. Clicking an
  image directly on the canvas does *not* change which one is active — kept
  simple rather than adding hit-testing/selection semantics on the canvas
  itself.
- **Export's "include reference image" checkbox stays all-or-nothing.** One
  checkbox still means "strip every reference image from the export," same
  as the existing single-image behavior. A per-image export picker was
  considered and deferred as unlikely to come up often enough to justify the
  extra UI.
- **No drag-to-reorder in v1.** New images stack on top of their
  behind/in-front group in upload order (array order doubles as manual
  z-order within each group). Reordering can be a fast-follow if stacking
  order turns out to matter in practice.
- **Adding and removing a whole image are undoable, same as everything
  else** — revised after initially carrying over the old single-image
  behavior (add/remove non-undoable, only patches undoable). That felt like
  a reasonable "preserve existing semantics" default while pluralizing the
  data model, but it meant deleting an image by mistake had no way back,
  which is a worse inconsistency than add/remove differing from other
  document edits. Undoing a removal restores the image at its original
  array position (an `index` rides along in the undo entry), not just back
  into existence at the end of the list. Because of this, removing or
  replacing an image no longer deletes its Storage file immediately —
  doing so would leave a later Undo pointing at a 404 — so that file is
  only cleaned up if the chart itself is deleted.

## Why this shape

- `ReferenceImage` gained a stable `id`, generated once at upload and reused
  as the Storage path segment (`{uid}/{chartId}/{imageId}.<ext>`) — a single
  source of truth rather than separate id/path bookkeeping.
- Everything that used to assume "the one reference image" (undo/redo,
  serialization, the interactive move/resize/calibrate tool, the three
  per-image caches, canvas rendering/z-order) got an `id` threaded through
  instead of being redesigned around a different model — the array is a
  minimal generalization of what was already there, not a rearchitecture.
- Legacy charts with the old singular `referenceImage` field decode straight
  into a one-element array (an id is minted for them), so no separate
  migration pass was needed for already-saved charts.

## Alternatives considered

- **A per-image export picker** instead of all-or-nothing — deferred (see
  above); the existing flag's semantics extend naturally to "drop the whole
  array."
- **Click-to-select on canvas** in addition to the panel list — deferred to
  keep v1's interaction model unambiguous (exactly one place to change
  selection) rather than having two ways to do it that could disagree.

## Follow-up decision: stable per-image numbering

Requested after the initial cut shipped: image labels ("Image N") should
never renumber. Deleting an image leaves the remaining ones' numbers alone,
and a new upload always gets a number higher than any currently in use,
never one a deletion freed up. `ReferenceImage` gained a `number` field for
this, kept distinct from `id` (which has no display meaning) specifically
because array position can't serve as a stable label — it shifts whenever
an earlier image is removed.

## Follow-up decision: crop reference image to calibrated stitches, not chart bounds

Triggered by a screenshot showing a reference photo's own grid border
visibly overlapping the app's grid border — moiré-like visual noise once a
chart's edges are worked but the source photo's grid runs past them.
Requested as reversible, since the "known bounds" could be wrong before
every corner is worked.

The first implementation clipped an image's drawing to `chartBounds()` — the
smallest rectangle covering every placed stitch on the chart. This was
wrong: a reference image's own `x`/`y`/`width`/`height` and a chart's
placement `col`/`row` live in unrelated coordinate spaces, and in practice
they could drift far enough apart that the clip rectangle and the image
didn't overlap at all, making the crop silently do nothing (or hide the
image entirely) depending on how far apart they'd drifted — indistinguishable
from the feature simply not working.

Corrected per direct feedback: *"we're cropping the image, not the chart.
Derive your bounds from the calibration marks."* Bounds are now computed
from the image's own **named** calibration marks (the stitches boxed and
typed with a row/stitch number) — the same u/v/w/h fractional space the
image's own render rect already uses, so there's no coordinate space to
reconcile. This also means an image can be calibrated and cropped before a
single stitch is placed on the chart at all, which `chartBounds()` could
never support (it returns null for an empty chart). The field was renamed
`cropToChart` → `cropToCalibration` to match.
