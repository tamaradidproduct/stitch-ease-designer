# Nightly Audit — 2026-09-16

Codebase-wide pass for simplification, consolidation, and UI/UX consistency.
Verified against current source (not just the research agents' claims) before
touching anything; `tsc --noEmit`, `npm run lint`, `npm test` (312 tests), and
`npm run build` all pass after the fixes below.

## Fixed autonomously

**CSS**
- Removed 8 fully-unused classes from `src/styles.css`: `.toolbar__btn` (+
  its 3 state rules), `.toolbar__spacer`, `.toolbar__selection`,
  `.picker__header`, `.picker__clear` (+ its hover rule), `.sideModule__empty`,
  `.refpanel__setScale`, `.refpanel__markActions`.
- Removed the entire `.selectionActions*` block (~65 lines) — `SelectionActions.tsx`
  is a side-effect-only component that always `return null`s, so this markup
  never rendered.

**Accessibility**
- `StatusBar.tsx`: added missing `type="button"` (the only button in the
  codebase without it).
- `ReferenceImagePanel.tsx` / `ReferenceMarkEditor.tsx`: added `aria-label` to
  the icon-only `&times;` close buttons, matching the pattern used everywhere
  else in the app.

**Dead code**
- Deleted `DocSnapshot` type (`model/types.ts`) — zero usages anywhere.
- Removed `canScrollPan()` in `usePanZoom.ts` — a wrapper that always
  returned `true`.
- Folded `math.ts`'s one function (`ceilTo`) into `grid.ts`, its only caller,
  and deleted the file — a one-line file whose name invited confusion with
  `camera.ts`.
- Dropped unnecessary `export` from `bucketFor`, `gridSteps`,
  `worldBoxToPixels`, `pixelBoxToWorld`, `markFromBox` — each used only
  within its own file.

**Consolidation**
- `docStore.ts`: extracted `resolvePlacements(index, ids)`, replacing 9
  identical `ids.map(...).filter(...)` blocks, and `remapGroupId(map, id)`,
  replacing 3 duplicated "look up or mint a groupId" blocks.
- `uiStore.ts`: extracted `setIfChanged(get, set, key, value)`, replacing 6
  near-identical no-op-guarded setters (`setSpaceHeld`, `setPanEnabled`,
  `setSelectHeld`, `setShiftHeld`, `setAltHeld`, `setKeyboardSelectionActive`).
- `storage/serialize.ts`: extracted `checkAndMarkOccupied(...)`, replacing
  the duplicated repeat-footprint and stitch-overlap checks in `validate()`
  and `decode()` (also fixed the latter to use `cellKey()` instead of a
  hand-rolled `${col},${row}` string, which was already the same format).
- `renderer.ts` / `CanvasView.tsx`: extracted shared `INSERT_ANIMATION_MS`
  constant, replacing the duplicated hardcoded `220`.
- `usePaintTool.ts`: now imports `DEFAULT_CROP_SIZE` from
  `referenceImageCrop.ts` instead of repeating the literal `32`.

## Needs your call

### Design system / CSS tokens
- Only 6 CSS variables exist in `:root`, against **116+ hardcoded hex
  literals** throughout `styles.css` — `#dc2626` "danger red" alone appears
  **16 times**, `#e0f2fe` "selected blue" ~15 times, `#bae6fd` ~10 times.
  `border-radius` has 9 distinct hardcoded values (4–12px, plus 999px) with
  no scale behind them.
  Formalizing a token set (`--danger`, `--accent-soft`, a radius scale) would
  remove the drift risk, but some of these hex values may be intentionally
  distinct shades — worth a deliberate pass, not a mechanical find/replace.

### Dialog/overlay consistency
- `ConfirmDialog.tsx` is the only component with real modal semantics.
  `SuggestReviewMenu.tsx` (`role="dialog"`, no `aria-modal`) and
  `StitchPicker.tsx` (no role at all) are both floating, outside-click-dismiss
  overlays without that. Worth deciding whether they should share one
  popover/overlay primitive and a consistent ARIA convention.
- `PanButton.tsx`, `Toolbar.tsx`, and the glossary arm buttons in
  `RightPanel.tsx` all use the `tapActivate` helper to dodge an iOS
  double-fire bug on toggles — but the trace-colors popover toggle in
  `RightPanel.tsx` (`setTraceMenuOpen`) uses plain `onClick`. Confirm on iOS
  whether that's a latent bug or an intentional exception before touching it.

### Shared icon extraction (deferred, not done)
- The checkmark path (`m4 10 3.5 3.5L16 5`) and two X/close paths are
  copy-pasted across `Toolbar.tsx`, `RightPanel.tsx`, `SuggestReviewMenu.tsx`,
  and `StitchPicker.tsx`. Extracting `CheckIcon`/`CrossIcon`/`CloseIcon`
  (matching `SymbolGlyph.tsx`'s pattern) is purely mechanical and low-risk —
  but `Toolbar.tsx` and `RightPanel.tsx` currently carry a large uncommitted,
  staged diff from in-progress work (delete-confirmation UI, reference-scale
  controls), so I left this alone rather than layer another edit onto files
  mid-change. Worth doing once that work lands.

### Reference image dropped on account migration (looks like a real bug)
- `migrateLocalCharts.ts` destructures only `{ placements, repeats }` from
  the source chart and never carries `referenceImage` over to the target
  store — unlike `exportImport.ts`'s `importChartIntoStore`, which explicitly
  re-uploads a reference image on import. Anyone who traced a chart against a
  photo before signing in silently loses that image when their local chart
  migrates to their account. No test covers this path either. This isn't
  cleanup — it's a product/data-loss call on whether it's intentional and,
  if not, how to wire up the upload.

### Architectural questions (not attempted — genuine design decisions)
- **`usePaintTool.ts` is a 950+ line hook** with a single `onPointerDown`
  spanning ~350 lines and deeply interleaved Draw/Erase/Insert/Select/Suggest
  branching. Highest-risk file in the app for both bugs and onboarding cost.
  Splitting it (e.g. per-tool-mode handlers sharing a stroke engine) is a
  real design decision.
- **`getBoundingClientRect()` is called fresh on nearly every pointer event**
  in `usePaintTool.ts` (8 call sites) and once in `useReferenceImageTool.ts`,
  forcing a layout read each time — `usePanZoom.ts` already caches and
  invalidates this via a viewport subscription plus scroll/resize listeners.
  Centralizing it (shared cached-rect utility, or lifting it into
  `CanvasView`) touches many call sites and the resize-observer story.
- **Five hooks** (`usePanZoom`, `usePaintTool`, `useTouchGestures`,
  `useReferenceImageTool`, `useShortcuts`) each hand-roll
  `addEventListener`/`removeEventListener` pairs on the same canvas element,
  coordinating via `stopImmediatePropagation` ordering documented in
  `CanvasView.tsx`. A shared listener-registration helper would cut
  boilerplate, but whether these five should also be fewer hooks is a bigger
  call.
- **`CanvasView.tsx` enumerates the same ~20 store fields three times** —
  once in a dirty-check diff, once destructured, once in the object passed to
  `render()`. Adding a new renderer-consumed field means remembering to touch
  all three, or it silently stops triggering re-renders. Worth a structural
  fix (single field list or shallow-equal helper), not a blind edit.
- **Confusing naming**: `storage/DocStore.ts` (interface + errors),
  `state/docStore.ts` (the zustand store), and `storage/keyValueDocStore.ts`
  (a backend) are three differently-scoped files with near-identical names.
  A rename would help; it's a cross-cutting change touching many imports.
- **Two parallel undo/redo stacks** — `docStore.ts`'s `undoStack`/`redoStack`
  and `uiStore.ts`'s `selectionUndoStack`/`selectionRedoStack` — unified only
  via `editorHistory.ts`'s sequence-number comparison. Works, but whether to
  eventually merge into one history primitive is architectural, not urgent.
- **`validate()` in `serialize.ts` is one ~170-line cascade** through version,
  palette, stitch, group, repeat, reference-image, and calibration checks.
  It's the app's most safety-critical function (all untrusted load-time data
  flows through it) — worth splitting into per-shape validators deliberately,
  with test coverage in hand, not as a quick edit.

### Minor / low-priority
- Production JS bundle is 714 kB (203 kB gzipped), past Vite's 500 kB
  chunk-size warning threshold. Not a regression from tonight's changes —
  just noting it's now the only build warning. Code-splitting is a call for
  whenever this starts to matter for load time.

Nothing above was touched — they're flagged for your judgment, not blocked
on anything technical.
