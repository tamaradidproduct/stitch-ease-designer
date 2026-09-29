# Require every matching stitch selected before offering the recolor chip

*2026-09-25*

## What was decided

The floating picker's recolor chip (FR-25/FR-27) now only appears for a
selection when it covers **every** confirmed placement on the chart sharing
that selection's (symbol, color) combo — not just a selection that's
internally homogeneous (the old FR-33 rule). One Purl selected while another
plain Purl exists unselected elsewhere on the canvas no longer offers a
recolor chip; selecting both (or all) instances of that combo does.

A still-pending Suggest guess (`placement.suggested === true`) matching the
combo doesn't count as an "other instance" — it hasn't been confirmed onto
the chart yet, consistent with how every other placement-counting helper in
the glossary already excludes pending suggestions.

Implemented as a new check inside `currentSlotForPicker` (`src/ui/colorwork.ts`):
after confirming the selection is internally homogeneous, it now also scans
every placement in the document and returns `null` (no chip) if any
unselected one matches the same combo.

## Why

QA (#211) flagged the recolor chip being offered while another same-type
stitch (a plain Purl) existed elsewhere on the chart. Investigation found
this wasn't a bug against the *existing* spec — FR-27/FR-33 explicitly
supported recoloring a homogeneous subset — but `tamaradidproduct` confirmed
on #224 that the intended product rule is stricter: the chip should only
ever recolor a symbol when the whole chart's matching, still-uncolored
population is being recolored together, never a partial subset that would
leave a mismatched leftover instance behind.

The "doesn't currently have a color" half of the rule needed no code
change — `StitchPicker.tsx`'s two `ColorChip` render sites already gate on
`!entry.colorId` (FR-25), so a combo that already has a color never shows
this chip regardless of selection completeness. Only the "selected the
homogeneous subset" vs. "selected every instance" distinction was new.

## Alternatives considered

- **Checking "every instance" only for multi-selections**, leaving a single
  selected stitch always eligible, was rejected — a single Purl selected out
  of three unselected Purls elsewhere is exactly the reported case, and the
  rule needs to apply whether the selection has one member or several.
- **Extending the rule to the add-only chips (FR-34)** was considered and
  explicitly rejected: those never touch existing placements no matter how
  many plain instances of a symbol exist, so "every instance selected" has
  no meaning there.
