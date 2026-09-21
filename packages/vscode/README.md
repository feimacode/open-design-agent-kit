# OpenDesign Agent Kit

Bring [OpenDesign](https://github.com/nexu-io/open-design)'s design skills, design systems, and remixable examples into GitHub Copilot Chat — no daemon, no MCP server, no separate app. Copilot's own selected model does the actual generation with its native file-editing tools; this extension supplies the content library and the instructions that steer it toward using that library well.

<img src="https://raw.githubusercontent.com/feimacode/open-design-agent-kit/main/docs/screenshots/vscode/gallery-grid.png" alt="OpenDesign Gallery Grid inside VS Code — searchable card grid of remixable examples with live thumbnails" width="100%"/>

## Why

Most AI-agent design output looks the same — generic gradients, default sans-serif stacks, cookie-cutter cards. OpenDesign's real value isn't a UI, it's a large, curated library of task-specific generation recipes, brand-accurate design systems, and hard-won craft rules (typography hierarchy, color, accessibility, anti-"AI slop" guidance) that keep output from reading as machine-generated. This extension makes that library available as Copilot Chat tools, so you get better output from the model you're already using — no new app, no new account.

## See what it builds

Six of the ~280 vendored skills and templates, rendered exactly as-is:

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
<img src="https://raw.githubusercontent.com/feimacode/open-design-agent-kit/main/docs/screenshots/examples/data-report.png" alt="Weekly metrics report with KPI cards and trend charts" width="100%"/><br/>
<sub><b>"Turn this CSV into a weekly metrics report."</b></sub>
</td>
</tr>
</table>

## What you get

- **A 277-entry skill catalog** — 163 skills + 114 design templates spanning prototypes, decks, dashboards, images, video, and more. Browse with `#od-skills` or just ask naturally; Copilot's agent mode calls `list_open_design_skills` on its own.
- **152 brand design systems** — `#od-design-systems`, or **OpenDesign: Browse Design Systems** in the Command Palette / status bar (fuzzy-searchable, grouped by ~22 categories). Picking one sets it as the workspace's active design system, so `prepare_open_design_brief` applies its tokens automatically from then on — say "use Starbucks" once per session, not on every request.
- **167 remixable examples**, browsable as a searchable card grid with live thumbnails (above) via **OpenDesign: Open Gallery Grid**, or the standalone OpenDesign activity-bar icon's tree view. Picking one copies it into your workspace and tells the model to modify it, not regenerate from scratch.
- **23 one-click slash commands** for the most-curated entries — `/guizang-ppt`, `/data-report`, `/deck-swiss-international`, and 20 more — plus `/open-design-generate` and `/open-design-skills` as general-purpose entry points, and `/open-design-custom-design-system` for inventing a brand-new one.
- **A live artifact preview** for generated HTML, opening automatically with three modes:

  **Comment** — hover to highlight, click an element to pin a note. "Send comments to chat" hands your selected notes to Copilot as a scoped edit instruction; comments persist as a plain, git-trackable `<entry>.html.comments.json` sidecar, never applied by a special engine:

  <img src="https://raw.githubusercontent.com/feimacode/open-design-agent-kit/main/docs/screenshots/vscode/comment-mode.png" alt="OpenDesign Artifact Preview in Comment mode — a pinned note on the trend chart, and an in-progress comment on the '1,842' KPI with alignment guides" width="100%"/>

  **Edit** (HTML only) — click an element for a panel with content fields that adapt to what you clicked (text / link href / image src+alt / raw HTML for containers) plus a curated style section (color, background, opacity, typography, border, per-side padding/margin) — written straight back to the file through a real `WorkspaceEdit`, so undo/redo is native:

  <img src="https://raw.githubusercontent.com/feimacode/open-design-agent-kit/main/docs/screenshots/vscode/edit-mode.png" alt="OpenDesign Artifact Preview in Edit mode — WYSIWYG style panel open on the '1,842' KPI value, with typography, border, padding, and margin fields" width="100%"/>

  **View** — just the rendered page, as-is. All three follow open-design's own actual visual design language (colors, radii, shadows, the Albert Sans variable font), not generic VS Code theming.
- **Custom design systems** beyond the bundled 152 — invent one from a brief (`create_open_design_design_system`, optionally seeded from a reference URL) or deterministically import an existing one from a file, pasted content, or a GitHub repo via **OpenDesign: Import Design System** — no model involved in the import path, original source always preserved.
- **Promote to app code** — once you're happy with an artifact, `port_open_design_artifact_to_app` (or the "Promote to App Code" button in the preview toolbar) ports it into your real, already-open app as idiomatic production code, grounded in an existing component you point it at or one it finds itself. A one-time action, not a live sync, and it deliberately doesn't wire up routing/navigation for you.
- **Grounds generation in your app** — when the open workspace looks like a real React/Vue/Next.js/Nuxt/Svelte/Angular/Astro/Solid project, generation instructions nudge the model to check a few of its real components/conventions first, so prototypes look more like they belong there.

## Requirements

- VS Code 1.138+
- [GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat) (extension dependency, installed automatically)

## Install

Search "OpenDesign Agent Kit" in the Extensions view, or install from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=feima.open-design-agent-kit).

