# QA workflow: automated retest signals and full-type GitHub filing

**Date:** 2026-09-25

## Context

A review of the Stitch Ease QA Airtable base (`Test Cases` / `Test Runs` /
`Findings` / `Deployments` / `Requirements`) found a working intake →
test → defect → GitHub → retest loop, but two real gaps:

1. A new staging deployment logged itself (commit, branch, URL) but gave QA
   no signal about *what to retest* — nothing connected "this deploy touched
   the Glossary" to "these Glossary test cases need another pass."
2. Only `Defect`-type Findings were filed to GitHub. `UX Friction`,
   `Enhancement`, `Question`, `Accessibility`, `Inconsistency`, and
   `Regression` Findings had no path out of Airtable at all.

This doc covers the decisions made to close both gaps, plus a few
API/platform constraints hit along the way that shaped the final shape.

## Decision: commit-message keyword heuristic over file-diff mapping

To connect a deployment to the test cases it might have affected, two
approaches were considered:

- **File-diff mapping** — `git diff --name-only` against changed files,
  mapped to Areas by path prefix. More precise, but needs `fetch-depth: 0`
  in the deploy workflow (currently a shallow, depth-1 checkout) and a
  maintained file-path → Area map.
- **Commit-message keyword matching** (chosen) — the `push` GitHub Actions
  event already carries `commits[].message` with no extra checkout cost.
  Matched against each Test Case Area's existing choice IDs via a fixed
  keyword list (`glossary`, `canvas`, `reference image`, `suggest`, etc).

Chosen for zero extra CI cost and because it was good enough to unblock the
workflow now. Explicitly a heuristic, not a precise mapping — a vaguely
worded commit (e.g. "fix stepper bug") won't match anything. A file-diff
version remains the natural fast-follow if the heuristic proves too lossy
in practice.

**Implementation.** `.github/workflows/deploy-staging.yml`'s
"Record successful deployment in Airtable" step now also reads
`.commits[].message` from `$GITHUB_EVENT_PATH` (not interpolated via
`${{ }}`, specifically to avoid a commit-message shell-injection vector)
and includes it in the webhook payload as `commit_messages`. Empty for
`workflow_dispatch` runs (manual deploys carry no `.commits` array, so they
get no retest matching — accepted as a known gap for manual-trigger
deploys).

## Decision: `Needs Retest` as one checkbox, fed by two independent sources

Rather than only exposing "which test cases a deployment might have
touched" as a link *on the Deployment record*, `Test Cases` got its own
`Needs Retest` checkbox — the actual thing QA scans — set true by either:

1. **Deployment area match** — the commit-keyword matching above, via a
   script step in the existing "Record successful staging deployment"
   automation, feeding two new link fields on `Deployments`
   (`Needs Retest — Test Cases`, `Needs Retest — Findings`), which a
   separate automation turns into the checkbox on each linked Test Case.
2. **All related Findings closed** — when every Finding tied to a Test
   Case (via its Test Runs) reaches Resolved/Archived/Duplicate.

Cleared automatically the moment a fresh Test Run is logged against that
Test Case (extending the existing "Update Test Case from new Test Run"
automation) — a checkbox that never turns itself off isn't useful.

### Why rollup fields instead of automation-side looping, for source #2

The first attempt at "are all Findings for this Test Case closed" tried to
do it inline in the automation: loop the triggering Finding's related test
cases, and for each, run a `findRecords` filtered by
`hasAnyOf(<Related test cases field>, [<this one test case id>])`. This
repeatedly failed Airtable's automation-input type checker — wrapping a
single dynamic scalar into a one-element array isn't a documented,
supported expression shape in this API surface (the one documented pattern
maps an already-array-valued `$ref`, not a single value).

Replaced with plain Airtable fields instead of fighting the expression
language further:

- `Findings.Is Open` — formula, 1 unless Status is Resolved/Archived/Duplicate.
- `Test Runs.Open Findings` — rollup, `SUM(values)` of linked Findings' `Is Open`.
- `Test Runs.Total Findings` — count of linked Findings.
- `Test Cases.Open Findings Count` / `Total Findings Count` — rollups of the
  above two, one hop further out through the Test Case's Test Runs.

