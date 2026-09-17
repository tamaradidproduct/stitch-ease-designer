# Product Requirements Document (PRD)
*Last Updated: 2026-09-17*

## Core App Overview

Stitch Ease Designer is a desktop web app for knitting designers. The core of
it is a chart editor: an infinite canvas that is itself a grid of square
cells, where each cell can hold a stitch (some stitches span several cells).
Clicking any cell places a stitch from the Figma symbol library.

v1 is the working drawing interface only — no chart frames, RS/WS handling,
repeat boxes, stitch counts, or project-management side yet. Two features are
gated to an `admin` role while still experimental: the reference-image tracer
and **Suggest**, which runs template matching against a reference image and
places guesses for the designer to confirm or dismiss. Everyone else
(`designer`) gets the full drawing interface with unlimited charts, just
without those two tools. Backend is Supabase (Postgres + auth + storage); the
app is statically hosted and client-only (HashRouter, no server-rendered
routes).

## Feature Requirements & Engineering Specs
<!-- Claude will append automated requirement updates below this line -->

### Chart deletion confirmation

**FR-1.** Deleting a chart from the chart list must show an in-app
confirmation dialog (chart name + "can't be undone" warning, Cancel/Delete)
before the delete happens. The dialog must not depend on the browser's native
`confirm()`.

**Why not just `window.confirm()`.** Some environments this app can run in —
an iPad home-screen/PWA shortcut, an embedded webview — silently suppress
native `confirm()`/`alert()` dialogs. In that case the Delete button visibly
does nothing: no dialog, no error, nothing removed. Confirmed via manual
testing that this exact silent failure is reproducible.

**Implementation.**
- `src/ui/ConfirmDialog.tsx` — a small reusable modal (message, Cancel button,
  a danger-styled confirm button, Escape-to-cancel, click-outside-to-cancel).
  Not Suggest-specific; reusable anywhere a destructive confirmation is
  needed.
- `src/ui/ChartList.tsx` — replaced the `confirm()` call in the Delete
  handler with this dialog, gated on a `deleting: DocMeta | null` bit of
  local state.

**DNT-1.** The dialog's focus handling (confirm button auto-focused on
open) was tightened once already ("Keep confirm dialog focus stable") —
preserve that fix if this component is touched again.

---

### Reference image panel: scale controls

**FR-2.** The reference-image side panel's "Save changes" action lives
in the bottom canvas dock (`ReferenceImageDock`), next to "Set scale," not in
the side panel header.

**FR-3.** The panel no longer exposes manual Width/Height
percentage steppers — sizing an image is done entirely through "Set scale"
(boxing a real stitch and applying the derived scale).

**Rationale.** The two dock actions (adjusting scale, and finishing the
edit) belong together at the point where the designer is looking at the
image itself; the width/height steppers were a redundant, less accurate way
to do what "Set scale" already does properly, and removing them simplifies
the side panel.

**Implementation.**
- `src/ui/ReferenceImageDock.tsx` — added the "Save changes" button next to
  "Set scale."
- `src/ui/ReferenceImagePanel.tsx` — header button now only ever reads "Edit
  reference" (shown while collapsed); removed `applyScale`, the
  width/height stepper JSX, and their now-dead CSS.

---

### Suggest tool: Confirm / Dismiss review actions

**Context.** Suggest already ran template matching and placed guesses
(`placement.suggested === true`) for review. Reviewing a guess previously
required opening the full stitch picker. This feature adds two in-place
review actions reachable without leaving the canvas: **Confirm** (accept the
guess as-is) and **Dismiss** (clear it).

#### Modifier bindings (final, shipped scheme)

