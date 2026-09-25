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

- **Claude Code:** skills in `.claude/skills/`, and an `open-design` entry merged into `.mcp.json`. Other servers are kept.
- **Codex:** the same skills in `.agents/skills/`, and `.codex/config.toml` if you don't have one yet. If you do, the snippet to add is printed instead.

Both point at [`@feimacode/open-design-agent-kit-mcp`](https://www.npmjs.com/package/@feimacode/open-design-agent-kit-mcp). The details are in the [`init` reference](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/reference/cli.md#init).

## Export and render (for scripts)

```bash
npx @feimacode/open-design-agent-kit export .open-design/launch/launch.html --max-bytes 5000000
npx @feimacode/open-design-agent-kit export .open-design/pitch/pitch.html --format pptx
npx @feimacode/open-design-agent-kit render-video .open-design/promo --output .open-design/promo/exports/promo.mp4
```

Every option is in the [CLI reference](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/reference/cli.md), and a full scripted setup is in [Social media pipeline](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/automation/social-pipeline.md).

## Safe to re-run

Generated skill files are always fully refreshed — no stale entries left behind from a previous run. A skill directory *you* created by hand under the same location is never touched or deleted; only directories this tool generated itself get replaced. `.mcp.json` only ever has its own `open-design` entry updated; an existing `.codex/config.toml` is never rewritten at all.

## More

[Documentation](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/README.md): getting started for [Claude Code](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/getting-started/claude-code.md) and [Codex](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/getting-started/codex.md), guides, and [troubleshooting](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/troubleshooting.md).

## License

MIT — see [LICENSE](https://github.com/feimacode/open-design-agent-kit/blob/main/LICENSE). Skill/design-system/example content is vendored from [open-design](https://github.com/nexu-io/open-design), licensed Apache-2.0.
