# Pattern info fields, reference-image export option, and export-format rectangle fill

*2026-09-24*

## What was decided

**1. New per-chart pattern attributes.** Added `worked` ("flat" | "round"),
`firstRow` ("RS" | "WS"), `firstStitch` (which grid corner the first stitch
sits at), and `colorNames` (a hex-color-to-designer-label map, e.g.
`{ "#d3f3d0": "MC" }`) so a preview can read these instead of asking. Grouped
into one `PatternInfo` type rather than threaded as four separate parameters,
purely to keep `encode()`/`decode()`/`ChartStore.save()` from growing a
positional argument per field — `StoredChart` itself still stores them as
flat top-level keys, matching every other per-chart setting.

`firstStitch` reuses the existing `Corner` type (`"bl" | "br" | "tl" |
"tr"`, already used for reference-image resize handles) rather than
inventing new vocabulary.

**2. Scoped in two passes, not one.** The data model, storage round-trip
(encode/decode/validation), and export/import plumbing landed first, with no
editing UI — deliberately, to avoid a half-wired settings panel touching
`docStore`'s undo/redo machinery before the shape of the data was settled.
The actual **Pattern info** settings panel (Worked/First row toggles, a
first-stitch corner picker, per-color name inputs) was built as a second,
explicit follow-up once that foundation was in place.

**3. `worked`/`firstRow`/`firstStitch`/`colorNames` edits are not undoable.**
Same rationale as `glossaryIds`/`quickSymbolIds` (FR-32/DNT-13 above): these
are chart settings, not document content, so Cmd/Ctrl+Z reverts placements
only.

**4. Export option: leave out the reference image.** `exportChart()` gained
an `includeReferenceImage` flag (default `true`), surfaced as a checkbox in
the RightPanel Export section, shown only when the chart actually has a
reference image. Lets a designer share a `.stitchchart.json` without
carrying along a (potentially copyrighted/personal) source photo.

**5. Export-format (v3) change: fill the rectangle, drop pending
suggestions.** Two changes scoped to `exportChart()` specifically, not the
general `encode()` used by autosave:
- Every cell inside the bounding rectangle of the *confirmed* (non-suggested)
  placements that isn't already covered by a stitch (spans included) is
  backfilled with a `"no_stitch"` palette entry, appended as the palette's
  **last** index so no other stitch's index shifts. Only added if at least
  one cell actually needs it.
- Unconfirmed Suggest guesses (`placement.suggested === true`) are dropped
  entirely from the export — not listed in `stitches`, not counted toward
  the rectangle, and the `suggested` key is never written. This is
  export-only: autosave still persists pending suggestions as before, so
  reloading an in-progress review isn't affected.
- `v` stays `3`; every other field and format is unchanged.

## Why

The preview/export consumer reads a chart as a strict rectangle where every
cell must be listed — no implicit "empty means nothing." Filling gaps at
export time (rather than baking `no_stitch` into every autosave) keeps the
in-app storage format lean and keeps this a pure export-time transform.
Dropping unconfirmed suggestions reflects that only a designer's finished,
confirmed decisions should ever leave the app as a "real" stitch.

## Alternatives considered

- **Splitting `firstStitch` into flat-only vs. round-only concepts** (e.g.
  deriving direction from `firstRow` alone for flat charts, only asking for
  a corner on round charts) was considered, but a single `firstStitch:
  Corner` field covering both was chosen for simplicity — it's the same
  question either way ("where does the first stitch sit"), and `firstRow`
  answers the orthogonal RS/WS question only where it's meaningful (flat).
- **Building the settings UI and the data model in one pass** was considered
  and rejected — the editing UI's shape (toggle buttons vs. a form,
  where color names attach) wasn't settled yet, and `docStore.ts` is large
  enough (864 lines, owns undo/redo) that wiring it before the schema was
  final risked a half-finished, hard-to-review change.

## Related PRs

- `worked`/`firstRow`/`firstStitch`/`colorNames` data model, storage,
  export/import round-trip, and the Pattern info settings UI.
- The `.stitchchart.json` v3 export-format rectangle fill and
  suggestion-exclusion.
