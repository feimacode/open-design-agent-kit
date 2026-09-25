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
<img src="../../docs/screenshots/examples/dating-web.png" alt="Consumer dating-app dashboard, editorial typography" width="100%"/><br/>
<sub><b>"Design a dating-site dashboard — mutuals, match rate, a 30-day trend."</b></sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/examples/gamified-app.png" alt="Gamified habit-tracking mobile app, three phone frames" width="100%"/><br/>
<sub><b>"A habit-tracking app with daily quests and XP."</b></sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/examples/deck-swiss-international.png" alt="Board strategy deck, Swiss International style" width="100%"/><br/>
<sub><b>"A board-ready strategy deck, Swiss International style."</b></sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/examples/card-xiaohongshu.png" alt="Xiaohongshu-style swipeable knowledge card" width="100%"/><br/>
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

Or install the [Claude Code plugin](https://github.com/feimacode/open-design-agent-kit#ways-to-use-it) instead — it registers this server automatically and adds 23 curated `/open-design:*` skills on top.

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

See [docs/codex.md](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/codex.md) for the matching `SKILL.md` you can copy into `.agents/skills/open-design/`.

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

## Tools

| Tool | Does |
|---|---|
| `list_open_design_skills` | Browse skills, design templates, and remixable examples — filter by free-text query or an exact mode (`prototype`, `deck`, `design-system`, `image`, `video`, `template`, `utility`, `audio`). |
| `list_open_design_design_systems` | Browse the ~152 brand design systems — filter by query or category. |
| `prepare_open_design_brief` | Compose generation instructions from a skill, an optional design system, and your brief. Writes nothing — you author the file(s) yourself, then register them. |
| `register_open_design_artifact` | Validate an artifact you've written and record its manifest sidecar (`<entry>.artifact.json`). |
| `get_open_design_artifact` | Read back a registered artifact's manifest, entry content, and any open comments. |
| `set_active_design_system` | Set (or clear) the workspace's active design system, used automatically by `prepare_open_design_brief`. |
| `create_open_design_design_system` | Compose instructions to author a new `DESIGN.md`, optionally seeded from a reference URL's colors/fonts. |
| `port_open_design_artifact_to_app` | Compose instructions to port a finished artifact into your real app as idiomatic production code. |
| `remix_open_design_example` | Copy a curated example artifact into the workspace as a starting point, and get instructions to modify — not regenerate — it. |
| `export_open_design_artifact` | Render a registered artifact under its `exports/` folder: PNG/JPEG images (sized from the source skill, one per `[data-od-card]` card, re-encoded to fit `maxBytes`), a deck to `pptx` (one slide image per slide) or `pdf`, or a page to a vector `pdf`. Needs an installed Chrome/Edge/Chromium. |

It also serves an `open-design-social-post` prompt (takes an optional `brief` argument) that walks the agent through platform → size → skill → generate → export, including YouTube videos via the HyperFrames CLI.

JSON Schemas mirror the VS Code extension's `languageModelTools` 1:1 — see [`src/index.ts`](https://github.com/feimacode/open-design-agent-kit/blob/main/packages/mcp-server/src/index.ts) for the exact shapes.

## Configuration

| Environment variable | Default | |
|---|---|---|
| `OPEN_DESIGN_WORKSPACE_ROOT` | the launching process's `cwd` | Where artifacts get written and `.open-design/config.json` (active design system) is read/written. |
| `OPEN_DESIGN_OUTPUT_DIR` | `.open-design` | Workspace-relative directory new artifacts are suggested under. |
| `OPEN_DESIGN_BROWSER_PATH` | auto-detect | Chrome/Edge/Chromium executable for `export_open_design_artifact`. Auto-detection checks system installs, then the Playwright/Puppeteer caches. On a headless box: `npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer`. |

Both Claude Code and Codex already launch a local stdio MCP server with `cwd` set to the active project, so the default is usually right — the override exists for testing or an unusual host.

## What's not here

Live preview, inline comments, and WYSIWYG editing are webview-based and stay VS-Code-only — see the [VS Code extension](https://marketplace.visualstudio.com/items?itemName=feima.open-design-agent-kit) for those. This package is the headless skill/design-system/artifact workflow only.

## More

Full project layout, how content is vendored/synced, and development instructions live in the [main repo](https://github.com/feimacode/open-design-agent-kit).

## License

MIT — see [LICENSE](https://github.com/feimacode/open-design-agent-kit/blob/main/LICENSE). Skill/design-system/example content is vendored from [open-design](https://github.com/nexu-io/open-design), licensed Apache-2.0.
