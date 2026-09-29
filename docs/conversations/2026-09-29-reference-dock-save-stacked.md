# Reference dock: Save changes as its own pill in stacked layout (#263)

Source: GitHub issue #263, filed as a Bucket B ("needs-decision") write-up
against QA report #253.

## What was decided

On very narrow canvases (the "stacked" layout introduced by FR-58/#253/PR
#290), the reference-image dock's secondary actions (Hide, Bring to front)
collapse to a single icon-only column. Previously, "Save changes" was folded
into that same column as a third button. Per this thread, Save changes is
now pulled out into its own separate, full-width pill positioned underneath
that column, rather than sharing its box.

## Why

- 2026-09-26: tamaradidproduct defined "too narrow" as the point where
  buttons in the bottom floating bar start overlapping.
- 2026-09-28: investigation found PR #290 had already shipped #253's
  responsive collapse using fixed pixel breakpoints (900px/640px) rather
  than overlap detection, and declined to build a second, competing
  overlap-detection version without her having tried the shipped one first.
- 2026-09-29: after trying it, she confirmed the breakpoint behavior itself
  is correct, but asked for one layout change: "'save changes' should be a
  separate full button underneath the other dock (with visibility and
  layering)" — i.e. underneath the Hide/Bring-to-front column, not merged
  into it.

## Alternatives considered

None raised in the thread beyond the shipped fixed-breakpoint approach,
which she confirmed is fine as-is.

## Implementation

- `src/ui/ReferenceImageDock.tsx` — the quick dock (Hide/Bring-to-front) and,
  in stacked layout only, a full-width Save-changes pill are now siblings
  inside a new `referenceImageQuickDockGroup` wrapper, instead of Save being
  a third button inside the quick dock itself.
- `src/styles.css` — positioning moved from `.referenceImageQuickDock` to
  the new `.referenceImageQuickDockGroup`; added `.referenceDock--save-stacked`
  for the standalone full-width pill's own box treatment.
