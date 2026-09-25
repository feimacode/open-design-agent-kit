# VS Code (GitHub Copilot Chat)

The extension builds Open Design into Copilot Chat as native language-model tools, chat instructions and slash commands. No daemon, MCP server, API key or model setting is involved: Copilot's own model does the work with its own file tools.

## Before you start

- VS Code 1.104 or later.
- [GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat), or any chat agent that can call VS Code's language-model tools. The gallery, collections and preview work without one; generating needs one.
- Optional:
  - an installed Chrome, Edge or Chromium, for exporting images, PDFs and PowerPoint;
  - [FFmpeg](https://ffmpeg.org/), for video.

## Install

Search "Open Design Agent Kit" in the Extensions view, or install it from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=feima.open-design-agent-kit). There's nothing to configure. Open **Welcome → Walkthroughs → Get started with Open Design** for a guided tour.

## Your first design

1. Open a folder, then open Copilot Chat in **agent** mode.
2. Ask in plain words:

   > Make me a pitch deck for a Series A fintech startup, editorial style.

3. Copilot browses the catalog (`list_open_design_skills`), picks a recipe, gets instructions (`prepare_open_design_brief`), writes the files, and registers the artifact.
4. The result opens in the **Open Design Artifact Preview**, and the files are in your workspace:

   ```
   .open-design/series-a-fintech-pitch/series-a-fintech-pitch.html
   .open-design/series-a-fintech-pitch/series-a-fintech-pitch.html.artifact.json
   ```

Or be explicit:

- `/od-deck-guizang-ppt A 10-slide pitch deck for…` runs a [curated recipe](../reference/prompts-and-commands.md#curated-entries).
- `/open-design-social-post An X post announcing our v2 launch` designs a post and exports the PNG.
- **Open Design: Open Gallery Grid** lets you pick a real example to remix instead of starting blank.
- "Use the Starbucks design system, then build me a landing page" sets the active design system and uses it from then on.

## Where things are

- **The Open Design activity-bar icon:** the **Gallery** (examples to remix) and **Collections** (multi-screen flows).
- **The status bar:** the active design system. Click it to change it.
- **Right-click an `.html` file → Open Artifact Preview:** view, comment on or edit any artifact. See [Preview, comment and edit](../guides/preview-comments-edit.md).
- **Open Design: Open Docs:** opens this documentation.

## Next

- [Generate a design](../guides/generate-a-design.md) and [Design systems](../guides/design-systems.md)
- [Social media posts](../guides/social-posts.md), [Export images](../guides/export-images.md), [Export decks and PDFs](../guides/export-decks.md)
- [Settings](../reference/settings-and-env.md#vs-code-settings)
