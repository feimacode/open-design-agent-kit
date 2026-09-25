# Claude Code

In Claude Code, Open Design comes as **skills** (they tell Claude when and how to design) plus the **MCP server** (the tools). You can install both as a plugin, or write them into your project with one command.

## Before you start

- Claude Code.
- Node.js 18 or later (the MCP server runs with `npx`).
- Optional:
  - an installed Chrome, Edge or Chromium, for exporting images, PDFs and PowerPoint;
  - [FFmpeg](https://ffmpeg.org/), for video.

## Option A: the plugin

```
/plugin marketplace add feimacode/open-design-agent-kit
/plugin install open-design
```

This installs:

- the `open-design` overview skill, which triggers on design requests;
- the `open-design-social-post` skill, which triggers on social-post requests;
- one explicit-only skill per [curated entry](../reference/prompts-and-commands.md#curated-entries), named `/open-design:od-<mode>-<id>`;
- the MCP server, registered automatically.

## Option B: write it into your project

```bash
npx @feimacode/open-design-agent-kit init --tools claude
```

This writes the same skills into `.claude/skills/` (commands are then `/od-<mode>-<id>`) and merges an `open-design` server into `.mcp.json`, keeping any other servers. Commit these files and everyone who clones the repo gets the same setup. See [`init`](../reference/cli.md#init).

## Option C: just the MCP server

```bash
claude mcp add open-design -- npx -y @feimacode/open-design-agent-kit-mcp
```

You get the [tools](../reference/tools.md) without the skills. Claude can still use them, but with less guidance on when to.

## Your first design

> Make me a one-page landing page for a coffee subscription, warm and editorial.

Claude loads the `open-design` skill, browses the catalog, prepares a brief, writes the HTML with its own tools and registers it under `.open-design/<name>/`. Open the HTML in a browser to see it. Claude Code has no preview editor; the [VS Code extension](vscode.md) adds one.

The server writes to the project Claude Code was started in. To point it somewhere else, set [`OPEN_DESIGN_WORKSPACE_ROOT`](../reference/settings-and-env.md#open_design_workspace_root).

## Next

- [Generate a design](../guides/generate-a-design.md) and [Design systems](../guides/design-systems.md)
- [Social media posts](../guides/social-posts.md), [Export decks and PDFs](../guides/export-decks.md)
- [Prompts and commands](../reference/prompts-and-commands.md#claude-code)