| Action | Live trigger | Sticky (toolDock click) | Eligibility |
|---|---|---|---|
| Confirm | `Cmd`/`Ctrl` | "Confirm" button | Only a placement with `.suggested === true`. No-op elsewhere. |
| Dismiss | `Shift`+`Opt/Alt` | "Dismiss" button | Only a `.suggested` placement or an unrecognized-marker cell (a cell Suggest scanned but couldn't read). Never a hand-drawn or already-confirmed stitch. |
| Suggest (default) | *(no modifier)* | "Suggest" button (center, purple) | Runs template matching on click/drag — unchanged from before this feature. |
| *(blocked)* | `Cmd`/`Ctrl` **+** `Shift`+`Opt/Alt` together | — | Hard no-op: `not-allowed` cursor, no toolDock button highlighted, no stroke effect. See FR-4. |

**FR-5.** **MUST NOT** use `Cmd`/`Ctrl`+`Opt/Alt` for Dismiss. That chord is already
claimed: `Cmd`/`Ctrl`+drag means "temporarily use Select," and `Opt/Alt` held
during that same drag means "also include empty cells in the marquee." This
was tried and reverted — see Gotcha G-7 below.

**FR-4 (revised).** A *literally held* modifier always wins over the sticky
default, live — e.g. holding `Cmd` while sticky Dismiss is active must act,
and visually highlight, as Confirm for as long as it's held, reverting on
release. **If both chords are held at once, the result is `"blocked"`, not a
winner** — this shipped once as "Dismiss wins," then was revised after QA:
silently picking a winner between two conflicting, deliberately-held
gestures is worse than refusing both. Blocked state: `not-allowed` cursor,
no toolDock button highlighted, stroke is a no-op.

#### State model

- `suggestAction: "suggest" | "confirm" | "dismiss"` in the UI store
  (`src/state/uiStore.ts`), default `"suggest"` — the sticky default action
  Suggest performs when no modifier is held.
- **FR-6.** **MUST** reset to `"suggest"` whenever Suggest is disarmed or a different
  symbol/tool is armed. Reset paths: `setArmedSymbolId`, `chooseSymbol`,
  `setTool`'s Suggest-disarm branch, and `resetForChart`. Stale sticky state
  surviving a re-arm is easy to miss — check all of these again if the
  arming/disarming logic changes.

#### Bottom toolDock

- **FR-7.** While Suggest is armed, the toolDock replaces Select/Draw/Insert with
  Confirm/Suggest/Dismiss (Suggest keeps the center slot); reverts to normal
  immediately on disarm.
- **FR-8.** **All three** buttons' active/"on" state uses Suggest's purple accent
  (`#9333ea`) — not the toolDock's default blue. (This shipped once as "only
  Suggest is purple," then was corrected: Confirm and Dismiss must match when
  active, so the whole panel reads as one mode.) The app has no dark mode
  yet (no `prefers-color-scheme` handling anywhere in `styles.css`), so
  there's no dark variant of this color to document.
- **FR-9.** Clicking Confirm/Dismiss toggles the sticky default (click again to return
  to plain Suggest). Clicking the center Suggest button always resets to
  plain Suggest.
- **FR-10.** The Confirm/Suggest/Dismiss row is deliberately **not** gated on
  `!selectHeld` the way the ordinary Select/Draw/Insert row is — holding
  `Cmd`/`Ctrl` to confirm a suggestion is the whole point of this row;
  falling back to a plain "Select" read the way the normal row does would
  hide the Confirm highlight entirely.

#### Cursor

- **FR-11.** Suggest armed + hovering empty/ineligible space → a distinct purple "magic
  wand" cursor (`SUGGEST_CURSOR` in `src/canvas/cursors.ts`), not the plain
  add-cursor or an armed-stitch glyph preview.
- **FR-12.** Effective action is Confirm and the hovered cell is actually confirmable →
  green-check cursor. Effective action is Dismiss and the cell is actually
  dismissable → red-X cursor. Both chords held at once → `not-allowed`
  (FR-4). **MUST NOT** show the confirm/dismiss cursors over an ineligible
  cell — the eligibility check here **is** `isDismissable` (below), the same
  function the paint logic calls, not a separate copy.

#### Paint/erase behavior

- **FR-13.** Confirm/Dismiss **MUST NOT** ever start a fresh Suggest match. Landing on a
  cell with nothing pending is a no-op for both, regardless of whether the
  modifier is held live or the sticky default is active.
- **FR-14. Confirm eligibility:** `.suggested === true`. Accepts it as its own
  guess. If a real stitch is separately armed and lands on a suggestion, that
  stitch is applied and confirmed outright — no modifier needed for that
  override, and it wins over the Dismiss/Confirm cursor and stroke logic
  below it (pre-existing behavior, unaffected by this feature).
- **FR-15. Dismiss eligibility:** `.suggested === true`, or an unrecognized-marker
  cell. **MUST NOT** erase a hand-drawn or already-confirmed placement, even
  mid-drag when the drag also crosses one — skip it silently, the same way
  Draw's Overwrite Safety Block skips already-filled cells. Dismiss wins over
  the no-modifier armed-stitch override above it *only when Dismiss is held
  live* — a deliberately held destructive chord is never silently absorbed
  by whatever's armed.

#### Shared helpers (implemented — see Consolidation)

- **FR-16.** `resolveSuggestAction(live: { confirmHeld, dismissHeld }, sticky): SuggestAction | "blocked"`
  in `src/input/usePaintTool.ts` — the one place the live-wins-over-sticky
  precedence (including the FR-4 blocked case) is computed. Called by the
  paint logic, the toolDock highlight, and the canvas cursor.
