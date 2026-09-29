# Replace the Suggest tool's numeric badge with a descriptive subtitle

*2026-09-25*

## What was decided

The Suggest glossary row's small numeric badge (`suggestTaughtCount`, how
many distinct stitch types Suggest has a confirmed exemplar for) is replaced
with a short text subtitle under the "Suggest" label itself:

- Zero: "Confirm a stitch to enable Suggest"
- One: "Recognizes 1 stitch type"
- Two or more: "Recognizes N stitch types"

The count itself (`suggestTaughtCount` in `src/ui/RightPanel.tsx`) is
unchanged — only how it's presented. The identified/unidentified review rows
(`suggestedCount`/`unrecognizedCount`) are untouched.

## Why

Issue #199 (sourced from QA note #196, "remove the suggested count") turned
out to be ambiguous: the codebase already has three distinct Suggest-related
counts, and #196's wording ("stitches that used to be suggested but not
anymore") most literally pointed at the Suggest-button badge
(`suggestTaughtCount`), not the "N identified"/"N unidentified" review rows,
which already shipped as separate counts before #196 was filed.

Discussion on #199 converged on: the badge isn't wrong, it's undiscoverable
— a bare number next to "Suggest" with no visible label, readable only via
its hover tooltip. The fix keeps the information but makes it legible at a
glance as a short description, matching how the tooltip already phrased it.

## Alternatives considered

- **Removing the count outright** (the literal reading of #196) was rejected
  once the actual thread clarified the badge is the only in-UI signal that
  Suggest has anything to match against yet — removing it with nothing in
  its place would regress that.
- **Merging the "N identified"/"N unidentified" rows** into one control was
  raised as a possible alternate reading of #196, but explicitly deferred as
  a larger UX change needing its own scoped spec, separate from this fix.
