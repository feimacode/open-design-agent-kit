# Codex CLI

Open Design works in Codex through two native pieces: the **MCP server** (the tools) and **skills** in Codex's own `.agents/skills/` format (when and how to use them).

## Before you start

- Codex CLI with MCP support.
- Node.js 18 or later (the MCP server runs with `npx`).
- For exporting images, PDFs or PowerPoint: an installed Chrome, Edge or Chromium. For video: FFmpeg. See [Troubleshooting](../troubleshooting.md) if either is missing.

## Set up a project (recommended)

From your project's root:

```bash
npx @feimacode/open-design-agent-kit init --tools codex
```

This writes the skills into `.agents/skills/` and creates `.codex/config.toml` with the MCP server registered. If `.codex/config.toml` already exists it is left untouched, and `init` prints the snippet to add yourself. Re-running `init` refreshes the generated skills and never touches a skill you wrote by hand. See [`init`](../reference/cli.md#init).

## Set up by hand

1. Register the MCP server, either with a command:

   ```bash
   codex mcp add open-design -- npx -y @feimacode/open-design-agent-kit-mcp
   ```

   or in `~/.codex/config.toml` (all projects) or `.codex/config.toml` (one project):

   ```toml
   [mcp_servers.open-design]
   command = "npx"
   args = ["-y", "@feimacode/open-design-agent-kit-mcp"]
   ```

   Run `codex mcp list` to confirm it connected. The server's [tools](../reference/tools.md) then show up like any other MCP tool.

2. Copy this repository's generated [`.agents/skills/`](https://github.com/feimacode/open-design-agent-kit/tree/main/.agents/skills) folder into your project. It contains:
   - `open-design/`: the overview skill. It triggers on any design request and walks the agent through the tools.
   - `open-design-social-post/`: the social-post workflow, which also triggers by itself on requests to make something for social media.
   - One folder per curated entry (e.g. `guizang-ppt/`, `card-twitter/`). These are explicit-only: each has an `agents/openai.yaml` with `policy.allow_implicit_invocation: false`, so they run only when you pick them.

The server never edits `~/.codex/config.toml` or your `.agents/skills/` itself.

## Your first design

Ask in plain words:

> Make me a one-page landing page for a coffee subscription, warm and editorial.

Codex loads the `open-design` skill, calls `list_open_design_skills` to pick a recipe, `prepare_open_design_brief` for instructions, writes the HTML with its own file tools, and calls `register_open_design_artifact`. The result lands under `.open-design/<name>/`.

To run a curated recipe directly, pick its skill (for example `guizang-ppt` for an editorial slide deck) and add your brief. See [Prompts and commands](../reference/prompts-and-commands.md#codex) for the full list.

## Pick a design system

Designs follow the workspace's **active design system**. Set it once:

> Use the Stripe design system from now on.

It stays until you switch ("switch to Apple") or clear it ("stop using a design system"). It's stored in `.open-design/config.json`. See [Design systems](../guides/design-systems.md#specify-and-switch).

## Next

- [Generate a design](../guides/generate-a-design.md)
- [Social media posts](../guides/social-posts.md) and [Export decks and PDFs](../guides/export-decks.md)
- Codex's extensibility surface changes quickly. If something here doesn't match, check Codex's own docs at `https://developers.openai.com/codex`, and [open an issue](https://github.com/feimacode/open-design-agent-kit/issues).
