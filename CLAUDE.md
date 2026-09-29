# Stitch Ease Designer — Claude Code conventions

## Product-decision PRs: attach conversation context, sync the PRD

When a PR implements a product decision or feature spec that came out of a
live chat session (not a mechanical/autonomous fix), before opening it:

1. Write a distilled Markdown summary of the relevant discussion — what was
   decided, why, and any alternatives considered — to
   `docs/conversations/<YYYY-MM-DD>-<short-slug>.md`. This is a summary, not a
   raw transcript dump: scope it to what's relevant to the change. This repo
   is public — don't paste unrelated conversation content into it.
2. Update `docs/PRD.md` in the same PR to reflect the new/changed spec.
3. If the PR came from an interactive Claude Code session, include a link
   back to that session in the PR description for full traceability.

This does not apply to fixes with no product-decision content — dependency
bumps, typo fixes, mechanical refactors, Copilot's Bucket A work. PRD.md is
for product specs, not implementation detail.

## Why this is per-PR, not a nightly automation

The nightly cloud routine ("Nightly maintenance: no-regrets fixes +
human-review issues + QA test cases") runs in an isolated sandbox with only a
git checkout — it has no access to local Claude Code chat history, so it
cannot read conversations or sync the PRD itself, no matter how its prompt is
worded. This convention is what makes the sync happen anyway: whoever (human
or Claude) actually had the conversation writes it down as part of the PR
that implements it, while the context is still available.

## Close the issue(s) a merged PR resolves

After merging a PR, close every issue it resolves — its own `Closes #N`
target, and any upstream issue in the same chain (e.g. a `qa-flagged` report
that a `needs-decision`/Bucket-A issue was filed against) once the fix for
that upstream issue has actually landed on `main`. Don't leave a resolved
issue open on the assumption that some other routine will close it later —
check first, and only skip closing if you have a specific, current reason to
believe verification is still pending (e.g. the fix hasn't merged yet, or a
human explicitly asked to verify by hand before closing).

## Label a qa-flagged issue once it's been picked up — and sync its Airtable Finding Status to match

Every `qa-flagged` issue traces back to a record in the **Findings** table of
the QA Airtable base (`appAINJtS6btK4dyo`/`tblsXY4HhYu3LJj0n`) — look it up
by GitHub issue number via the `GitHub Issue # (parsed)` formula field (the
plain `GitHub Issue Number` field is usually empty; don't filter on it). The
GitHub label and the Finding's own `Status` field are two views of the same
state and must be kept in sync — check the Finding's actual current `Status`
before touching it; don't assume it already matches what GitHub shows.

- The moment you file a new issue against a `qa-flagged` report — a Bucket-A
  hand-off to Copilot, or a Bucket-B `needs-decision` write-up — add an
  `in-progress` label to the `qa-flagged` issue itself (creating the label
  first if it doesn't exist yet), **and** set its Finding's `Status` to
  `In progress`.
- If instead you reply on the issue asking a question, presenting a decision,
  or requesting more info (rather than filing a companion issue) — still add
  the `in-progress` label so it doesn't read as untouched, and set the
  Finding's `Status` to `Need clarification`.
- When you close the `qa-flagged` issue (per the convention above), set its
  Finding's `Status` to `Resolved`.

Leave the label on, and the Status out of `New`, until the issue is actually
closed — don't remove or revert either partway through.

## Mirror GitHub activity to Airtable comments

Every comment you post on a `qa-flagged` issue — a clarifying question, a
decision proposal, a closing summary with the fix's PR link — post the same
content as an Airtable comment on that issue's linked Finding record (via
the Comments API: `POST /v0/{baseId}/{tableId}/{recordId}/comments`), so
someone reading only Airtable sees the same trail without checking GitHub.
Airtable comments post under whoever's API token is used, not under
"Claude" — always prefix the text with `[Claude Code, GitHub sync]` so it's
never mistaken for a manually-written note. Do this alongside the Status
sync above, not instead of it — the comment is the narrative, the Status
field is the machine-readable state.

## New test cases go in Airtable, not GitHub issues

When a PR's review turns up a gap in manual QA coverage (a refactor or
dependency bump that automated tests can't fully validate, a new code path
nothing currently exercises, etc.), create the test case directly in the
**Test Cases** table of the QA Airtable base
(`appAINJtS6btK4dyo`/`tblWwtxagtDwxPvwD`) — not as a `[NEW TEST CASE]`
GitHub issue. That table is the actual source of truth QA works from;
a GitHub issue was just an extra hop nobody was reading.

Fill in at minimum: `Title`, `Area`, `Platform`, `Test Priority`, `Steps`,
`Expected Result`, and `Lifecycle: Ready`. Link `Requirements` when the case
traces to an actual product spec/FR; leave it blank (and say why in `Notes`)
for a pure regression check on a mechanical change with no corresponding
requirement — don't invent a link just to satisfy the table's own
`Readiness Check` formula, which will read `Incomplete` in that case and
that's fine. Mention the source PR/issue number in `Notes` for traceability.
