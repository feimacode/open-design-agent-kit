# Open Design for GitHub Copilot

Make posters, flyers, social posts, slide decks, landing pages and app prototypes from the chat in GitHub Copilot (Copilot CLI and the Copilot app), with ready-made design systems, automatic checks, and PDF, PNG, MP4 or editable PowerPoint exports.

The plugin bundles 45 skills (a router skill, task skills such as `open-design-poster`, `open-design-deck-from-source`, `open-design-design-system-from-url` and `open-design-site-audit`, and remixable examples), a read-only `design-critic` agent, and the local Open Design MCP server. Copilot's own model writes the design files with its own file tools; the server supplies recipes, design-system tokens and craft rules, then renders, checks and exports what was built.

## Install

```
copilot plugin install open-design@awesome-copilot
```

Needs Node.js 18 or later on `PATH`. The first start downloads the pinned server (`@feimacode/open-design-agent-kit-mcp`) with `npx` and caches it.

Then ask for something in plain words, for example:

- "Make an A3 poster for our seed swap on Saturday, 10 to 2, at the community garden."
- "Turn docs/architecture.md into a 10-slide deck for the team review."
- "Take the design system from https://example.com and make a landing page with it."
- "Audit the landing page in site/index.html for contrast, type and spacing problems."

## What runs where

- **Everything runs on your computer.** The MCP server starts in your workspace and writes designs under `.open-design/` there, next to your code, so they can be reviewed and versioned like any other file.
- **No account, no API key, no telemetry.** Nothing you make is sent to us. The server reaches the network only for what you ask: fetching a website you name (design-system extraction, site audit) or fonts and assets a design uses. Sharing a design goes through a host you pick and your own tools.
- **Open source, MIT.** Source, issues and docs: https://github.com/feimacode/open-design-agent-kit. Privacy: https://github.com/feimacode/open-design-agent-kit/blob/main/docs/legal/privacy.md.

## How it differs from the Claude plugin

The skills and agent are generated from the same source as the Claude Code plugin by `scripts/build-copilot-plugin.mjs`, with the Claude-only passages (Claude artifacts and artifact sync) left out. The manifest follows Agent Plugins v1.0.0 (`plugin.json` and `mcp.json` at the plugin root).
