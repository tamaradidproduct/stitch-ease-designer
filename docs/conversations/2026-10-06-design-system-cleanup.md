# Design system cleanup: tokens, inconsistencies, consolidation (2026-10-06)

## Asked

Itemize the tokens used only once and look for merges, then do every item
on the checklist: quick wins, inconsistencies, token cleanup and
consolidation.

## Decided and done

- **Single-use tokens.** 39 were used once. Most are legitimately one-off
  (banner colors, layers, the colorwork ink pair).
  - Merged into one `--danger-text`: `--danger-strong` and `--danger-ink`.
  - Made aliases, so they follow their source:
    - info banner → accent family
    - cursor preview → cell / chrome / text tokens
    - `--tooltip-bg` → `--text`
    - `--cell-stroke` → `--text-subtle`
  - Removed: `--shadow-0` and the unused `--radius-xl`.
- **Token aliases.** `tokens.json` now supports `"{token}"` references.
- **Quick wins.**
  - Deleted about 150 lines of dead CSS, including all of
    `selectionActions.css`.
  - One disabled style: `--opacity-disabled`, `cursor: default`.
  - Deleted the outdated first inventory artifact.
- **Inconsistencies.**
  - One global `:focus-visible` ring (`--focus-outline`); no rule removes it
    any more.
  - All hover rules sit behind `@media (hover: hover)`, so hover no longer
    sticks on iPad.
  - A five-step control-size scale (24/28/32/36/40). The tool dock goes
    38→40px, the history and zoom buttons 30→32px.
  - `--leading-*` and `--tracking-*` tokens.
- **Consolidation.**
  - Every button goes through `Button`; `variant="unstyled"` keeps
    component-specific looks.
  - Every input uses `TextField`, `Slider` or `Checkbox`.
  - `SegmentedControl` replaces the pattern-settings toggles.
  - In-flow panels use `.inset`.
  - New size tokens: badge, key, glyph-box.
  - RightPanel is split into one file per card, with a shared
    `SideModule`.
  - ReferenceImagePanel and StitchPicker each lose two sub-components.
  - New tests for the shared primitives.
- **Guard tests extended.** They now fail on hover outside
  `(hover: hover)`, raw line-height or letter-spacing, and literal disabled
  opacity.

## Left open (listed in the style guide's backlog)

- **Unify the look of the ~90 `variant="unstyled"` buttons.** This needs
  design review.
- **Files still over 500 lines:** GlossarySection (~800), StitchPicker
  (~790) and ReferenceImagePanel (~550). The remaining splits go through
  tightly coupled search state.
- **Components without tests.**
- **Platform decisions:** dark mode, Figma publishing, editable colorwork
  swatches.

No PRD change: UI architecture and visual consistency, no product behavior.
