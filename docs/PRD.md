# Product Requirements Document (PRD)
*Last Updated: 2026-09-25*

## Core App Overview

Stitch Ease Designer is a web app for knitting designers, targeting both
desktop (mouse + keyboard) and iPad (touch and Apple Pencil). The core of
it is a chart editor: an infinite canvas that is itself a grid of square
cells, where each cell can hold a stitch (some stitches span several cells).
Clicking any cell places a stitch from the Figma symbol library.

v1 is the working drawing interface only — no chart frames, repeat boxes,
stitch counts, or project-management side yet. A chart can record `worked`
(flat/round) and `firstRow` (RS/WS) as plain metadata for a preview to read
(see "Pattern info fields..." below), but the chart itself still renders
every row right-to-left regardless of these — RS/WS-driven row direction and
stitch numbering are still deferred. Two features are
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
claimed: `Cmd`/`Ctrl`+drag means "temporarily use Select" (see **FR-21** for
the current empty-cell pickup rule for that same drag). This
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
  dismissible → red-X cursor. Both chords held at once → `not-allowed`
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
  only fire when something's actually dismissible, else fall through) was
  correct but insufficient for a drag starting on a dismissible cell. Actual
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

**FR-21.** During a Select-tool or temporary-select (`Cmd`/`Ctrl`-held) marquee
drag, empty cells join the selection alongside any symbols the rectangle
covers **only while `Cmd`/`Ctrl` + `Shift` + `Opt/Alt` are all three held
together**, read live so toggling any of them mid-drag adds or drops the
empty cells without restarting the gesture. `Cmd`/`Ctrl`+`Opt/Alt` alone (no
`Shift`) — or plain `Opt/Alt` while already in the Select tool — is a plain
marquee with no empty-cell pickup. **Revision (2026-09-18):** this narrowed
from a single-key trigger (`Opt/Alt` alone) to this three-key chord, to make
picking up empty cells a deliberate combination rather than something an
incidental `Opt`/`Alt` tap could trigger during an otherwise-ordinary
marquee drag. See `includeEmptyCells` in `usePaintTool.ts`'s
`onPointerMove`.

#### Do not touch (Suggest)

- **DNT-2.** Suggest's own template-matching internals (confidence thresholds, exemplar
  matching) — this feature only adds review actions on top of results
  Suggest already produces.
- **DNT-3.** Plain `Shift` as the straight-line/gap-fill draw modifier. `Shift`+`Opt/Alt`
  overriding it into "destructive" only when `Opt/Alt` is *also* held is
  existing, intentional behavior.
- **DNT-4.** `Cmd`/`Ctrl` alone as the app-wide "temporarily use Select" modifier — must
  keep working everywhere except the narrow carve-out where it's hovering an
  actual confirmable suggestion.
- **DNT-5.** The `Cmd`/`Ctrl`+`Shift`+`Opt/Alt` "temporary-Select-with-empty-cells"
  marquee (FR-21) — this is the shortcut G-7 protects. Confirm/Dismiss must
  never claim any part of this chord again.
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

---

### Multicolor stitches (colorwork)