- **FR-17.** `isDismissable(target: { suggested?: boolean } | undefined, unrecognized: boolean): boolean`
  in `src/input/usePaintTool.ts` — the one place Dismiss eligibility is
  computed. Called by the same three consumers.

#### Related side effects

- **FR-18.** Glossary per-symbol stitch counts **MUST** exclude still-`.suggested`
  placements. Confirming a suggestion must visibly increment its symbol's
  count by one. Implemented as `countConfirmedStitches(placements)` in
  `src/ui/chartGlossary.ts`.
- **FR-19.** A separate "has any placement at all" check (confirmed *or* still
  suggested) **MUST** gate whether a symbol is safe to remove from the
  glossary — reusing the confirmed-only count for that decision lets a
  symbol with only a pending suggestion look removable when it isn't.
  Implemented as `symbolsWithAnyPlacement(placements)` in
  `src/ui/chartGlossary.ts`.

#### Gotchas hit while building this (read before touching modifier logic)

Several of these were the same root cause wearing different clothes: **the
same precedence rule implemented separately in more than one place, kept in
sync by hand.** This is why the shared helpers above exist now.

- **G-1 — Dismiss erased confirmed/drawn stitches, not just suggestions.**
  The erase function had no `.suggested` check. Fixed by gating the erase
  implementation, and the mode-decision function's erase branch, on
  `isDismissable`.
- **G-2 — Holding the live modifier for the *other* action didn't switch
  behavior.** The `toolDock` highlight correctly flipped to "Confirm," but the
  stroke itself kept dismissing — the modifier-merging helper forced the
  sticky action's modifiers onto every event regardless of what was
  physically held. **This exact bug recurred a second time in the cursor
  logic** after being fixed in the paint logic — the reason
  `resolveSuggestAction` was extracted as one shared function instead of
  fixing each copy again.
- **G-3 — Sticky Confirm ran a fresh Suggest match on untouched cells.** The
  mode-decision function's fallback returned "run a Suggest match" for any
  non-suggested cell, even under Confirm intent. Fixed by returning a no-op
  there instead, scoped specifically to Suggest (a real armed stitch must
  keep drawing normally regardless of `Cmd`).
- **G-4 — Cmd/Ctrl+Shift range-select only picked up the two endpoints.**
  Not Suggest-specific, but broke in the same input-handling code. The
  range-select anchor was cleared on the second click unless *both*
  `Cmd`/`Ctrl` and `Shift` were held — but once already mid-gesture, only
  `Shift` drives that logic. Fixed by keying anchor-preservation on `Shift`
  alone.
- **G-5 — A real click could get misrouted into "drag" handling.** A
  trackpad tap can nudge the pointer across a grid-cell boundary and back
  without the user intending a drag; once an internal "did this move" flag
  latched true, it stayed true for the rest of the gesture. Symptom in two
  places: G-4's range-select, and plain empty-cell clicks selecting nothing
  (a marquee drag without `Opt/Alt` ignores empty cells entirely). Fixed by
  judging "was this a drag" by raw pixel distance from pointerdown to
  pointerup (~5px threshold), not grid-cell crossing — a cell can be only a
  few pixels wide at a tight zoom.
