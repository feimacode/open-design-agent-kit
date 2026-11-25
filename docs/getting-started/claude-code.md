# Claude Code

In Claude Code, Open Design comes as **skills** (they tell Claude when and how to design) plus the **MCP server** (the tools). You can install both as a plugin, or write them into your project with one command.

## Before you start

- Claude Code.
- Node.js 18 or later (the MCP server runs with `npx`), except with the [hosted plugin](#which-plugin).
- Optional:
  - an installed Chrome, Edge or Chromium, for the [browser preview](../guides/browser-preview.md)'s window and comment screenshots, and for exporting images, PDFs and PowerPoint;
  - [FFmpeg](https://ffmpeg.org/), for video and for exporting animations.

## Option A: the plugin

```
/plugin marketplace add feimacode/open-design-agent-kit
/plugin install open-design
```

Without Node.js, run `/plugin install open-design-hosted` instead (see [Which plugin](#which-plugin)).

This installs:

- the `open-design` overview skill, which triggers on design requests;
- workflow skills that also trigger on their own kind of request: social posts, posters, campaigns, exploring several directions, decks from a document, Markdown docs as pages, sharing a link, and integrations (see [Prompts and commands](../reference/prompts-and-commands.md#claude-code));
- `/open-design:open-design-new`, to see what Open Design can make and start one;
- one explicit-only skill per [curated entry](../reference/prompts-and-commands.md#curated-entries), named `/open-design:od-<mode>-<id>`;
- the MCP server, registered automatically.

## Which plugin

The marketplace has two plugins. Install one, not both: they share the `open-design` name, so their skills and server would clash.

| | `open-design` (local) | `open-design-hosted` |
|---|---|---|
| Needs | Node.js 18 or later | Nothing, only internet access to `open-design.feimacode.com` |
| Where the tools run | On your computer | On our [hosted server](claude-and-chatgpt-web.md) |
| Where designs go | `.open-design/` in your project | A project on the server, deleted 7 days after you last used it; no account |
| What you get back | Files and paths | Viewer and download links (downloads last 24 hours) |
| Missing | | Browser preview, your project's files, taking a design system from a website, Figma, Canva and shop hand-offs, porting to app code, recurring jobs ([full list](../reference/remote-server.md#what-a-project-can-do)) |

Pick `open-design` if you can run Node. Pick `open-design-hosted` if Node isn't installed or is blocked, for example on a managed work laptop, and your designs may be stored on our server (see the [privacy policy](../legal/privacy.md#the-hosted-server)).

## Option B: write it into your project

```bash
npx @feimacode/open-design-agent-kit init --tools claude
```

This writes the same skills into `.claude/skills/` (commands are then `/od-<mode>-<id>`) and merges an `open-design` server into `.mcp.json`, pinned to the same version as the skills, keeping any other servers. It also adds an `open-design-preview` entry to `.claude/launch.json`, for the [Browser pane in Claude Desktop](claude-desktop.md#the-live-preview-in-the-browser-pane). Commit these files and everyone who clones the repo gets the same setup. See [`init`](../reference/cli.md#init).

## Option C: just the MCP server

```bash
claude mcp add open-design -- npx -y @feimacode/open-design-agent-kit-mcp
```

You get the [tools](../reference/tools.md) without the skills. Claude can still use them, but with less guidance on when to.

## Your first design

> Make me a one-page landing page for a coffee subscription, warm and editorial.

Claude loads the `open-design` skill, browses the catalog, prepares a brief, writes the HTML with its own tools and registers it under `.open-design/<name>/`.

Not sure what to ask for? Run `/open-design:open-design-new` (or `/open-design-new` after `init`) to see what Open Design can make: wireframes, slides, posters, diagrams and more. Claude then opens the design in a [browser preview](../guides/browser-preview.md) that reloads as it changes. Click **Comment** there to point at elements and say what should change, then **Send to agent** and paste into Claude Code. The preview's **Checks** panel shows the screenshots Claude checked its work with, before and after.

When a design is ready, Claude ends with a **Files** list: the design's HTML file and every export, each a link you can click. Signed in to claude.ai (Pro, Max, Team or Enterprise), Claude also offers once to put the design on claude.ai as a private **Claude artifact** you can open from any device. Say yes and it publishes one, then updates the same artifact after each round of your feedback, so an open tab shows the latest version. Only you can see it; to show someone, share it from claude.ai. See [Share and publish](../guides/share-and-publish.md#a-claude-artifact).

The server writes to the project Claude Code was started in. To point it somewhere else, set [`OPEN_DESIGN_WORKSPACE_ROOT`](../reference/settings-and-env.md#open_design_workspace_root).

## Pick a design system

Designs follow the workspace's **active design system**. Set it once:

> Use the Stripe design system from now on.

It stays until you switch ("switch to Apple") or clear it ("stop using a design system"). It's stored in `.open-design/config.json`. See [Design systems](../guides/design-systems.md#specify-and-switch).

## Next

- [Generate a design](../guides/generate-a-design.md) and [Design systems](../guides/design-systems.md)
- [Social media posts](../guides/social-posts.md), [Posters and print](../guides/posters.md), [Export decks and PDFs](../guides/export-decks.md)
- [Share and publish](../guides/share-and-publish.md) and [Connect other services](../guides/integrations.md) (Canva, Figma, Notion and more through your agent's connectors)
- [Prompts and commands](../reference/prompts-and-commands.md#claude-code) and [all guides](../guides/README.md)