**Context.** Lets a designer chart colorwork on top of the existing texture-stitch
system. Built ground-up on `colorwork/multicolor-stitches` (branched from
`main`, which had no prior colorwork code) — [PR #194](https://github.com/tamaradidproduct/stitch-ease-designer/pull/194).

#### Data model

**FR-22.** Color is a property of a stitch, never a second kind of stitch.
`Placement.colorId` is an optional hex string. An uncolored placement carries
no `colorId` at all; a chart that never uses color encodes byte-identically
to the pre-colorwork format.

**FR-23.** Choosing a glossary/quick-slot tile arms the symbol and its color
together as a single pen — no separate "now pick a color" step.

**FR-24.** The moment a (symbol, color) combo is first used it becomes a
glossary tile automatically, deduplicated by identity — the same mechanism a
plain symbol already uses to become glossary-eligible by being placed.

**FR-32.** Knit and Purl are always seeded into both the glossary and the
quick-access row, for every chart (`DEFAULT_STITCH_IDS` in
`src/model/quickSlots.ts`). Removable and reorderable like any other entry;
the seed is only the starting state. **Chart-scoped**, not a browser-local
side channel — persists with the chart (`docStore.glossaryIds` /
`quickSymbolIds`) and travels through export/import.

#### Interaction

**FR-25.** The color chip lives on whichever tile is *currently selected* —
the actual placement the picker is open on, or, only when there's nothing to
look up yet, the armed pen itself. One identity (`currentSlotForPicker` in
`src/ui/colorwork.ts`) feeds chip visibility, the recolor effect, and tile
highlighting — every consumer reads that single value rather than
independently reading `armedSymbolId`/`activeColor`.

**FR-26.** A quick slot is symbol *and* color together (`chooseSymbol(id,
tool, preserveSelection, colorId)`), not a symbol that inherits whatever
color happens to be active. A plain pick clears the active color.

**FR-27.** Clicking a color acts on the current selection only: recolors the
placement(s) if any, recolors its quick slot, arms the result, closes the
color menu and the picker.

**FR-28.** A colored stitch renders as a cell background fill behind the
glyph, with glyph ink adapting to the fill. Ink is a fixed, tagged property
of each of the 32 swatches (`ColorSwatch.ink` in `src/model/colorPalette.ts`,
hand-authored per hue rather than computed from luminance at paint time — a
single numeric cutoff doesn't sort every hue's dark step correctly).
Applied identically at **four** render sites: the canvas renderer, the
armed-stitch cursor preview, and — the one that shipped incomplete the first
time (see Gotchas) — `SymbolGlyph`, which both the picker's and the
glossary's tiles use.

**FR-29.** Fill precedence: a symbol's own tint (e.g. "no stitch" grey)
overpaints the pen's color, never the reverse.

**FR-30.** A sixth, dynamic tile appears in the picker's quick row exactly
when the current selection is a real stitch whose combo isn't already one of
the five visible slots. Not persisted, divider-separated from the five real
slots.

**FR-31.** The picker shows a persistent context label ("Replace Purl at col
4, row 4," "Replace 3 selected stitches") whenever open on an existing
stitch or selection — not buried in the search placeholder.

**FR-33.** "Currently selected" extends to a multi-selection only when every
member already shares the same (symbol, color) combo. A mixed selection
shows no chip; recoloring it is reachable only by picking a different pen
outright.

**FR-34.** A symbol that isn't currently armed can still get a new colored
variant without painting anything, from the picker's "more stitches" drawer
or the glossary panel — each plain row (slotted or not) gets a small
add-only color chip. Picking a color there is strictly additive: arms a new
pen and gives it a quick slot, never recolors anything already on the
chart. A colored row never gets this chip.

**FR-35 (added this session).** The add-only and recolor chips share one
palette icon (reused from the reference-image panel's "canvas stitch
colors" button) rather than a bare circle+line/circle+plus pair — the
original abstract icon didn't read as "color" at a glance. The add-only
variant keeps a small "+" badge so the two still look distinct.

**FR-36 (added this session).** A colored glossary row tints only its small
glyph swatch, not the whole row. A full-row background wash was tried first
and rejected on review — it made the label hard to read, especially layered
under the existing armed/hover/drag-over highlight — see `SymbolGlyph`'s
`colorId` prop (`src/ui/SymbolGlyph.tsx`) and `.glossary__glyph .glyph__cell`
in `styles.css`.

#### Storage

**FR-37.** Mirrors how `suggested` is already stored — a sparse
list, not baked into every stitch tuple: `colorPalette?: string[]` (hex,
first-seen order) + `colors?: [col, row, colorPaletteIndex][]` for only the
colored cells. Purely additive; old charts decode unchanged. `STORED_VERSION`
bumped to 3 (versions 1–2 still read fine — no colorwork fields at all reads
as "no color, never customized").

**FR-38 — absent vs. empty (`glossaryIds`/`quickSymbolIds`).** A real
three-state distinction:
- **Undefined** (key omitted) → chart never saved since colorwork shipped →
  decodes to `DEFAULT_STITCH_IDS` (knit, purl).
- **Present, explicit array** (`[]` included) → decodes to exactly that,
  no fallback.

Unlike `suggested`/`colors`, these two fields are always written once a
chart is saved at all (`encode()` in `src/storage/serialize.ts`) — that's
what makes "never customized" distinguishable from "customized to empty."
`emptyChart()` (a chart that hasn't been saved yet) is the one place that
still omits them.

**DNT-10.** Recoloring a slot that collides with an *older* slot already
holding the same resulting pen empties that older slot rather than bailing
out — bailing looks like the color simply didn't apply. Handled in
`docStore.recolorQuickSlot`'s rename-in-place path.

**Quick-slot keys.** Composite id `symbolId::colorId` (bare `symbolId` when
uncolored), defined once in `src/model/quickSlots.ts`
(`quickSlotKey`/`parseQuickSlotId`), imported everywhere else rather than
rebuilt inline.

**DNT-9.** `parseQuickSlotId` splits on the first `::`. Don't introduce a
symbol id that contains it.

#### Rendering & counts

**DNT-12.** A plain symbol's displayed placed-count excludes colored
placements of that symbol — a colored combo is a separate inventory line
with its own count (`countConfirmedStitches` / `countConfirmedColoredStitches`
in `src/ui/chartGlossary.ts`).

**DNT-8.** Every pick is a whole pen: `place`/`chooseSymbol`'s `colorId`
parameter defaults to `null`/clears, never "leave whatever was active." A
plain glossary row checks `activeColor === null` before rendering itself as
armed, so a plain row and a colored row of the same symbol can't both show
armed at once.

#### Gotchas hit while building this (read before touching colorwork rendering)

- **G-11 — colored tiles rendered black-on-white.** The canvas renderer and
  the cursor preview got `colorId` from the start; `SymbolGlyph` (the
  component the picker's and glossary's tiles actually use) didn't, so a
  colored slot's icon still showed plain black-on-white even though the
  underlying data and the canvas were correct. This was FR-28's fourth
  render site, easy to miss because the other three all worked and made the
  feature look "done." Fixed by threading `colorId` through `SymbolGlyph`
  too, at every call site that has a color to give.
- **G-12 — overflow glossary entries had no drag handle.** A colored combo
  that only ever arrived via a duplicate/paste or a file import (never an
  explicit arm/pick) landed in the unslotted overflow section with no way to
  promote it into a numbered quick slot or reorder it. Fixed with two new
  `docStore` actions — `promoteQuickSlot` (adds a glossary-only key to the
  quick row before moving it) and `moveGlossaryIdTo` — and a matching drag
  handle on overflow rows. `moveQuickSymbolTo` now always goes through the
  promote path, so an already-slotted key still just reorders as before.
- **G-13 — glossary search dropdown clipped mid-list.** `.glossarySearch__results`
  used `position: absolute` inside `.sideModule`, which sets
  `overflow: hidden` so the card can round its own corners — a dropdown
  extending past the card's bottom edge got cut off there instead of
  floating over the rest of the sidebar. Same class of bug as the picker's
  "more stitches" drawer popover (see `ColorSwatchPopover`'s own doc
  comment) and fixed the same way: anchor via a measured rect with
  `position: fixed`, which escapes the clipping ancestor entirely instead of
  relying on CSS containing-block luck.
- **Design revision — full-row color wash was too intense.** Shipped once
  tinting the whole `.glossary__item` background; on review this made the
  label hard to read and looked especially harsh combined with the
  pre-existing armed/hover/drag-over highlight. Reverted to swatch-only
  (FR-36).

#### Do not touch (colorwork)

- **DNT-11 — load-bearing.** Recoloring the currently-selected
  stitch/pen may only rename its quick slot *in place* when nothing else on
  the chart still uses that slot's old (symbol, color) combo (scan excludes
  the placement(s) actually being recolored). Skipping this check is a real,
  previously-shipped bug: recoloring one placed stitch renamed the *whole*
  shared quick slot in place, silently orphaning every other plain instance
  on the chart. When siblings remain, mint (or reuse) a new slot instead.
  Implemented in `docStore.recolorQuickSlot`.
- **Scope.** Named/managed palettes (rename, reorder into groups, per-chart
  named palettes beyond the quick row) are explicitly deferred — the
  quick-slot row *is* the palette for this pass. Suggest stays uncolored.
- **DNT-13 — undo scope.** Glossary and quick-slot edits are **not**
  undoable — Cmd/Ctrl+Z reverts placements, not a palette change.
  Deliberate: they're chart settings, not document content, so they're
  mutated outside `docStore`'s `commit()`/undo stack. Flagged as
  revisit-if-confusing, not settled forever.
- **DNT-14.** No native `<input type="color">`, no "more colors" escape
  hatch, no pure white, no "no color" cell in the picker — a fixed
  32-swatch grid (8 hue columns × 4 lightness steps) so one click is always
  exactly one apply. A native color input was tried and removed: it fires
  continuously as the cursor moves, and applying a color used to close the
  popover, so the first shade dragged over committed and the input
  unmounted mid-drag.

#### File map

| File | Owns |
|---|---|
| `src/model/types.ts` | `Placement.colorId`, `RepeatStitch.colorId` |
| `src/model/quickSlots.ts` | `quickSlotKey`/`parseQuickSlotId` (single source of truth), `DEFAULT_STITCH_IDS`, quick-slot array helpers |
| `src/model/colorPalette.ts` | `COLOR_GRID` (32 swatches, each tagged ink), `getSwatch`/`glyphInkFor` |
| `src/model/ops.ts` | `colorId` threaded through `placeChange`/`insertChange` |
| `src/state/docStore.ts` | `colorId` threaded through `place`/`insertPlacement`; `recolorPlacements`, `recolorQuickSlot` (DNT-10/11), `promoteQuickSlot`, `moveGlossaryIdTo`; `glossaryIds`/`quickSymbolIds` state + actions (not undoable) |
| `src/state/uiStore.ts` | `activeColor`/`setActiveColor`; `chooseSymbol`'s `colorId` param |
| `src/storage/serialize.ts` | `colorPalette`/`colors` (sparse); `glossaryIds`/`quickSymbolIds` absent-vs-empty encode/decode; `STORED_VERSION` 3 |
| `src/storage/ChartStore.ts`, `keyValueChartStore.ts`, `supabaseChartStore.ts`, `exportImport.ts`, `migrateLocalCharts.ts`, `useAutosave.ts` | Thread `glossaryIds`/`quickSymbolIds` through load/save/export/import/migration |
| `src/canvas/renderer.ts` | Cell background fill for `colorId`; glyph ink lookup |
| `src/canvas/cursors.ts` | Armed-stitch cursor preview carries the pen's color |
| `src/ui/SymbolGlyph.tsx` | `colorId` prop — the fourth FR-28 render site (see Gotchas) |
| `src/ui/colorwork.ts` | `currentSlotForPicker` (FR-25 identity), `applyColorToSlot`, `addColoredVariant` |
| `src/ui/ColorChip.tsx`, `ColorSwatchPopover.tsx` | Shared chip + popover, consolidated across all three call sites from the start |
| `src/ui/StitchPicker.tsx` | `currentSlot`; quick tiles + dynamic sixth; drawer chip; FR-31 context label |
| `src/ui/RightPanel.tsx` | Quick-slot rows, glossary rows (slotted + overflow), drag/promote, search dropdown |
| `src/ui/chartGlossary.ts` | `collectColoredGlossaryEntries`, `countConfirmedStitches`/`countConfirmedColoredStitches` (DNT-13), `symbolsWithAnyPlacement` |

### Color-aware Suggest, quick slots, and glossary selection

**FR-39. Suggest preserves a confirmed swatch identity.** Reference-image
exemplars are grouped by `(symbolId, colorId)`, not symbol alone. A successful
Suggest match places the complete taught swatch, including its color.

**FR-40. Quick slots promote active swatches.** A newly placed uncolored
stitch, or a newly colored swatch, moves ahead of unplaced plain defaults in
the quick row. Existing placed plain stitches retain their relative priority.

**FR-41. Choosing from the stitch picker clears the resolved selection.** After
placing or replacing through the picker, the resulting stitch is deselected so
the next canvas click acts directly on the next target. During Suggest review,
changing a resolved stitch color must leave Suggest armed.

**FR-42. Every placed glossary swatch exposes Select all.** The `All (count)`
action selects only confirmed placements with that exact `(symbolId, colorId)`
identity. Pending suggestions remain in the review workflow. Numbered quick
slots and overflow glossary rows use the same visible action.

**FR-43. Stitch library additions.** The Figma library entries for Slip stitch
with yarn front (`sl_wyif`) and Slip stitch with yarn in back (`sl_wyib`) are
searchable, rendered, and checked in as both generated registry entries and
SVG assets.

**Deferred note — color-sensitive Suggest matching.** Suggest currently stores
color with an exemplar but compares binary glyph shapes. Same-shape swatches
in different colors therefore remain ambiguous rather than receiving a random
color assignment. Adding color features to the matcher is intentionally
deferred.

---

### Pattern info fields, reference-image export option, and export-format rectangle fill

**Context.** A preview consumer needs a handful of facts about a pattern
stated once rather than asked each time, plus two changes to what a
`.stitchchart.json` export actually contains. See
`docs/conversations/2026-09-24-pattern-info-and-export-format.md` for the
full discussion and alternatives considered.

#### Pattern info data model

**FR-44.** `PatternInfo` (`src/model/types.ts`) groups four optional,
per-chart facts: `worked: "flat" | "round"`, `firstRow: "RS" | "WS"`,
`firstStitch: Corner` (reuses the existing `"bl" | "br" | "tl" | "tr"` corner
vocabulary already used for reference-image resize handles — no new
vocabulary invented), and `colorNames: Record<hexColorId, string>` (e.g.
`{ "#d3f3d0": "MC" }`, keyed by the same hex `colorId` values already used
everywhere else). Grouped into one type — rather than threaded as four
separate parameters through `encode`/`decode`/`ChartStore.save` — purely to
keep those signatures from growing a positional argument per field;
`StoredChart` itself still stores the four as flat top-level keys, matching
every other per-chart setting (`glossaryIds`, `referenceImage`, etc).

**FR-45.** Like `glossaryIds`/`quickSymbolIds` (FR-32/DNT-13), `patternInfo`
edits are chart settings, not document content — mutated outside
`docStore`'s `commit()`, so Cmd/Ctrl+Z never touches them.

**Implementation.**
- `src/model/types.ts` — `Worked`, `WORKED_MODES`, `FirstRowSide`,
  `FIRST_ROW_SIDES`, `PatternInfo`.
- `src/storage/serialize.ts` — `StoredChart.worked`/`firstRow`/`firstStitch`/
  `colorNames`, `validateWorked`/`validateFirstRow`/`validateFirstStitch`/
  `validateColorNames` (hex-keyed, non-empty-string values), threaded through
  `encode()`/`decode()` via a single grouped `patternInfo` parameter.
  `decode()`'s `DecodedChart.patternInfo` is always a concrete (possibly
  empty) object, never absent — same "optional only for test fixtures"
  pattern as `glossaryIds`/`quickSymbolIds` on `ChartStore.LoadedChart`.
- `src/storage/ChartStore.ts`, `keyValueChartStore.ts`,
  `supabaseChartStore.ts`, `migrateLocalCharts.ts` — `patternInfo` threaded
  through `load`/`save` exactly like `glossaryIds`/`quickSymbolIds`.
- `src/state/docStore.ts` — `patternInfo` state, `setPatternInfo` (merges a
  patch), `setColorName` (adds/renames/removes one color's name; a
  blank/whitespace-only name removes the entry). Defaulted in `openChart`.
- `src/storage/useAutosave.ts` — `patternInfo` included in the autosave
  `store.save()` call.

#### Pattern info settings UI

**FR-46.** A collapsible **Pattern info** section in `RightPanel.tsx`
(same pattern as Export/Help) exposes: a Worked flat/round toggle; a First
row RS/WS toggle (hidden when Worked is "round" — RS/WS is a flat-only
concept); a 2×2 first-stitch corner-grid picker; and, only once at least one
colored stitch exists on the chart, a swatch + text-input row per color
actually in use, wired to `setColorName`.

#### Export: leave out the reference image

**FR-47.** `exportChart()` (`src/storage/exportImport.ts`) takes an
`includeReferenceImage` flag (default `true`); `false` skips inlining the
reference image into the export entirely. Surfaced as a checkbox in the
RightPanel Export section, shown only when the open chart actually has a
reference image — lets a designer share a chart file without carrying along
a (potentially copyrighted or personal) source photo.

#### Export format (v3): rectangle fill, drop pending suggestions

**FR-48.** Two changes scoped to `exportChart()` specifically — **not** the
general `encode()` used by autosave, so in-app storage stays lean and this
stays a pure export-time transform. `v` stays `3`; every other field/format
is unchanged.
- Every cell inside the bounding rectangle of the chart's *confirmed*
  (non-suggested) placements that isn't already covered by a stitch (spans
  included) is backfilled with a `"no_stitch"` palette entry, appended as
  the palette's **last** index (so no other stitch's palette index shifts).
  Only added if at least one cell actually needs it. No `colors` entry is
  ever written for a no-stitch cell.
