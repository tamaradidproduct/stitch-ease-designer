# Faster Fixes → Airtable sync

`.github/workflows/sync-faster-fixes.yml` copies Faster Fixes feedback into the
`Findings` table in the `Stitch Ease QA` Airtable base every five minutes. It can
also be run manually from GitHub Actions.

## GitHub Actions secrets

The workflow needs two repository secrets:

- `FASTER_FIXES_AGENT_TOKEN`: an agent token with `feedbacks:read` access.
- `AIRTABLE_TOKEN`: an Airtable personal access token with
  `data.records:read` and `data.records:write` access to the `Stitch Ease QA`
  base.

The workflow exits successfully with a warning until both secrets exist.
Neither token belongs in source control or a `VITE_` environment variable.

## Record mapping

The sync upserts records using `Faster Fixes ID`, so repeated runs update the
same Finding rather than creating duplicates.

| Faster Fixes | Airtable Findings |
| --- | --- |
| Comment | Summary and Observed Behavior |
| Status | Status |
| Feedback ID | Faster Fixes ID |
| Page URL | Page URL |
| Reviewer name | Reviewer |
| Created timestamp | Reported At |
| Screenshot URL | Evidence attachment |
| Selector/browser/viewport/click | Reproduction Notes |

Status mapping is `new` → `New`, `in_progress` → `In progress`, `resolved` →
`Resolved`, and `closed` → `Archived`. Type and Severity remain unset for
manual triage.