- **G-6 — Shift+click on an empty cell wasn't additive.** Shift-clicking an
  *existing* placement already toggled it in/out of the selection from any
  tool; the equivalent for an *empty* cell didn't exist. Fixed by adding the
  missing additive-toggle branch, scoped to when nothing is armed (matching
  the existing "Shift is ignored while something's armed, to keep gap-fill
  dragging working" rule).
- **G-7 — Cmd/Ctrl+Opt/Alt+drag's "select empty cells" shortcut broke.** The
  headline gotcha. Pre-existing shortcut: `Cmd`/`Ctrl`+drag temporarily
  engages Select; `Opt/Alt` held during that drag also picks up empty cells in
  the marquee. Setting Dismiss's trigger to `Cmd`/`Ctrl`+`Opt/Alt` unconditionally
  claimed that chord first. First attempted fix (scope the erase branch to
  only fire when something's actually dismissable, else fall through) was
  correct but insufficient for a drag starting on a dismissable cell. Actual
  fix: don't use `Cmd`/`Ctrl`+`Opt/Alt` for Dismiss at all — asymmetric pair,
  Confirm = `Cmd`/`Ctrl`, Dismiss = `Shift`+`Opt/Alt`, zero overlap with the
  temporary-Select system (which only ever keys off `Cmd`/`Ctrl`).
- **G-8 — Confirming a suggestion didn't visibly change anything.** Glossary
  stitch counts included still-suggested placements from the moment Suggest
  guessed them. Fixed by excluding `.suggested` placements from the
  displayed count (`countConfirmedStitches`).
- **G-9 — Fixing G-8 made "remove from glossary" unsafe.** Once the count
  excluded pending suggestions, a symbol with *only* a pending suggestion
  showed a count of zero — the same signal the UI used to decide a symbol
  was safe to remove. Fixed with a second, separate "any placement at all"
  check (`symbolsWithAnyPlacement`), independent of the display count.
- **G-10 — Holding both review chords at once silently picked a winner.**
  Shipped first as "Dismiss wins" (consistent with Dismiss's precedence over
  the no-modifier armed-stitch override). QA flagged that a user holding
  both `Cmd` and `Shift`+`Opt/Alt` at once has contradictory intent, and picking
  one silently is worse than telling them nothing will happen. Fixed by
  giving `resolveSuggestAction` a `"blocked"` result, checked first, before
  Dismiss's own precedence — see FR-4 (revised).

**Testing note, not a code issue.** `Cmd`/`Ctrl`+`Opt/Alt`+drag cannot be
reliably driven through some browser-automation/accessibility layers — it
can get intercepted as an OS-level pinch-zoom gesture before it reaches the
page. Verify that specific combo by hand if an automated check for it won't
hold still.

#### Consolidation (implemented)

The same precedence rule was implemented three times independently (paint
logic, toolDock highlight, cursor) and had to be fixed three times for the
same bug (G-2). Resolved by extracting shared functions rather than fixing
each copy again:

- `resolveSuggestAction` (live-vs-sticky precedence, including the FR-4
  blocked case) — one implementation, three call sites.
- `isDismissable` (Dismiss eligibility) — one implementation, three call
  sites.
- `countConfirmedStitches` / `symbolsWithAnyPlacement` — kept as two
  separately named functions from the start (not one value reused for two
  purposes), which is what let G-9 slip through unnoticed the first time
  with the un-consolidated version.

**FR-20.** If a fourth consumer of any of these rules is ever added, it **MUST** call
the shared helper rather than re-deriving the rule inline — that's the
entire reason G-2 doesn't get a fourth occurrence.

#### Do not touch

- **DNT-2.** Suggest's own template-matching internals (confidence thresholds, exemplar
  matching) — this feature only adds review actions on top of results
  Suggest already produces.
- **DNT-3.** Plain `Shift` as the straight-line/gap-fill draw modifier. `Shift`+`Opt/Alt`
  overriding it into "destructive" only when `Opt/Alt` is *also* held is
  existing, intentional behavior.
- **DNT-4.** `Cmd`/`Ctrl` alone as the app-wide "temporarily use Select" modifier — must
  keep working everywhere except the narrow carve-out where it's hovering an
  actual confirmable suggestion.
- **DNT-5.** `Cmd`/`Ctrl`+`Opt/Alt`+drag's "temporary-Select-with-empty-cells" marquee, and
  plain `Opt/Alt`+drag while already in the Select tool doing the same thing —
  this is the shortcut G-7 protects. Confirm/Dismiss must never claim this
  chord again.
- **DNT-6.** Draw's Overwrite Safety Block (never overwrites an existing placement) —
  unrelated pre-existing rule that Dismiss's "skip what it can't act on"
  behavior mirrors, not replaces.
- **DNT-7.** The real-armed-stitch-overrides-a-suggestion path — already needed no
  modifier before this feature existed, and must not gain one; it still
  wins over Confirm's own cursor/highlight, and loses only to a *live*
  Dismiss hold (FR-4).

#### File map

| File | Owns |
|---|---|
| `src/state/uiStore.ts` | `suggestAction` field, type, setter, reset paths |
| `src/input/usePaintTool.ts` | Mode-decision function (`modeFor`), `resolveSuggestAction`, `isDismissable`, erase/confirm implementations, click/drag pixel threshold |
| `src/ui/Toolbar.tsx` | Bottom toolDock layout swap and button highlight logic (via `resolveSuggestAction`) |
| `src/canvas/CanvasView.tsx` | Cursor precedence selector (via `resolveSuggestAction`/`isDismissable`) |
| `src/canvas/cursors.ts` | Cursor asset definitions (wand / check / X) |
| `src/styles.css` | Purple on-state styling for the toolDock's Suggest/Confirm/Dismiss buttons |
| `src/ui/chartGlossary.ts` | `countConfirmedStitches`, `symbolsWithAnyPlacement` (pure, tested) |
| `src/ui/RightPanel.tsx` | Consumes the above two for the glossary's displayed counts and remove-eligibility |