- Unconfirmed Suggest guesses (`placement.suggested === true`) are dropped
  entirely from the export: not listed in `stitches`, not counted toward the
  rectangle, and the `suggested` key is never written. Export-only — autosave
  still persists pending suggestions as before, so an in-progress review
  survives a reload untouched.

**Implementation.** `noStitchCells()`/`fillNoStitchCells()` in
`src/storage/exportImport.ts` (the latter exported for direct unit testing
against a plain `StoredChart`, without exercising the browser-only download
side effect); `exportChart()` filters `placement.suggested` out before
calling `encode()`, then pipes its output through `fillNoStitchCells()`.

#### File map

| File | Owns |
|---|---|
| `src/model/types.ts` | `Worked`, `FirstRowSide`, `PatternInfo` |
| `src/storage/serialize.ts` | `StoredChart` pattern-info fields + validators; `encode`/`decode`'s `patternInfo` param |
| `src/storage/ChartStore.ts`, `keyValueChartStore.ts`, `supabaseChartStore.ts`, `migrateLocalCharts.ts` | Thread `patternInfo` through load/save/migration |
| `src/state/docStore.ts` | `patternInfo` state, `setPatternInfo`, `setColorName` (not undoable) |
| `src/storage/useAutosave.ts` | `patternInfo` in the autosave save call |
| `src/ui/RightPanel.tsx` | Pattern info settings section; Export section's "Include reference image" checkbox |
| `src/storage/exportImport.ts` | `includeReferenceImage`; `noStitchCells`/`fillNoStitchCells`; suggested-placement exclusion |