## Quick start

Open Copilot Chat in agent mode and just ask:

> Make me a pitch deck for a Series A fintech startup, editorial style.

Copilot calls `list_open_design_skills` / `list_open_design_design_systems` on its own and writes the files. Or be explicit:

- `/guizang-ppt A 10-slide pitch deck for...` — one of the 23 curated one-click commands
- "Use the Starbucks design system, then build me a landing page" — sets it active, generates against it
- Click a card in **OpenDesign: Open Gallery Grid** to remix a real example instead of starting blank
- `#od-artifact` to have Copilot look at what's already registered in the workspace

## Settings

| Setting | Default | Description |
|---|---|---|
| `openDesign.outputDirectory` | `.open-design` | Workspace-relative directory new artifacts are suggested under, e.g. `.open-design/<slug>/index.html`. |
| `openDesign.activeDesignSystemId` | *(empty)* | The current active design system id. Set via the browse picker, the `set_active_design_system` tool, or by generating with an explicit id. |

## Commands

`OpenDesign: Browse Design Systems` · `OpenDesign: Import Design System` · `OpenDesign: Browse Gallery` · `OpenDesign: Open Gallery Grid` · `OpenDesign: Open Artifact Preview` (also on the right-click menu for `.html` files) — all reachable from the Command Palette.

## Under the hood

More detail than most people need, but here for the curious (and for anyone extending this).

### Preview, comments, and WYSIWYG editing

This is a from-scratch (not literally line-for-line ported) implementation of the same mechanism open-design's own product uses. Two things carry over exactly from upstream's actual behavior: comments are never "applied" by a special engine — they're gathered into a scoped instruction block and sent into a new chat message, prefilled but unsent, and the model edits the file with its own tools like any other request; and comments persist as a plain sidecar file next to the artifact, visible and git-trackable, no database.

The edit panel is modeled on open-design's own `ManualEditPanel.tsx`. Deliberately not ported: upstream's flex-layout controls (direction/justify/gap/align-items), its design-token reference strip (needs a codebase-scanning index this extension doesn't have), drag-to-reposition, and its own in-panel undo/redo history — VS Code's native document undo already covers every applied edit. Known limitation: relative asset paths (`<img src="assets/x.png">`) inside a previewed artifact may not resolve in the sandboxed preview iframe — the file on disk is unaffected.

### Gallery and Remix

There are three ways to browse and remix the same 167-example pool, for different situations:

- **QuickPick** (`OpenDesign: Browse Gallery`) — fastest, keyboard-driven; selecting an item remixes it directly, no separate preview/chat step.
- **Tree view** (the OpenDesign activity-bar icon → Gallery) — always one click away, grouped by category. Clicking an item, or its inline "Use in Chat" icon, populates Copilot Chat with a prefilled (still-editable, not-yet-sent) message naming the example — mirroring upstream open-design's own Gallery, where clicking a card populates the chat composer rather than doing anything immediately. A read-only preview and a direct Remix are both available separately via inline icons.
- **Grid view** (`OpenDesign: Open Gallery Grid`, screenshot above) — a searchable card grid (search box + category filter chips) with a live thumbnail per card, fetched lazily as it scrolls into view and rendered straight from this extension's bundled assets into `iframe.srcdoc` — never through a resource fetch the webview's browser engine would have to load from a URL.

All four entry points (the tool, QuickPick, tree, grid) call the same underlying remix logic, so behavior is identical regardless of which one you use.

### Visual design

The three webviews (Artifact Preview editor, Gallery grid, example preview panel) follow open-design's own actual visual design language, hand-transcribed from its real stylesheets: near-black/near-white "ink" buttons with a fully pill-shaped primary action; a lime-green brand accent (`#87ea5c`) reserved for active/selected states; a terracotta (`#d96a46`) teardrop shape for comment pins; frosted-glass floating panels; a named radius ladder from 2px to 16px; and the Albert Sans variable font (SIL OFL-licensed, vendored locally) at 600 weight. All three switch between open-design's own light/dark token sets based on VS Code's `vscode-dark`/`vscode-light` body classes, so they stay theme-aware without adopting the ambient editor theme's arbitrary colors.

## Not using VS Code?

The same skill/design-system/artifact tools are available as a standalone [MCP server](https://www.npmjs.com/package/@feimacode/open-design-agent-kit-mcp) for Claude Code, Codex, Cursor, and any other MCP-capable agent — see the [main repo](https://github.com/feimacode/open-design-agent-kit) for the full picture, including the Claude Code plugin and Codex setup.

## Content & attribution

Skills, design systems, craft rules, and examples are vendored from the official [open-design](https://github.com/nexu-io/open-design) repo (Apache-2.0), pinned to a tagged release — see the [main repo's Content section](https://github.com/feimacode/open-design-agent-kit#content) for how the sync works, and `packages/core/src/vendored/SOURCE.md` for exactly what code was ported vs. rewritten.

## License

MIT — see [LICENSE](https://github.com/feimacode/open-design-agent-kit/blob/main/LICENSE).