The automation then just watches for `Open Findings Count = 0 AND Total
Findings Count > 0` on the Test Case directly — no loop, no per-item
dynamic array, no nested conditional group. Simpler and more robust than
the DSL approach it replaced.

## Platform constraint: `customScript` nodes are read-only via the Airtable API

The deployment automation's keyword-matching step is a "Run a script"
action, added manually in the Airtable UI (the API's `create_automation`/
`update_automation` accept `customScript` as a node *type* for reading, but
reject any write — create or update — to an automation that contains one,
full stop, regardless of what else in the payload changed). This means:

- The script itself, and every step added after it in that automation, had
  to be added by hand in the UI, with the API only able to read back the
  result to verify `configurationStatus`.
- Two schema/wiring gotchas fell out of this constraint being discovered
  gradually rather than up front: the deploy webhook's schema had to be
  captured via a live test payload before the script's input picker could
  even offer `commit_messages` as a field, and an early UI-built "Update
  record" step accidentally merged both find-records results into a single
  link field before being corrected.
- Every other automation touched this session (the GitHub-filing cron, the
  Needs Retest automations, the Failed→reopen automation) has no script
  node and was built/edited entirely via the API.

## Decision: file all Finding types to GitHub, not just Defects

`Flag open Findings to GitHub`'s filter dropped its `Type = Defect`
condition — every open Finding (New / Need clarification, not yet linked to
an issue) now gets filed regardless of type. Considered routing non-Defect
types to a separate lower-urgency backlog instead, but the user's explicit
call was to send everything through the same GitHub path rather than split
by type.

## Decision: `Failed` status reopens the linked GitHub issue

A `Failed` Finding status was added (a retest came back bad). A new
automation (`Reopen GitHub issue when Finding fails retest`) fires on that
status and calls `githubUpdateIssue`. The API only exposes `repoId` and
`issueNumber` as agent-fillable inputs for that action type — actually
setting `State: Open` (and an optional comment) had to be configured by
hand in the UI, same class of constraint as the script node above, though
for a different reason (this input simply isn't in the API's fillable-input
catalog for this action type, not a read-only-node restriction).

A supporting field, `Findings.GitHub Issue # (parsed)` (formula,
`REGEX_EXTRACT` on the existing `GitHub Issue` URL field), was added
because the pre-existing `GitHub Issue Number` field was never actually
populated by anything — the reopen action needs a numeric issue number, not
a URL.

## Verification

- The deployment → retest-matching chain was tested end-to-end with a
  synthetic webhook payload (`commit_messages` containing "glossary" /
  "swatch"), confirming the script matched the Glossary area, `findRecords`
  returned the correct 27 Ready test cases and 8 Ready-to-retest findings,
  and both landed correctly on the Deployment record's two link fields (and
  from there, checked `Needs Retest` on the Test Cases via the follow-on
  automation).
- The Failed → reopen path was tested against a real, already-Resolved
  Finding/issue pair (`#208`): flipping Status to Failed reopened the issue
  on GitHub (confirmed via `gh issue view`), then the Finding was set back
  to Ready to retest and the issue left open, since the underlying case
  genuinely needs re-verification.
- All test/synthetic Airtable records created during verification were
  deleted afterward.

## Code change

Only one file in this repository changed: `.github/workflows/deploy-staging.yml`
gained the `commit_messages` field in its Airtable webhook payload (see
Decision 1 above). It landed already merged, bundled into
[PR #239](https://github.com/tamaradidproduct/stitch-ease-designer/pull/239)
(“Support multiple reference images per chart”) by a concurrent session
working the same branch — unrelated to that PR's actual subject. This doc
exists to give the decision its own record, per this repo's convention for
product-decision changes, since the code itself didn't get a dedicated PR.

Everything else described here (fields, automations) lives in the
Stitch Ease QA Airtable base, outside this repository.
