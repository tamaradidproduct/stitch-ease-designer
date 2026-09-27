# Cmd/Ctrl+Shift always toggles individual stitches, never completes a range

*2026-09-27*

## What was decided

Cmd/Ctrl+Shift+click now always toggles just the clicked stitch (or empty
cell) into/out of the selection, one at a time — it never completes a
bounding-box range between two clicks, no matter how many Cmd/Ctrl+Shift
clicks happen in a row. Range completion stays exclusively plain Shift's job
(no Cmd/Ctrl): a click-then-Shift-click gap fill, or a Shift-held
drag/marquee.

## Why

Two QA reports turned out to share one root cause in the same modifier-click
code:

- **#254** — no way to select two disconnected stitches without also
  selecting the gap between them.
- **#208** — a Cmd+Shift+click range-select only picked up the first and
  last stitch clicked, not the ones in between, when it landed while a
  picker was already open.

Investigation (issues #270 and #269) found that Cmd+Shift's meaning was
stateful, keyed off a `selectionAnchor` set by the first toggle: a second
Cmd+Shift click on a different cell would complete a bounding-box range
between the two instead of toggling the second cell alone. That's correct
for exactly two clicks but wrong for a third disconnected toggle — the
concrete mechanism behind #254. Separately, the code path used when a picker
was already open (#208) never consulted the anchor at all, so it always did
a plain toggle — an inconsistency with the other path's range-fill.

`tamaradidproduct` resolved the ambiguity on #270 with a concrete spec:

> With CMD, you can select a specific stitch. With Shift, you can select a
> range of stitches — either via dragging or via clicking to fill the gap.
> CMD + Shift should allow the user to select specific stitches one by one.

On #269 she pointed back to that same clarification rather than re-litigating
it separately, since both issues stem from the same gesture-semantics
question.

## The fix

Once Cmd/Ctrl+Shift always toggles and never range-completes, the two issues
resolve together: the "picker open" code path's plain toggle (#208/#269) is
now correct by definition, and the anchor-driven range-completion causing
#254/#270's degradation to a range-fill is removed entirely. `selectionAnchor`
is no longer read or written by the Cmd/Ctrl+Shift gesture at all — it
remains solely for plain Shift's own click-then-Shift-click gap fill, which
already worked correctly and is unaffected.

See `docs/PRD.md` FR-56 for the shipped spec.

## Alternatives considered

- **A distinct new chord** (e.g. reusing plain Cmd+click, or an explicit
  mode toggle) for "toggle a disconnected cell," leaving Cmd+Shift's
  range-select behavior intact for exactly two clicks. Not pursued —
  `tamaradidproduct`'s clarification assigns toggle-by-one semantics to
  Cmd+Shift directly rather than introducing a new gesture, and range
  completion is already fully covered by plain Shift (drag or gap-fill).
