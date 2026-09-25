# @feimacode/open-design-agent-kit

**Build pro-grade design into Claude Code and Codex with one command.**

```bash
npx @feimacode/open-design-agent-kit init
```

That's the whole setup. `init` writes [Open Design](https://github.com/nexu-io/open-design)'s design skills straight into your project, in each agent's own native skill format, and registers the MCP server that goes with them. From then on, ask your agent for a deck, a landing page, a dashboard, or a prototype. It draws on 163 skills, 114 design templates, 152 brand design systems, and 167 remixable examples to build something that looks designed rather than generated.

- **No desktop app, no daemon, no account.** There's nothing running in the background, and the skills are plain files in your repo.
- **No API keys or model settings.** Your agent's own model does all the generation.
- **No marketplace add or manual copying.** It's modeled on `openspec init`: pick your agents, and it writes the files.
- **Shareable.** Commit the generated `.claude/skills/`, `.agents/skills/`, and MCP config, and everyone who clones the repo gets the same design skills.

## Quick start

```bash
npx @feimacode/open-design-agent-kit init
```

Prompts you to pick Claude Code, Codex, or both (both are pre-selected). For scripted/CI use, skip the prompt:

```bash
npx @feimacode/open-design-agent-kit init --tools all
# or a specific subset:
npx @feimacode/open-design-agent-kit init --tools claude
npx @feimacode/open-design-agent-kit init --tools codex
```

`init [path]` defaults to the current directory; pass a path to target a different project.

## What it writes

**Claude Code** (`--tools claude`):
- `.claude/skills/open-design/SKILL.md` — the overview skill (auto-triggers on design requests), plus one explicit-only skill per curated entry (`.claude/skills/<id>/SKILL.md`), same generated content as the [Claude Code plugin](https://github.com/feimacode/open-design-agent-kit#claude-code).
- `.mcp.json` — merges an `open-design` entry into `mcpServers`. Any other servers you already have configured are preserved; the file is created fresh if it doesn't exist yet.

**Codex** (`--tools codex`):
- `.agents/skills/open-design/` and one skill per curated entry (with a sibling `agents/openai.yaml` marking it explicit-only) — Codex's own skill-discovery convention.
- `.codex/config.toml` — created fresh with the `open-design` MCP server registration **only if the file doesn't already exist**. If it does, nothing is touched — the exact snippet to add by hand is printed instead, since no TOML library round-trips an existing file's comments/formatting losslessly.

Both hosts end up pointed at [`@feimacode/open-design-agent-kit-mcp`](https://www.npmjs.com/package/@feimacode/open-design-agent-kit-mcp) via `npx`, the same server the VS Code extension and Claude Code plugin use.

## Export and render (for scripts)

For pipelines that turn designs into files without an agent in the loop:

```bash
# Registered artifact → PNG(s) under its exports/ folder; prints each file path on stdout
npx @feimacode/open-design-agent-kit export .open-design/launch/launch.html --max-bytes 5000000
# Carousel / Xiaohongshu cards → one image per card
npx @feimacode/open-design-agent-kit export .open-design/tips/tips.html --selector "[data-od-card]"
# Deck → PowerPoint (one full-bleed image per slide), or PDF; --slides 1,3 for a subset
npx @feimacode/open-design-agent-kit export .open-design/pitch/pitch.html --format pptx
# HyperFrames composition → MP4 (runs `npx hyperframes render`; needs FFmpeg)
npx @feimacode/open-design-agent-kit render-video .open-design/promo --output .open-design/promo/exports/promo.mp4
```

`export` sizes the image from the artifact's source skill unless you pass `--width`/`--height`, and it also accepts `--scale`, `--format png|jpeg|pdf|pptx`, `--deck`, `--slides`, `--quality`, `--browser` and `--workspace`. It uses an installed Chrome, Edge or Chromium (or `OPEN_DESIGN_BROWSER_PATH`) and never downloads one. It exits non-zero on failure.

## Safe to re-run

Generated skill files are always fully refreshed — no stale entries left behind from a previous run. A skill directory *you* created by hand under the same location is never touched or deleted; only directories this tool generated itself get replaced. `.mcp.json` only ever has its own `open-design` entry updated; an existing `.codex/config.toml` is never rewritten at all.

## More

Full project layout and the other ways to use Open Design (VS Code extension, the Claude Code plugin marketplace, the standalone MCP server) live in the [main repo](https://github.com/feimacode/open-design-agent-kit).

## License

MIT — see [LICENSE](https://github.com/feimacode/open-design-agent-kit/blob/main/LICENSE). Skill/design-system/example content is vendored from [open-design](https://github.com/nexu-io/open-design), licensed Apache-2.0.
