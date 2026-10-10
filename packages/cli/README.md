# @feimacode/open-design-agent-kit

**Give Claude Code and Codex the skills to design, not just code.**

Run one command in your project and your agent can build decks, landing pages, dashboards, prototypes, social posts, and videos that look designed rather than generated. It works by writing [Open Design](https://github.com/nexu-io/open-design)'s skills straight into your repo, in each agent's own native skill format, plus the MCP server that goes with them — drawing on 163 skills, 114 design templates, 152 brand design systems, and 167 remixable examples so your agent has real design taste to work from instead of guessing.

- **No desktop app, no daemon, no account.** Nothing runs in the background — the skills are plain files in your repo.
- **No API keys or model settings.** Your agent's own model does all the generation.
- **No marketplace add or manual copying.** Modeled on `openspec init`: pick your agents, and it writes the files.
- **Shareable.** Commit the generated `.claude/skills/`, `.agents/skills/`, and MCP config, and everyone who clones the repo gets the same design skills.

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

## Install

Nothing to install ahead of time — run it with `npx` (requires Node.js 18+):

```bash
npx @feimacode/open-design-agent-kit init
```

That's the whole setup: it prompts you to pick Claude Code, Codex, or both (both are pre-selected), then writes the skills and registers the MCP server.

## Use it

### 1. Set up your project

```bash
npx @feimacode/open-design-agent-kit init
```

For scripted or CI use, skip the interactive prompt:

```bash
npx @feimacode/open-design-agent-kit init --tools all
# or a specific subset:
npx @feimacode/open-design-agent-kit init --tools claude
npx @feimacode/open-design-agent-kit init --tools codex
```

`init [path]` defaults to the current directory; pass a path to target a different project.

What it writes:

- **Claude Code:** skills in `.claude/skills/`, and an `open-design` entry merged into `.mcp.json`. Other servers are kept.
- **Codex:** the same skills in `.agents/skills/`, and `.codex/config.toml` if you don't have one yet. If you do, the snippet to add is printed instead.

Both point at [`@feimacode/open-design-agent-kit-mcp`](https://www.npmjs.com/package/@feimacode/open-design-agent-kit-mcp). Full details are in the [`init` reference](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/reference/cli.md#init).

It's safe to re-run: generated skill files are always fully refreshed, with no stale entries left behind from a previous run. A skill directory *you* created by hand under the same location is never touched or deleted — only directories this tool generated itself get replaced. `.mcp.json` only ever has its own `open-design` entry updated; an existing `.codex/config.toml` is never rewritten at all.

### 2. Ask your agent to design something

Once `init` has run, just talk to your agent — no further CLI commands needed. Try prompts like:

- "Build a landing page for [product]"
- "Make a pitch deck for [idea]"
- "Design a dashboard for [data]"
- "Create a social card announcing [thing]"

The agent picks a matching skill and produces a real design, saved into your project as plain HTML/JSX/CSS you can keep editing.

### 3. Export, check or render from a script (optional)

Once an artifact exists, export it (image, PDF, PowerPoint, animation, standalone HTML…), check how it renders, or render a HyperFrames composition to video — no agent needed:

```bash
npx @feimacode/open-design-agent-kit export .open-design/launch/launch.html --max-bytes 5000000
npx @feimacode/open-design-agent-kit export .open-design/pitch/pitch.html --format pptx
npx @feimacode/open-design-agent-kit check .open-design/landing/landing.html --fail-on error
npx @feimacode/open-design-agent-kit render-video .open-design/promo --output .open-design/promo/exports/promo.mp4
```

Every option is in the [CLI reference](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/reference/cli.md), and a full scripted setup is in [Social media pipeline](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/automation/social-pipeline.md).

## Learn more

[Documentation](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/README.md): getting started for [Claude Code](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/getting-started/claude-code.md) and [Codex](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/getting-started/codex.md), guides, and [troubleshooting](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/troubleshooting.md).

## License

MIT — see [LICENSE](https://github.com/feimacode/open-design-agent-kit/blob/main/LICENSE). Skill/design-system/example content is vendored from [open-design](https://github.com/nexu-io/open-design), licensed Apache-2.0.
