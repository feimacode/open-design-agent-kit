# OpenDesign Agent Kit

Use [OpenDesign](https://github.com/nexu-io/open-design)'s design skills, design systems, and remixable examples directly from the coding agent you already have open — no new app, no daemon, no separate account. Whatever model you've already selected (Copilot Chat's, Claude Code's, Codex's) does the actual generation with its own native file-editing tools; this project supplies the content library and the bookkeeping around it.

**Why this exists:** OpenDesign itself is a full local-first desktop app — daemon, project database, its own model billing. Most of what makes it valuable day-to-day isn't the app, it's the *content*: 163 skills, 114 design templates, 152 brand design systems, 167 remixable example artifacts, and 11 craft docs (typography, color, accessibility, anti-"AI slop") that keep generated UI from reading as generated. This project vendors that content and re-implements the generation workflow around it as a thin, no-daemon layer that plugs into agents you already use — so you get the library without adopting a new tool.

Two ways in:

- **[VS Code extension](packages/vscode/README.md)** — native `languageModelTools` for GitHub Copilot Chat, plus a live artifact preview with comments and WYSIWYG editing.
- **[MCP server](packages/mcp-server/README.md)** — a standalone stdio server for Claude Code, Codex, Cursor, or any other MCP-capable agent: `npx @feimacode/open-design-agent-kit-mcp`. A ready-to-install [Claude Code plugin](#claude-code) sits on top of it.

Published under the **feimacode** entity; the VS Code extension's publisher id is `feima`.

## See what it builds

Six of the ~280 vendored skills and templates, rendered exactly as-is — no retouching, no cherry-picked crops:

<table>
<tr>
<td width="50%" valign="top">
<img src="docs/screenshots/examples/dating-web.png" alt="Consumer dating-app dashboard, editorial typography, left-rail navigation" width="100%"/><br/>
<sub><b>"Design a dating-site dashboard — mutuals, match rate, a 30-day trend."</b><br/>Editorial dashboard, left-rail nav, one restrained accent color.</sub>
</td>
<td width="50%" valign="top">
<img src="docs/screenshots/examples/gamified-app.png" alt="Gamified habit-tracking mobile app, three phone frames" width="100%"/><br/>
<sub><b>"A habit-tracking app with daily quests and XP."</b><br/>Three-screen mobile prototype, vivid quest tiles, level bar.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="docs/screenshots/examples/deck-swiss-international.png" alt="Board strategy deck, Swiss International style, cover slide" width="100%"/><br/>
<sub><b>"A board-ready strategy deck, Swiss International style."</b><br/>Decision-grade corporate deck — this is slide one of ten.</sub>
</td>
<td width="50%" valign="top">
<img src="docs/screenshots/examples/data-report.png" alt="Weekly metrics report with KPI cards and trend charts" width="100%"/><br/>
<sub><b>"Turn this CSV into a weekly metrics report."</b><br/>KPI cards, trend charts, and a raw-data table.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="docs/screenshots/examples/card-xiaohongshu.png" alt="Xiaohongshu-style swipeable knowledge card" width="100%"/><br/>
<sub><b>"5 tips, as a Xiaohongshu-style swipeable card carousel."</b><br/>Social-native knowledge cards, ready to export as images.</sub>
</td>
<td width="50%" valign="top">
<img src="docs/screenshots/examples/resume-modern.png" alt="Modern minimal resume, single A4 page" width="100%"/><br/>
<sub><b>"A modern, print-ready resume."</b><br/>Single A4 page, ready for PDF export.</sub>
</td>
</tr>
</table>

Every one of these started from `remix_open_design_example` (copy a real example, then modify it) or `prepare_open_design_brief` (compose instructions and generate from scratch) — the same two tools regardless of which surface below you use.

## Project structure

```
packages/
  core/           @feimacode/open-design-agent-kit-core — content parsing (ContentIndex),
                  generation-instruction composition, active-design-system resolution,
                  and vendored artifact-manifest logic. Framework-agnostic: no `vscode`
                  import anywhere in this package, verified file-by-file before the split.
  content/        @feimacode/open-design-agent-kit-content — the vendored skill/
                  design-system/craft/example content itself (~15MB, synced from
                  upstream open-design), consumed by every other package below. No code
                  beyond the sync/generation scripts; not published anywhere else.
  vscode/         the actual VS Code extension — package.json manifest, commands,
                  language model tools, webviews, and the vscode-specific
                  workspace-integration glue (active design system, artifact
                  writer) that DOES need `vscode` and so couldn't move into core.
  mcp-server/     @feimacode/open-design-agent-kit-mcp — a standalone MCP (Model
                  Context Protocol) stdio server exposing the same nine tools as the
                  VS Code extension, for any MCP-capable host (Claude Code, Codex,
                  Cursor, ...). No `vscode` dependency; bundled with esbuild into a
                  single self-contained binary.
  claude-plugin/  the Claude Code plugin: registers the MCP server above, plus one
                  overview skill and one explicit-only skill per curated OpenDesign
                  entry. Installable straight from this repo — see below.
  codex/          generates this repo's root-level .agents/skills/ — Codex CLI's own
                  skill-discovery convention — from the same curated entries and
                  overview skill packages/claude-plugin uses. Not an npm package;
                  its only output is the generated .agents/skills/ directory itself.
  cli/            @feimacode/open-design-agent-kit — `npx ... init`, a published CLI
                  that writes the same generated Claude/Codex skills directly into a
                  caller's own project (see "Ways to use it"), vendoring its own copy
                  of packages/claude-plugin/skills and .agents/skills so the published
                  package has no runtime dependency on either (both private, workspace-only).
```

All packages are `npm workspaces` members under the root `package.json`. `packages/core` has no build step of its own — both `packages/vscode` and `packages/mcp-server` resolve it directly from source, each via its own esbuild bundle (bundling TypeScript source directly is the one resolution path proven to work for a package with no compiled output of its own). `packages/content` is data, not code — it has no build step either, just its sync scripts.

## Ways to use it

- **VS Code (Copilot Chat)** — install the extension. Native `languageModelTools`, no daemon, no MCP server. See the [extension's own README](packages/vscode/README.md) for the full feature tour (gallery, live preview, comments, WYSIWYG editing).
- **Any MCP-capable agent** — run `npx @feimacode/open-design-agent-kit-mcp` (or add it to your agent's MCP config) to get the same nine tools over stdio. See the [MCP server's own README](packages/mcp-server/README.md) for the tool list and per-host config snippets. No editor, no preview/comments/WYSIWYG (those stay VS-Code-only, webview-based) — just the skill/design-system/artifact workflow. Active design system persists per project in `.open-design/config.json`; workspace root defaults to the launching process's `cwd`, overridable via `OPEN_DESIGN_WORKSPACE_ROOT`.
- **Claude Code** — add this repo as a plugin marketplace and install the `open-design` plugin:
  ```
  /plugin marketplace add <this-repo>
  /plugin install open-design
  ```
  This registers the MCP server above automatically, plus one overview skill (auto-triggers on design requests) and one explicit-only skill per curated entry (`/open-design:guizang-ppt`, etc. — `claude plugin validate` passes on both `packages/claude-plugin` and the root `marketplace.json`).
- **Codex CLI** — see [`docs/codex.md`](docs/codex.md): register the same MCP server (`codex mcp add open-design -- npx -y @feimacode/open-design-agent-kit-mcp`, or the `config.toml` equivalent), then copy this repo's generated `.agents/skills/` directory into your project (or point Codex at this repo directly) — it already has the overview skill plus one explicit-only skill per curated entry (via a sibling `agents/openai.yaml`), mirroring the Claude Code plugin's skill set in Codex's own discovery format.
- **Claude Code or Codex, without a marketplace add or manual copying** — `npx @feimacode/open-design-agent-kit init` ([`packages/cli`](packages/cli)), modeled directly on `openspec init`'s own pattern: an interactive (or `--tools claude,codex`/`--tools all` non-interactive) prompt that writes the same generated skills straight into your project's `.claude/skills/` and/or `.agents/skills/`, and registers the MCP server in `.mcp.json` (merged, not overwritten — any other servers you already have configured are preserved) and, for Codex, a fresh project-scoped `.codex/config.toml` if one doesn't already exist (an existing one is never rewritten — you get the exact snippet to add by hand instead, since no TOML library round-trips comments/formatting losslessly). Safe to re-run: generated skill files are always refreshed, a hand-authored skill of your own under the same directory is never touched.

## Core workflow

The same nine tools, and the same ideas, drive every surface above — the VS Code extension exposes them as `languageModelTools`, the MCP server exposes them as MCP tools, but the underlying logic (`packages/core`) is identical:

- **Browse, don't guess.** `list_open_design_skills` returns a merged catalog of open-design `skills/` (reusable task recipes), `design-templates/` (rendering-style entries), and `examples/` (167 actual rendered starting artifacts) — functionally interchangeable as a `skillId`, distinguished by a `source` field. Each id is namespaced by mode as `od:<mode>:<name>` (e.g. `od:deck:guizang-ppt`) — `prototype`, `deck`, `design-system`, `image`, `video`, `template`, `utility`, `audio` — and can be filtered by mode, an exact `source`, `remixableOnly` (only entries with a rendered starting artifact), or free-text query. The Claude Code plugin and Codex's `.agents/skills/` also ship a `references/remixable-examples.md` inside the `open-design` skill — the full example pool, grouped by mode, readable on demand with no tool call. `list_open_design_design_systems` does the same filtering approach for the ~152 bundled design systems, filterable by `category` (~22 of them, e.g. "E-Commerce & Retail") or query.
- **Compose, don't write.** `prepare_open_design_brief` combines a skill's workflow, an optional design system's tokens, universal craft rules, and your brief into an instructions string — it writes nothing. Your agent's own model authors the entry file (and any supporting files) with its normal file-editing tools, then calls `register_open_design_artifact`, which validates and writes only the manifest sidecar (`<entry>.artifact.json`).
- **Active design system.** One per workspace, persisted (as a VS Code setting, or `.open-design/config.json` for the MCP server). `prepare_open_design_brief` applies it automatically whenever `designSystemId` is omitted, and generating with an *explicit* id also makes that the new active one — say "use Starbucks" once per session, not on every request. `set_active_design_system` (pass no id to clear) or the VS Code browse picker change it.
- **Custom design systems** — two ways to add your own beyond the bundled ~152:
  - **Invent one from a brief** — `create_open_design_design_system`: give it a name, a brief, and optionally a reference URL. If a URL is given, a lightweight, no-daemon extraction (`packages/core/src/generation/brandExtraction.ts`) fetches the page plus up to 3 same-origin stylesheets and regex-harvests candidate colors, fonts, and a favicon/`og:image` as a rough starting point, not ground truth. Like every other content tool here, it only composes instructions — the model authors the actual `DESIGN.md`.
  - **Import one that already exists** (VS Code only today — `OpenDesign: Import Design System`) — from a file, pasted content, or a GitHub repo, written **deterministically**, no model involved: content that's already `DESIGN.md`-shaped is used verbatim, otherwise colors/fonts are regex-extracted the same way, always with the original source preserved in a "Source Reference" section.

  Either way, a written `DESIGN.md` becomes selectable immediately — no separate "register" step. Custom systems live at `<outputDirectory>/design-systems/<slug>/DESIGN.md`, ids prefixed `user:`.
- **Grounding in an existing app.** `prepare_open_design_brief` checks whether the workspace's `package.json` lists a recognizable framework (React, Vue, Next.js, Nuxt, Svelte, Angular, Astro, Solid) — a cheap signal, not a classifier. When detected, the composed instructions nudge the model to look at a few of the app's real components/conventions before generating, so the result looks more like the app it'll live next to. The artifact still lands as a standalone file, not a real app file — that's what promoting is for.
- **Promoting a prototype to real app code.** `port_open_design_artifact_to_app` composes instructions to port a finished artifact into the workspace's real app as idiomatic production code, not a copy-paste of the artifact's HTML — grounded in an existing, structurally-similar component you point it at (`referenceComponentPath`) or one it finds itself, written to a target you name or it suggests (`targetComponentPath`). Deliberately scoped as a one-time action (re-invoke manually if you keep iterating) and deliberately does **not** wire the new component into routing or navigation — real blast radius on the rest of the app, left as an explicit step for you to review.
- **Gallery and Remix.** `remix_open_design_example` copies one of ~167 vendored example artifacts (capped at 2MB each — 2 outliers excluded) into the workspace as a real starting file, then tells the model to modify it rather than generate from scratch. VS Code additionally exposes this as a browsable tree view and searchable card grid with live thumbnails — see the [extension README](packages/vscode/README.md) for that part.

VS Code layers UI-only extras on top of this shared core — a live artifact preview with comment and WYSIWYG-edit modes, a status bar item, an activity-bar gallery, and open-design's own visual design language applied to all three webviews. Those are genuinely VS-Code-specific (webview-based) and documented in full in [`packages/vscode/README.md`](packages/vscode/README.md).

## Content

Skills, design templates, design systems, and remixable examples are vendored from [open-design](https://github.com/nexu-io/open-design) into `packages/content/assets/open-design/` at build time via `npm run sync-content` (see `packages/content/scripts/sync-open-design-content.mjs`), not read live at runtime — every consuming package works standalone. By default this clones a shallow, sparse checkout of the **official public repo, pinned to a tagged release** (`DEFAULT_OPEN_DESIGN_REF`, currently `open-design-v0.22.2`) — not `main` — so the sync is reproducible for anyone who runs it, not just a machine with a specific local checkout, and doesn't silently pull different content depending on when it's run. To pick up a newer upstream release: check the [tags page](https://github.com/nexu-io/open-design/tags) for the latest `open-design-vX.Y.Z`, bump the constant, re-run `npm run sync-content`, and review the diff before committing.

`packages/content` is the single real sync target — `packages/mcp-server` reads it directly, but `packages/vscode` needs its own physical copy for VS Code's `.vsix` packaging (a packaged extension can't reach a sibling npm workspace package), so `npm run sync-content` also mirrors it into `packages/vscode/assets/open-design/` and regenerates `packages/vscode/prompts/featured/` plus the corresponding slice of `contributes.chatPromptFiles`, and mirrors the same curated-entry set into `packages/claude-plugin/skills/` as individual Claude Code skills. `npm run lint` guards all of this against drift: the upstream pin vs. `packages/content`'s own `MANIFEST.json` (`packages/content/scripts/check-content-sync.mjs`), the VS Code mirror vs. `packages/content` (`packages/vscode/scripts/check-content-mirror.mjs`), and the generated Claude skills vs. the current curated set (`packages/claude-plugin/scripts/check-skills-sync.mjs`) — each fails clearly if something was regenerated without also being re-synced/committed downstream. Set `OPEN_DESIGN_SRC` to a local directory to bypass cloning entirely (e.g. for testing against a modified fork). The vendored content itself (1,100+ files, ~15MB) **is committed to the repo**, not gitignored: unlike `node_modules`/`dist`/`out` (regenerable from public sources), it's this project's core data, and while it *can* be regenerated by anyone via `npm run sync-content`, checking it in means the repo is immediately usable without that step. Don't hand-edit anything under `prompts/featured/` or `packages/claude-plugin/skills/` (other than `skills/open-design/`) — they're overwritten on every sync.

## Development

All commands run from the repo root; they delegate to the relevant workspace package (see [Project structure](#project-structure)):

```bash
npm install
npm run sync-content   # populates packages/content/assets/open-design/ from a pinned tag of the official open-design repo,
                        # mirrors it into packages/vscode/ and packages/claude-plugin/skills/
npm run compile        # builds packages/vscode/dist/extension.js + dist/webview/main.js, and packages/mcp-server/out/index.js
npm run test:unit      # runs packages/core's (89) and packages/mcp-server's (10) test suites
```

`npm run typecheck` runs every workspace: `packages/core` and `packages/mcp-server` (plain Node, no DOM lib), `packages/vscode` (Node extension-host code, plus a separate `tsc` pass for `packages/vscode/src/webview` — browser code, DOM lib, no Node types) — since the webview client and the extension host run in fundamentally different JS environments.

For the VS Code extension: press F5 (or run the "Run Extension" launch config) to open an Extension Development Host and try it in Copilot Chat.

For the MCP server standalone: `npm run compile --workspace=@feimacode/open-design-agent-kit-mcp` then run `node packages/mcp-server/out/index.js` (it speaks MCP over stdio — point an MCP inspector or client at it, or register it with an agent as described in [Ways to use it](#ways-to-use-it)).

For the Claude Code plugin: `claude --plugin-dir ./packages/claude-plugin` to load it locally without installing; `claude plugin validate ./packages/claude-plugin` (and `claude plugin validate .` for the marketplace manifest) to check the manifests without a full session.

## Releasing the VS Code extension

Two GitHub Actions workflows handle `packages/vscode`'s release lifecycle (the other packages have no release automation yet):

1. **[Release](.github/workflows/release.yml)** — triggered by pushing a `vX.Y.Z` tag (or manually via `workflow_dispatch`). Runs `typecheck`/`lint`/`test:unit`, packages `packages/vscode` into a `.vsix` with `vsce package --no-dependencies` (safe here because esbuild already inlines every runtime dependency into `dist/extension.js`; without that flag, `vsce` walks the hoisted workspace `node_modules` and sweeps in every sibling package), and attaches the `.vsix` + a SHA-256 checksum to a GitHub Release. The tag must match `packages/vscode/package.json`'s `version`.
2. **[Publish to Marketplace](.github/workflows/publish-marketplace.yml)** — manual-only, requires typing `PUBLISH` to confirm. Downloads the already-built `.vsix` from an existing GitHub Release (created by the workflow above), verifies its checksum, and runs `vsce publish --packagePath` using a `VSCE_PAT` repository secret.

They're deliberately split so a tag push alone never reaches the Marketplace — publishing is a separate, explicit, confirmed action against an artifact that's already been built and checksummed.

To cut a release: bump `packages/vscode/package.json`'s `version`, commit, tag as `vX.Y.Z`, push the tag. Then, once the Release workflow finishes, run "Publish to Marketplace" manually with the same version.

## Provenance

Two files under `packages/core/src/vendored/` are adapted from open-design (Apache-2.0). See `packages/core/src/vendored/SOURCE.md` for exactly what was ported verbatim, what was adapted, and what was deliberately rewritten from scratch instead of ported.

## License

MIT — see [LICENSE](LICENSE). Skill/design-system/craft/example content is vendored from [open-design](https://github.com/nexu-io/open-design), licensed Apache-2.0; see [Provenance](#provenance) above for which files that applies to.
