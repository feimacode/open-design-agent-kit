# @feimacode/open-design-agent-kit-mcp

**Pro-grade design for any MCP-capable coding agent. One command, nothing else to run.**

This is [Open Design](https://github.com/nexu-io/open-design)'s design library and workflow, packaged as a plain stdio MCP server for Claude Code, Codex, Cursor, and anything else that speaks MCP. It includes 163 skills, 114 design templates, 152 brand design systems, and 167 remixable examples. Ask your agent for a deck, a landing page, a dashboard, or a prototype, and it builds one that looks designed rather than generated, as real files in your project.

- **No desktop app, no daemon, no account.** Your agent launches the server on demand over stdio, and it exits when the agent does.
- **No API keys or model settings.** The server never calls a model. Your agent's own selected model does the generation with its normal file-editing tools. The server supplies the library and handles the bookkeeping (manifests, active design system).
- **Zero config.** It works in the current project out of the box. The active design system is remembered in `.open-design/config.json`.
- **Plain files.** Everything it produces is ordinary HTML plus small JSON sidecars in your repo, so you can diff, review, and commit it.

It has the same core tools and the same content as the [VS Code extension](https://marketplace.visualstudio.com/items?itemName=feima.open-design-agent-kit), over MCP instead of native `languageModelTools`.

## See what it builds

Four of the ~280 vendored skills and templates, rendered exactly as-is:

<table>
<tr>
<td width="50%" valign="top">
<img src="https://raw.githubusercontent.com/feimacode/open-design-agent-kit/main/docs/screenshots/examples/dating-web.png" alt="Consumer dating-app dashboard, editorial typography" width="100%"/><br/>
<sub><b>"Design a dating-site dashboard — mutuals, match rate, a 30-day trend."</b></sub>
</td>
<td width="50%" valign="top">
<img src="https://raw.githubusercontent.com/feimacode/open-design-agent-kit/main/docs/screenshots/examples/gamified-app.png" alt="Gamified habit-tracking mobile app, three phone frames" width="100%"/><br/>
<sub><b>"A habit-tracking app with daily quests and XP."</b></sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="https://raw.githubusercontent.com/feimacode/open-design-agent-kit/main/docs/screenshots/examples/deck-swiss-international.png" alt="Board strategy deck, Swiss International style" width="100%"/><br/>
<sub><b>"A board-ready strategy deck, Swiss International style."</b></sub>
</td>
<td width="50%" valign="top">
<img src="https://raw.githubusercontent.com/feimacode/open-design-agent-kit/main/docs/screenshots/examples/card-xiaohongshu.png" alt="Xiaohongshu-style swipeable knowledge card" width="100%"/><br/>
<sub><b>"5 tips, as a Xiaohongshu-style swipeable card carousel."</b></sub>
</td>
</tr>
</table>

Each one started from `remix_open_design_example` (copy a real example, then modify it) or `prepare_open_design_brief` (compose instructions and generate from scratch) — call `list_open_design_skills` to browse the other ~276.

## Quick start

```bash
npx -y @feimacode/open-design-agent-kit-mcp
```

That's a plain stdio MCP server. Register it with your agent:

**Claude Code**

```bash
claude mcp add open-design -- npx -y @feimacode/open-design-agent-kit-mcp
```

Or install the [Claude Code plugin](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/getting-started/claude-code.md) instead: it registers this server automatically and adds the Open Design skills on top.

**Codex CLI**

```bash
codex mcp add open-design -- npx -y @feimacode/open-design-agent-kit-mcp
```

or by hand in `~/.codex/config.toml`:

```toml
[mcp_servers.open-design]
command = "npx"
args = ["-y", "@feimacode/open-design-agent-kit-mcp"]
```

Or run `npx @feimacode/open-design-agent-kit init --tools codex` to add the matching skills too. See [Codex setup](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/getting-started/codex.md).

**Any other MCP host** — the generic config shape:

```json
{
  "mcpServers": {
    "open-design": {
      "command": "npx",
      "args": ["-y", "@feimacode/open-design-agent-kit-mcp"]
    }
  }
}
```

## Tools and prompts

11 tools, the same as the VS Code extension's (minus community sharing):

- **Catalog:** `list_open_design_skills`, `list_open_design_design_systems`
- **Generating:** `prepare_open_design_brief`, `register_open_design_artifact`, `get_open_design_artifact`, `remix_open_design_example`
- **Design systems:** `set_active_design_system`, `create_open_design_design_system`
- **Beyond the prototype:** `port_open_design_artifact_to_app`, `pull_open_design_figma_frame`
- **Export:** `export_open_design_artifact` (PNG/JPEG, deck PowerPoint/PDF, page PDF; needs an installed Chrome, Edge or Chromium)

MCP prompts: `open-design-social-post`, and one `od-<mode>-<id>` prompt per remixable example.

Arguments, results and errors: [tools reference](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/reference/tools.md). Prompts: [prompts and commands](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/reference/prompts-and-commands.md#claude-code).

## Configuration

Zero config by default. The server works in the directory your agent starts it in. Optional environment variables (`OPEN_DESIGN_WORKSPACE_ROOT`, `OPEN_DESIGN_OUTPUT_DIR`, `OPEN_DESIGN_FIGMA_TOKEN`, `OPEN_DESIGN_BROWSER_PATH`) are described in [settings and environment variables](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/reference/settings-and-env.md#environment-variables).

## What's not here

Live preview, inline comments, and WYSIWYG editing are webview-based and stay VS-Code-only — see the [VS Code extension](https://marketplace.visualstudio.com/items?itemName=feima.open-design-agent-kit) for those. This package is the headless skill/design-system/artifact workflow only.

## More

[Documentation](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/README.md) · [Troubleshooting](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/troubleshooting.md) · [Social media posts](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/social-posts.md) · [Export decks and PDFs](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/export-decks.md)

## License

MIT — see [LICENSE](https://github.com/feimacode/open-design-agent-kit/blob/main/LICENSE). Skill/design-system/example content is vendored from [open-design](https://github.com/nexu-io/open-design), licensed Apache-2.0.
