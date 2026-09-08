---
name: remember-to-backlog
description: File deferred StitchEase product ideas into the StitchEase backlog Notion database. Use this when the user says to remember something for later, add it to the backlog, or otherwise flags it as future work rather than immediate work.
---

# Remember to backlog

When the user defers an idea, file it in the **StitchEase backlog** Notion
database instead of only noting it in chat.

## Database

Data source: `collection://493c5332-9c6b-4851-9d36-18485efc6308`

Database page: https://app.notion.com/p/5264e3594da942a78f8b6b978837d4a7

Schema:
- **Name** (title) - required. Use a short, plain backlog title.
- **Description** (text) - include the idea, why it is deferred, and any useful context for revisiting it later.
- **Status** (select: Now / Next / Later / Completed) - default to **Later** unless the user clearly wants it prioritized sooner.
- **Priority** (select: High / Medium / Low) - infer from the user's wording. Default to **Low** for casual future ideas.
- **Functionality** (multi-select: Reference Capture / Reference Scale / Reference UI / Platform/iPad / Validation / Preview/Presets) - tag the most relevant areas. Use more than one when the idea spans multiple parts.
- **Archived** (checkbox) - leave unset for new items.

## How to file ideas

1. If the schema or option names are uncertain, fetch the data source first.
2. Create one row per distinct idea under `parent: {type: "data_source_id", data_source_id: "493c5332-9c6b-4851-9d36-18485efc6308"}`.
3. Keep each row at the right granularity. If the user's request is one broader feature, group related sub-details into the `Description` as checkboxes or bullets instead of splitting them into multiple rows.
4. Fill in `Name`, `Description`, `Status`, `Priority`, and `Functionality` using sensible defaults.
5. Confirm back with the created page title and link.

## Defaults

- Use `Later` for status unless the user clearly wants it sooner.
- Use `Low` priority for casual future ideas.
- Use `Reference UI` when the idea is mainly about labels, placement, or interactions.
- Use `Validation` when the idea is about rules, compatibility, or preventing invalid combinations.
- Use `Platform/iPad` when the issue is platform-specific or touch-specific.

## What not to do

- Don't ask for Status, Priority, or Functionality on every item.
- Don't duplicate this into another memory system.
- Don't turn one idea into multiple backlog rows unless the user clearly wants that split.
