# Suggest: best-of-overlapping-images matching + crop to calibration (#266)

Source: GitHub issue #266, filed as a Bucket B ("needs-decision") write-up
against QA report #248 ("stitches on the edge of the chart are consistently
recognized incorrectly").

## What was decided

When a cell is covered by more than one reference image, Suggest now tries
every covering image and keeps the highest-confidence match, instead of
always trusting whichever image comes first in array order. Each image is
additionally required to vouch for the cell via its own calibrated crop —
if the cell falls outside the region spanned by that image's named
calibration marks, that image is excluded from matching that cell at all.
New reference images have crop-to-calibration on by default going forward.

## Why

- 2026-09-26: tamaradidproduct pointed out the original #248 report was
  underspecified — the actual problem only occurs when two reference images
  overlap, not simply "near the edge" of a single chart photo.
- 2026-09-28: investigation confirmed Suggest's `matchAndPlace` picks
  exactly one covering image via `Array.find` (first in array order), so an
  overlap can read the wrong image's pixels, or a worse-calibrated image's
  pixels, for a given cell. Two directions were proposed: (1) make the
  front-most (`inFront`) image win ties, or (2) try every covering image and
  keep the best-confidence match.
- 2026-09-29: she picked direction 2 ("select the best of both crops"), and
  added that since crop-to-calibration already exists, matching should use
  it as the trust boundary too: crop to calibration marks by default, and
  ignore anything outside that crop.

## Alternatives considered

Direction 1 (front-most image wins ties) was proposed but not chosen — it's
cheaper but still only ever tries one image per cell.

## Implementation

- `src/canvas/referenceImageCrop.ts` — new `cellWithinCalibratedCrop` helper:
  true when an image doesn't opt into `cropToCalibration` or has no named
  marks yet (no restriction, same as before), otherwise checks the cell
  falls fully inside the calibrated bounds.
- `src/input/usePaintTool.ts` (`matchAndPlace`) — now filters to every
  reference image that both covers the cell and passes its calibrated-crop
  check, matches against each, and keeps the highest-confidence
  `MatchResult`. A cell excluded by every covering image is left untouched
  rather than flagged unread.
- `src/ui/ReferenceImagePanel.tsx` — `cropToCalibration: true` by default
  for newly uploaded images (existing images are unaffected unless a
  designer enables the toggle themselves).
