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
