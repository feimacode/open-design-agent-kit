# Remix and the gallery

Instead of generating from nothing, start from one of 167 real rendered examples (decks, dashboards, landing pages, cards, résumés…) and let the agent adapt it. Remixing copies the example into your workspace and tells the agent to **modify** it, which is faster and keeps the example's craft.

## Remix by asking

> Start from the Swiss International deck example and turn it into our Q3 board update.

The agent finds remixable entries with [`list_open_design_skills`](../reference/tools.md#list_open_design_skills) (`remixableOnly: true`) and calls [`remix_open_design_example`](../reference/tools.md#remix_open_design_example). The example and its assets are copied to `.open-design/<name>/` and registered, and the agent edits the copy.

> **In Claude Code / Codex:** the overview skill ships `references/remixable-examples.md`, a list of every example grouped by mode, which the agent can read without a tool call. Each example is also an MCP prompt named `od-<mode>-<id>` (in Claude Code, `/mcp__open-design__od-…`). Selecting one prefills a remix request for you to edit and send.

## Browse the gallery (VS Code)

Three ways into the same examples:

| Where | How | Clicking an example… |
|---|---|---|
| **Open Design: Open Gallery Grid** | Searchable card grid with live thumbnails and category filters | remixes it |
| **Gallery view** (Open Design activity-bar icon) | Tree grouped by category | prefills Copilot Chat with the example's brief (not sent). Inline icons preview or remix directly |
| **Open Design: Browse Gallery** | Keyboard quick-pick | remixes it |

## Community designs (VS Code)

The gallery also shows designs contributed to [awesome-open-design](https://github.com/feimacode/awesome-open-design), labelled **Community**. They aren't reviewed by this project. You can also share your own designs back with `#od-share-to-community`. See [Community designs](community-designs.md) for how syncing, safety and contributing work.

## What you get

A normal artifact, registered as kind `html`, with `metadata.remixedFrom` naming the example it came from. Remixed decks still [export as decks](export-decks.md#how-decks-are-detected).

## Related

[Generate a design](generate-a-design.md) · [Preview, comment and edit](preview-comments-edit.md)