---

### Multiple reference images per chart

**Context.** A chart could previously hold exactly one reference image.
Designers working from more than one source photo (a chart spanning two
scanned pages, or a chart photo plus a separate color-key photo) had to pick
one. See `docs/conversations/2026-09-25-multiple-reference-images.md` for
the full discussion and alternatives considered.

**FR-49.** A chart's reference images are now `ReferenceImage[]`
(`src/model/types.ts`) rather than a single nullable `ReferenceImage`. Each
`ReferenceImage` carries a stable `id`, generated once at upload and reused
as its Storage path segment (`{uid}/{chartId}/{imageId}.<ext>`), so several
images never collide or overwrite one another.

**FR-50.** Exactly one image is ever "active" (the one the reference panel,
the interactive move/resize/calibrate tool, and the canvas overlay all
target) at a time, tracked as `activeReferenceImageId` in `uiStore`.
Selecting the active image happens **only** through a list in the
reference-image panel (thumbnail + label per image, with select/add/remove);
clicking an image on the canvas does not change the selection.

**FR-51.** Adding, removing, and patching a reference image (transform,
visibility, calibration) are all undoable, scoped by the image's `id`
(`docStore`'s `addReferenceImage`/`removeReferenceImage`/
`updateReferenceImage(id, patch)`). Undoing a removal restores the image at
its original array position, not just back into existence at the end of the
list. (Revised from the initial multi-image cut, which carried over the old
single-image behavior of add/remove being non-undoable — deleting an image
by mistake with no way back was worse than the inconsistency of add/remove
behaving differently from every other document edit.) The underlying
Storage file for a removed or replaced image is deliberately left alone
rather than deleted immediately, so a later Undo never points at a missing
file; it's only cleaned up if the chart itself is deleted.

