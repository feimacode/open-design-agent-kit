# @feimacode/open-design-agent-kit

`npx @feimacode/open-design-agent-kit init` sets up [OpenDesign](https://github.com/nexu-io/open-design)'s Claude Code and/or Codex integration directly in your own project — no plugin marketplace add, no manual copying. Modeled on `openspec init`'s own pattern.

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

## Safe to re-run

Generated skill files are always fully refreshed — no stale entries left behind from a previous run. A skill directory *you* created by hand under the same location is never touched or deleted; only directories this tool generated itself get replaced. `.mcp.json` only ever has its own `open-design` entry updated; an existing `.codex/config.toml` is never rewritten at all.

## More

Full project layout and the other ways to use OpenDesign (VS Code extension, the Claude Code plugin marketplace, the standalone MCP server) live in the [main repo](https://github.com/feimacode/open-design-agent-kit).

## License

MIT — see [LICENSE](https://github.com/feimacode/open-design-agent-kit/blob/main/LICENSE). Skill/design-system/example content is vendored from [open-design](https://github.com/nexu-io/open-design), licensed Apache-2.0.
