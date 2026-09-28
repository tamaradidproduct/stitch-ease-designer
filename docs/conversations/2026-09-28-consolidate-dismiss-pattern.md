# Consolidate the repeated outside-click/Escape dismiss pattern

*2026-09-28*

## What was found

Issue #238 flagged that the same "close a floating panel on an outside
pointerdown, and on Escape" pattern had been independently hand-rolled in six
places, each with its own small, deliberate variation:

- **`src/ui/ColorSwatchPopover.tsx`** — `useLayoutEffect`; pointerdown and
  Escape both listened on the **capture** phase; also closes on **scroll**
  (capture) and window **resize**. No canvas exception.
- **`src/ui/SuggestReviewMenu.tsx`** — `useLayoutEffect`, gated on an `open`
  flag; pointerdown on the capture phase with a **canvas-click exception**
  (a click on the `<canvas>` is ignored here because the canvas already
  closes the menu itself, as part of starting its own gesture); Escape on
  the bubble phase; no scroll/resize handling.
- **`src/ui/ReferenceImagePanel.tsx`** — already had its own tiny local
  `useDismissOnOutside` hook, reused three times (a trace-colors menu, a help
  popover, an opacity popover), all sharing the *panel's own root* as the
  "inside" container rather than each popover's own element. Both listeners
  on the bubble phase; Escape calls **`stopImmediatePropagation`** so no
  other document-level Escape handler also sees it; no scroll/resize.
- **`src/ui/RightPanel.tsx`** — the glossary's inline stitch-search dropdown.
  Pointerdown on the capture phase; the dismissing outside pointerdown also
  calls **`preventDefault`/`stopPropagation`** so the same click can't also
  arm/place a stitch on the canvas underneath. Escape on the bubble phase,
  no suppression. No scroll/resize.
- **`src/ui/StitchPicker.tsx`** — pointerdown on the capture phase with the
  same **canvas-click exception** as `SuggestReviewMenu`. No document-level
  Escape listener at all here — Escape is handled by the component's own
  `onKeyDown`, which is entangled with arrow-key navigation, Enter-to-choose,
  and Backspace-to-clear, and only makes sense scoped to the picker's own
  focused root.
- **`src/ui/ConfirmDialog.tsx`** — outside-click dismissal isn't a
  document-level listener at all; it's the modal's own full-viewport overlay
  backdrop handling its own `onPointerDown`. Escape *was* a document
  listener, but combined into the same handler as a Tab focus-trap (added
  after #238 was filed), so the two had grown entangled in one function.

## What was decided

Approved approach from the issue (implemented as-is, per `tamaradidproduct`'s
"Implement" comment): a shared `useDismissOnOutsideOrEscape` hook
(`src/ui/useDismissOnOutsideOrEscape.ts`) that takes every one of the above
variations as an explicit option — `containerRef`, `ignoreTarget`,
`captureOutsidePointerdown`/`captureEscape`, `suppressDismissingPointerdown`,
`stopEscapePropagation`, `closeOnEscape`, `closeOnScroll`, `enabled` — rather
than forcing all six sites onto one fixed behavior. Each site now calls the
shared hook with exactly the options that reproduce its own prior behavior:

- `ColorSwatchPopover`: capture on both listeners, `closeOnScroll: true`.
- `SuggestReviewMenu`: `ignoreTarget` for the canvas, gated on `enabled: open`.
- `ReferenceImagePanel`: all three popovers keep sharing the panel root as
  `containerRef`, non-capture, `stopEscapePropagation: true`.
- `RightPanel`: `suppressDismissingPointerdown: true` on the search dropdown.
- `StitchPicker`: `ignoreTarget` for the canvas, `closeOnEscape: false` since
  Escape stays on the component's own `onKeyDown` untouched.
- `ConfirmDialog`: `dismissOnOutsidePointerdown: false` (the overlay backdrop
  keeps handling outside clicks itself, unchanged); only Escape moved onto
  the shared hook. The pre-existing Tab focus-trap logic was left as its own
  separate `useEffect`, split out of the old combined handler rather than
  folded into the shared hook (it's dialog-specific keyboard-trap behavior,
  not part of the "outside/Escape" pattern this issue was about).

One implementation-detail normalization, not a behavior change: every site
now attaches its listeners via `useLayoutEffect` internally (previously three
of the six used a plain `useEffect`). Since the listeners are only ever
racing *future* pointerdown/keydown events - never the same synchronous event
that caused the panel to open - attaching a beat earlier (before paint)
versus a beat later (after paint) has no observable effect on when a panel
can be dismissed.

This is a pure refactor with no intended behavior change. Each site's
extraction was verified by close reading against the original (see the six
bullets above), plus `npx tsc --noEmit`, `npm run lint`, `npx vitest run`,
and `npm run build` all passing after each of the six migrations. A new unit
test (`src/ui/useDismissOnOutsideOrEscape.test.ts`) covers the trickiest
shared piece — the outside/inside decision plus the canvas-click exception —
as a small pure function (`isOutsidePointerdown`), the same "extract the pure
decision logic and test that" pattern the codebase already uses for e.g.
`colorSwatchPopoverPosition.ts`. The full DOM-listener wiring (capture phase,
`stopImmediatePropagation`, etc.) isn't independently tested, matching how
none of the six original inline implementations were tested either — this
project's Vitest setup runs in a Node environment with no DOM
(`environment: "node"` in `vite.config.ts`, no `@testing-library/react` or
jsdom installed), so a real render-and-click test would have meant adding
new test infrastructure, which felt like more than this refactor warranted.

## PRD check

`docs/PRD.md`'s `ConfirmDialog` entry (FR-1's "Implementation" section)
documents the dialog's behavior at the product level only — "Escape-to-cancel,
click-outside-to-cancel" — which is unchanged and still accurate; it says
nothing about the capture-phase/`stopImmediatePropagation`/canvas-exception
implementation details this refactor touched, so no PRD update was needed.
No other PRD section documents any of the other five sites' dismiss
mechanics as a spec. `ConfirmDialog`'s `DNT-1` (confirm-button auto-focus
stability) was left untouched by this refactor — only the Escape/Tab-trap
effect was split, not the separate focus effect above it.