**FR-52.** Reference images draw in array order, split into two groups by
each image's own `inFront` flag: every "behind" image, then the chart, then
every "in-front" image. Array order doubles as manual z-order within each
group — there is no separate reorder UI in v1 (new images stack on top of
their group in upload order).

**FR-53.** The export "include reference image" checkbox stays
all-or-nothing: unchecked drops every reference image from the export,
checked keeps all of them. No per-image export picker in v1.

**Implementation.**
- `src/model/types.ts` — `ReferenceImage.id`.
- `src/state/docStore.ts` — `referenceImages: ReferenceImage[]` replaces the
  singular field; `addReferenceImage`/`updateReferenceImage(id, patch)`/
  `removeReferenceImage(id)`/`beginReferenceImageEdit(id)`; undo/redo
  history entries carry `{ id, before, index? }` snapshots scoped to one
  image (`before: null` for "didn't exist yet", `index` so undoing a
  removal reinserts at its original position).
- `src/state/uiStore.ts` — `activeReferenceImageId` + `setActiveReferenceImageId`.
- `src/storage/serialize.ts` — `StoredChart.referenceImages` (array);
  `decode()` lifts a legacy singular `referenceImage` (if present) into a
  one-element array, minting an `id` for it and for any array element
  missing one — covers every chart already saved, no separate migration
  pass needed.
