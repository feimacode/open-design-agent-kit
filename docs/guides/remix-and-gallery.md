# Remix and the gallery

Instead of generating from nothing, start from one of 167 real rendered examples (decks, dashboards, landing pages, cards, résumés…) and let the agent adapt it. Remixing copies the example into your workspace and tells the agent to **modify** it, which is faster and keeps the example's craft.

## Remix by asking

> Start from the Swiss International deck example and turn it into our Q3 board update.

The agent finds remixable entries with [`list_open_design_skills`](../reference/tools.md#list_open_design_skills) (`remixableOnly: true`) and calls [`remix_open_design_example`](../reference/tools.md#remix_open_design_example). The example and its assets are copied to `.open-design/<name>/` and registered, and the agent edits the copy.

> **In Claude Code / Codex:** the overview skill ships `references/remixable-examples.md`, a list of every example grouped by mode, which the agent can read without a tool call. Each example is also an MCP prompt named `od-<mode>-<id>` (in Claude Code, `/mcp__open-design__od-…`). Selecting one prefills a remix request for you to edit and send.

## The online gallery

The [Open Design gallery](https://feimacode.github.io/open-design-agent-kit/) shows every example and design system as a web page, with no install. Search or filter by tag (a link can carry the filter, such as `examples/#tag=poster`), open one full size, and download its files. Each page hands the next step to your agent:

- **An example** gives the remix prompt ("Remix the Open Design example …") and the brief it was made from. Paste it into any agent with Open Design.
- **A design system** gives a prompt to use it with Open Design, and one to add it to Claude Design, with **Open in Claude** to start that chat. See [Use one in Claude Design](design-systems.md#use-one-in-claude-design).

Agents can read the same list as data from `gallery.json` at the site root. How the site is built: [gallery/README.md](../../gallery/README.md).

## Browse the gallery in Claude Desktop Chat

Where the inline preview shows (see [Inline preview](inline-preview.md#pick-an-example)), ask Claude to show you the examples. A gallery of live previews appears in the conversation, filterable by mode; **Remix this** sends your pick to Claude, which remixes it.

## Browse the gallery (VS Code)

Three ways into the same examples:

| Where | How | Clicking an example… |
|---|---|---|
| **Open Design: Open Gallery Grid** | **New design** tiles for starting from a kind of thing (wireframe, poster, diagram…), then a searchable card grid with live thumbnails and category filters | a tile prefills `/open-design-new` in chat; a card's Remix remixes it |
| **Gallery view** (Open Design activity-bar icon) | Tree grouped by category | prefills Copilot Chat with the example's brief (not sent). Inline icons preview or remix directly |
| **Open Design: Browse Gallery** | Keyboard quick-pick | remixes it |

## Community designs (VS Code)

The gallery also shows designs contributed to [awesome-open-design](https://github.com/feimacode/awesome-open-design), labelled **Community**. They aren't reviewed by this project. You can also share your own designs back with `#od-share-to-community`. See [Community designs](community-designs.md) for how syncing, safety and contributing work.

## What you get

A normal artifact, registered as kind `html`, with `metadata.remixedFrom` naming the example it came from. Remixed decks still [export as decks](export-decks.md#how-decks-are-detected).

## Related

[Generate a design](generate-a-design.md) · [Preview, comment and edit](preview-comments-edit.md)
