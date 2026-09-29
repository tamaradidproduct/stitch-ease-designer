# Distinguish a click-to-review from a drag-to-paint on a pending suggestion

*2026-09-25*

## What was decided

While Suggest is armed, starting a pointer gesture on one of its own
still-pending guesses (`placement.suggested === true`) now branches on
whether the gesture turns into a real drag:

- **No movement (a click):** opens the suggestion for review, same as
  before — Confirm/Dismiss via the toolDock or its modifiers.
- **Real movement (a drag):** runs a normal Suggest paint stroke starting
  from the cell the gesture began on, through every cell the drag actually
  crosses. The origin cell is a no-op (Suggest already never overwrites an
  existing placement, pending or confirmed), so the original suggestion is
  left exactly where it was instead of being relocated.

Implemented as a new `isSuggestReviewCandidate` predicate plus a deferred
pointer state in `usePaintTool.ts`'s `onPointerDown`/`onPointerMove`/
`endStroke`, rather than the previous behavior of treating pointerdown on
any single existing placement (suggestions included) as a provisional move.
Every other gesture this code path handles — a real stitch armed overriding
a suggestion (FR-11), Shift's additive selection toggle, a drag starting on
a confirmed or hand-drawn stitch — is untouched.

## Why

QA (#214) reported Suggest, once armed, occasionally "dismissing" the first
suggested stitch a drag crossed. Reproducing it on main showed the actual
behavior was a *move*, not a dismissal: dragging a pending Purl 100px moved
the same placement (keeping its id, `suggested: true`, and confidence) to
the new cell instead. The root cause was that the generic "pointerdown on an
existing placement starts a provisional move" branch in `usePaintTool.ts`
didn't distinguish a plain confirmed stitch from a still-pending Suggest
guess — so a Suggest drag that happened to start exactly on one of its own
prior guesses got captured as a selection drag instead of continuing as a
paint stroke.

`tamaradidproduct` confirmed the suggested direction on #225: keep a click
available for review, but treat a real drag starting on a pending suggestion
as a Suggest brush stroke that preserves the suggestion and continues
scanning eligible cells along the path.

## Alternatives considered

- **Excluding pending suggestions from the move-selection path entirely**
  (always treating a click or drag there as painting, never selecting) was
  rejected — it would remove the ability to click a suggestion open for
  review, which #225's own suggested approach explicitly wanted kept.
- **Deciding click-vs-drag by pixel distance** (matching Gotcha G-5's fix
  elsewhere in this file) was considered, but this path already only reaches
  a real Suggest stroke once the pointer has crossed into a different grid
  cell — the same granularity the rest of Suggest's paint stroke operates
  at — so a separate pixel-distance threshold wasn't needed here.