- `src/storage/referenceImages.ts` — `uploadReferenceImage(chartId, file,
  imageId)`'s Storage path now includes `imageId`.
- `src/storage/ChartStore.ts`, `keyValueChartStore.ts`,
  `supabaseChartStore.ts`, `migrateLocalCharts.ts`, `exportImport.ts`,
  `useAutosave.ts` — `referenceImage` threaded through as `referenceImages`
  throughout load/save/export/import/migration.
- `src/canvas/referenceImageCache.ts`, the module-local pixel cache in
  `src/input/useReferenceImageTool.ts`, and the exemplar cache in
  `src/model/templateMatch.ts` — each converted from a single resident entry
  (evicted on any ref change) to a map keyed by `ref`, so several images'
  decoded bitmaps/pixels/exemplars can stay resident at once instead of
  evicting each other.
- `src/canvas/renderer.ts`, `src/canvas/CanvasView.tsx` — `RenderState`
  takes `referenceImages`/`activeReferenceImageId`; the draw pipeline loops
  the array for both the behind and in-front passes; the interactive overlay
  (handles, calibration box, marks) renders only for the active image.
- `src/input/useReferenceImageTool.ts`, `src/input/useShortcuts.ts` — the
  drag state machine and arrow-key nudging resolve the target image via
  `activeReferenceImageId` (each `Drag` variant carries the `imageId` it
  started on, captured at pointerdown).
- `src/input/usePaintTool.ts` — Suggest matches a cell against the first
  reference image (in array order) whose bounds actually cover that cell.
- `src/ui/ReferenceImagePanel.tsx` — the image list (add/select/remove,
  thumbnails resolved via `resolveReferenceImageUrl`); "Replace" now uploads
  under a fresh id and swaps it in at the same position via remove+add,
  resetting that image's transform/calibration the same way a fresh upload
  does.
- `src/ui/ReferenceImageDock.tsx`, `src/ui/ReferenceMarkEditor.tsx` — operate
  on the active image, resolved by id.
- `src/ui/Toolbar.tsx`, `src/ui/ChartEditor.tsx`, `src/ui/RightPanel.tsx`,
  `src/ui/ChartList.tsx` — singular presence/cleanup checks (`!!referenceImage`,
  a single `removeReferenceImageFile` call) generalized to the array.

**FR-54. Stable per-image numbering.** Each `ReferenceImage` carries a
`number` (`src/model/types.ts`), assigned once at upload — one higher than
any number currently in use — and never reused or reassigned afterward.
Deleting an image does not renumber the ones that remain, and a later
upload never reclaims a number a deletion freed up. Distinct from `id` (an
opaque identity with no display meaning) purely so the "Image N" label a
designer sees stays stable across deletions, which array position alone
cannot guarantee since it shifts whenever an earlier image is removed.
Legacy charts decode with numbers minted from array position
(`src/storage/serialize.ts`).

**FR-55. Crop to calibrated stitches.** A reference image can optionally be
clipped, for display only, to the region spanned by its own **named**
calibration marks — the stitches the designer has boxed and typed a
row/stitch number for (`ReferenceImage.cropToCalibration`,
`src/model/types.ts`). Reference photos routinely carry their own grid past
where the actual pattern ends, and that grid fighting the app's own grid
outside the real chart was the original motivating complaint (a photo's
white grid border visibly overlapping the app's grid border).

Deliberately keyed off the image's *own* calibration, not off the chart's
placed-stitch bounds: an early cut computed bounds from `chartBounds()`
(every placement's col/row extent) and clipped in that coordinate space,
but a reference image's `x`/`y`/`width`/`height` and a chart's placement
`col`/`row` live in unrelated coordinate spaces that can drift arbitrarily
far apart as a chart is edited over time — the clip rectangle and the image
routinely didn't overlap at all. Calibration marks belong to the image
itself and are defined in the same image-fraction space (`u`/`v`/`w`/`h`,
0..1) as the image's own render rect, so there's no coordinate mismatch to
begin with, and an image can be calibrated (and cropped) before a single
stitch is ever placed.

Display-only and fully reversible: it never touches `x`/`y`/`width`/
`height`, so turning it off always shows the whole image again regardless
of whether the marked corners later turn out wrong (e.g. a corner never got
worked). A no-op — shows the full image — until at least one mark is named.

**Implementation.**
- `src/model/referenceCalibration.ts` — `calibratedImageBounds(marks)`
  returns the `{minU, maxU, minV, maxV}` rectangle spanning every named
  mark's box (not just its centre, so a marked stitch isn't itself clipped
  in half), reusing the same "named" filter (`stitch !== null && row !==
  null`) `scaleFromCalibrationMarks` already uses for its fit. Null when
  nothing's named yet.
- `src/canvas/renderer.ts` — `drawReferenceImage` clips via `ctx.clip()`
  using `image.x/y/width/height` plus that image's own
  `calibratedImageBounds(image.calibrationMarks)`, entirely self-contained
  per image (no `DocIndex`/`chartBounds` involved).
- `src/ui/ReferenceImagePanel.tsx` — "Crop to calibrated stitches" checkbox
  per active image.

---

## Known Platform Limitations (Desktop vs iPad)

QA testing (2026-09-17) split test coverage by device (Desktop / iPad) and
found that several Suggest-tool interactions are currently reachable only
via physical keyboard modifiers, with no touch or Apple Pencil equivalent —
`useTouchGestures.ts` explicitly ignores Pencil input (`pointerType: "pen"`),
and no `pointerType` branching exists anywhere in `usePaintTool.ts` or
`CanvasView.tsx` to offer an alternate gesture. **Confirm and Dismiss
themselves work fine on iPad** via the sticky toolDock buttons — the gaps
below are specifically the *modifier-only* behaviors layered on top of them.

Tracked as Enhancement issues in the QA Airtable base (`Stitch Ease QA`),
not yet scheduled:

- Confirm+Dismiss simultaneous-block state (no touch equivalent for holding
  both chords at once)
- Live modifier override of a sticky toolDock action (cursor/highlight and
  stroke behavior) — no touch equivalent for a *temporary* override; iPad
  only ever has the sticky state
- The `Cmd`/`Ctrl`+`Shift`+`Opt/Alt` marquee empty-cell-inclusion chord (see
  FR-21) and its two regression boundaries
- The `Cmd`/`Ctrl`+`Opt/Alt` marquee-vs-Dismiss collision boundary (G-7)
- `Cmd`/`Ctrl`+`Shift` range-select (two-click range completion)
- `Shift`+click additive empty-cell selection

Three of these (both live-override cases and the simultaneous-block case)
share one root cause: there is currently no touch-native way to *temporarily*
override a sticky selection at all, only discrete taps. Solving that once
(e.g. a long-press-to-override pattern) would likely resolve all three
rather than needing three separate gesture designs. This is a design
decision, not something to build without product input.
