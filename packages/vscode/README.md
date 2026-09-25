# Open Design Agent Kit

**Pro-grade UI design, built right into GitHub Copilot Chat.**

Ask Copilot for a pitch deck, a landing page, a dashboard, or a mobile prototype, and get something that looks designed, not generated. Agent Kit gives Copilot [Open Design](https://github.com/nexu-io/open-design)'s library: 270+ design skills, 150+ brand design systems, 160+ remixable examples, and the craft rules that keep output from looking like AI slop. Copilot's own model then builds the result as real files in your workspace.

**No desktop app. No daemon. No MCP server. No API keys, no model settings, no extra account.** Install it and ask.

<img src="https://raw.githubusercontent.com/feimacode/open-design-agent-kit/main/docs/screenshots/vscode/gallery-grid.png" alt="Open Design Gallery Grid inside VS Code — searchable card grid of remixable examples with live thumbnails" width="100%"/>

## Built into Copilot, not bolted on

Most design tools for AI make you leave your editor: another app to install, a background service to keep running, another model provider to configure and pay for. This extension goes the other way. Everything plugs into what VS Code and Copilot already have:

- **Native Copilot tools.** The library ships as VS Code `languageModelTools`, chat instructions, and `/` slash commands. Copilot's agent mode finds and calls them on its own, so you don't need to learn anything new. Just describe what you want.
- **Your model, your subscription.** Generation uses whichever model you already picked in Copilot Chat. There's no second provider, API key, or bill.
- **Nothing running in the background.** No daemon, no local server, no ports, no MCP config. The extension is data plus instructions; Copilot does the work with its own file-editing tools.
- **Zero setup.** Nothing to configure before your first prompt. The one piece of state that matters, your active design system, is remembered per workspace once you pick it.
- **Real files, in your repo.** Artifacts are plain HTML on disk, with a small JSON manifest beside them. Diff them, review them, commit them, open them in a browser. There's no project database to export from.
- **Stays in your flow.** Preview, comment, edit, and promote to production code without leaving the editor or the chat you're already in.

## See what it builds

Six of the ~280 bundled skills and templates, rendered exactly as-is:

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

- **A 277-entry skill catalog.** 163 skills and 114 design templates covering prototypes, decks, dashboards, images, video, and more. Browse with `#od-skills` or just ask; Copilot's agent mode calls `list_open_design_skills` on its own.
- **152 brand design systems.** Use `#od-design-systems`, or **Open Design: Browse Design Systems** in the Command Palette or status bar (fuzzy-searchable, grouped into ~22 categories). Picking one makes it the workspace's active design system, and `prepare_open_design_brief` applies its tokens automatically from then on. Say "use Starbucks" once per session, not on every request.
- **167 remixable examples,** browsable as a searchable card grid with live thumbnails (above) via **Open Design: Open Gallery Grid**, or from the Open Design activity-bar icon. Picking one copies it into your workspace and tells the model to modify it instead of starting from scratch.
- **Community designs.** An optional, growing catalog of community-contributed designs from [awesome-open-design](https://github.com/feimacode/awesome-open-design) appears next to the built-in gallery. When you're proud of something you built, `#od-share-to-community` packages it up and opens a PR to share it back. It always checks with you before publishing.
- **23 one-click slash commands** for the most-curated entries: `/guizang-ppt`, `/data-report`, `/deck-swiss-international`, and 20 more. There's also `/open-design-generate` and `/open-design-skills` as general entry points, and `/open-design-custom-design-system` for inventing a new one.
- **Multi-screen collections.** Generate a whole flow (onboarding, checkout, a set of app screens) as one collection. The **Collections** view lists each collection's screens, and the preview has next/previous navigation between them.
- **Figma, both directions.** Paste a Figma frame link and `#od-pull-figma-frame` rebuilds it as code. Going the other way, the preview's Figma button exports any artifact as editable Figma layers through the bundled import plugin.
- **A live artifact preview** that opens automatically for generated HTML, with three modes:

  **Comment**: hover to highlight, then click an element to pin a note. "Send comments to chat" hands the notes you select to Copilot as a scoped edit request. Comments are saved as a plain, git-trackable `<entry>.html.comments.json` sidecar.

  <img src="https://raw.githubusercontent.com/feimacode/open-design-agent-kit/main/docs/screenshots/vscode/comment-mode.png" alt="Open Design Artifact Preview in Comment mode — a pinned note on the trend chart, and an in-progress comment on the '1,842' KPI with alignment guides" width="100%"/>

  **Edit** (HTML only): click an element to open a panel. Its content fields adapt to what you clicked (text, link href, image src and alt, or raw HTML for containers), and a style section covers color, background, opacity, typography, border, and per-side padding and margin. Changes are written straight back to the file through a real `WorkspaceEdit`, so undo and redo work as usual.

  <img src="https://raw.githubusercontent.com/feimacode/open-design-agent-kit/main/docs/screenshots/vscode/edit-mode.png" alt="Open Design Artifact Preview in Edit mode — WYSIWYG style panel open on the '1,842' KPI value, with typography, border, padding, and margin fields" width="100%"/>

  **View**: just the rendered page.
- **Your own design systems** beyond the bundled 152. Invent one from a brief (`create_open_design_design_system`, optionally seeded from a reference URL), or import an existing one from a file, pasted content, or a GitHub repo with **Open Design: Import Design System**. Import doesn't use a model, and the original source is always kept.
- **From prototype to production.** When you're happy with an artifact, `port_open_design_artifact_to_app` (or the "Promote to App Code" button in the preview toolbar) ports it into your real app as idiomatic production code, modeled on an existing component you point to or one it finds itself. It runs once rather than syncing, and it leaves routing and navigation for you to wire up.
- **Social posts, ready to upload.** `/open-design-social-post` asks where you're posting (X, Instagram, LinkedIn, Xiaohongshu, Stories/Reels, a YouTube thumbnail or video), picks the right size and skill, and exports PNG/JPEG files into the artifact's `exports/` folder with `export_open_design_artifact` (`#od-export`). Carousels come out as one image per card, and files over the platform's size limit are re-encoded as JPEG. YouTube videos render to MP4 with the HyperFrames CLI.
- **Decks to PowerPoint and PDF.** Ask Copilot to "export this deck as PowerPoint" (or PDF) and `export_open_design_artifact` writes a `.pptx` with one full-bleed image per slide (pixel-perfect, not editable text) or a one-page-per-slide `.pdf`. Ordinary pages export to a vector PDF with selectable text.
- **Grounded in your codebase.** When the workspace looks like a React, Vue, Next.js, Nuxt, Svelte, Angular, Astro, or Solid project, the instructions have the model look at a few of your real components first, so prototypes look like they belong in your app.

## Requirements

- VS Code 1.138+
- [GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat), or any other chat agent that can call VS Code's built-in language model tools. The Gallery, Collections, and preview work without one; generation needs a chat agent.
- For exporting to PNG/JPEG/PDF/PPTX: an installed Chrome, Edge, or Chromium (found automatically; nothing is downloaded). On Linux, install an emoji font (e.g. `fonts-noto-color-emoji`) if your designs use emoji.
- For rendering YouTube/HyperFrames videos: Node and [FFmpeg](https://ffmpeg.org/).

## Install

Search "Open Design Agent Kit" in the Extensions view, or install from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=feima.open-design-agent-kit). That's the whole setup.

## Quick start

Open Copilot Chat in agent mode and just ask:

> Make me a pitch deck for a Series A fintech startup, editorial style.

Copilot calls `list_open_design_skills` and `list_open_design_design_systems` on its own and writes the files. Or be explicit:

- `/guizang-ppt A 10-slide pitch deck for...` runs one of the 27 curated one-click commands
- `/open-design-social-post An X post announcing our v2 launch` designs the post and exports the PNG
- "Use the Starbucks design system, then build me a landing page" sets it active and generates against it
- Click a card in **Open Design: Open Gallery Grid** to remix a real example instead of starting blank
- "Turn this Figma frame into code: <link>" rebuilds a frame (after **Open Design: Set Figma Access Token**)
- `#od-artifact` has Copilot look at what's already registered in the workspace

## Settings

None are required. These are here in case you want to change the defaults:

| Setting | Default | Description |
|---|---|---|
| `openDesign.outputDirectory` | `.open-design` | Workspace-relative directory new artifacts are suggested under, e.g. `.open-design/<slug>/index.html`. |
| `openDesign.activeDesignSystemId` | *(empty)* | The current active design system id. Set via the browse picker, the `set_active_design_system` tool, or by generating with an explicit id. |
| `openDesign.communityContentEnabled` | `true` | Show community-contributed designs from awesome-open-design next to the built-in gallery. This content isn't reviewed by the extension author. |
| `openDesign.communityContentRef` | `v0.1.0` | The awesome-open-design tag to fetch community designs from. |
| `openDesign.export.browserPath` | *(empty)* | Chrome/Edge/Chromium executable for PNG/JPEG export. Empty means auto-detect (or the `OPEN_DESIGN_BROWSER_PATH` environment variable). |

## Commands

`Open Design: Browse Design Systems` · `Open Design: Import Design System` · `Open Design: Browse Gallery` · `Open Design: Open Gallery Grid` · `Open Design: Open Artifact Preview` (also on the right-click menu for `.html` files) · `Open Design: Sync Community Designs` · `Open Design: Set Figma Access Token` · `Open Design: Show Figma Import Plugin Folder`. All are in the Command Palette.

## Under the hood

More detail than most people need, but here for the curious (and for anyone extending this).

### Preview, comments, and WYSIWYG editing

This is a from-scratch (not literally line-for-line ported) implementation of the same mechanism open-design's own product uses. Two things carry over exactly from upstream's actual behavior: comments are never "applied" by a special engine — they're gathered into a scoped instruction block and sent into a new chat message, prefilled but unsent, and the model edits the file with its own tools like any other request; and comments persist as a plain sidecar file next to the artifact, visible and git-trackable, no database.

The edit panel is modeled on open-design's own `ManualEditPanel.tsx`. Deliberately not ported: upstream's flex-layout controls (direction/justify/gap/align-items), its design-token reference strip (needs a codebase-scanning index this extension doesn't have), drag-to-reposition, and its own in-panel undo/redo history — VS Code's native document undo already covers every applied edit. Known limitation: relative asset paths (`<img src="assets/x.png">`) inside a previewed artifact may not resolve in the sandboxed preview iframe — the file on disk is unaffected.

### Gallery and Remix

There are three ways to browse and remix the same 167-example pool, for different situations:

- **QuickPick** (`Open Design: Browse Gallery`) — fastest, keyboard-driven; selecting an item remixes it directly, no separate preview/chat step.
- **Tree view** (the Open Design activity-bar icon → Gallery) — always one click away, grouped by category. Clicking an item, or its inline "Use in Chat" icon, populates Copilot Chat with a prefilled (still-editable, not-yet-sent) message naming the example — mirroring upstream open-design's own Gallery, where clicking a card populates the chat composer rather than doing anything immediately. A read-only preview and a direct Remix are both available separately via inline icons.
- **Grid view** (`Open Design: Open Gallery Grid`, screenshot above) — a searchable card grid (search box + category filter chips) with a live thumbnail per card, fetched lazily as it scrolls into view and rendered straight from this extension's bundled assets into `iframe.srcdoc` — never through a resource fetch the webview's browser engine would have to load from a URL.

All four entry points (the tool, QuickPick, tree, grid) call the same underlying remix logic, so behavior is identical regardless of which one you use.

### Visual design

The three webviews (Artifact Preview editor, Gallery grid, example preview panel) follow open-design's own actual visual design language, hand-transcribed from its real stylesheets: near-black/near-white "ink" buttons with a fully pill-shaped primary action; a lime-green brand accent (`#87ea5c`) reserved for active/selected states; a terracotta (`#d96a46`) teardrop shape for comment pins; frosted-glass floating panels; a named radius ladder from 2px to 16px; and the Albert Sans variable font (SIL OFL-licensed, vendored locally) at 600 weight. All three switch between open-design's own light/dark token sets based on VS Code's `vscode-dark`/`vscode-light` body classes, so they stay theme-aware without adopting the ambient editor theme's arbitrary colors.

## Not using VS Code?

The same library is built natively into other agents too: a Claude Code plugin, Codex skills, and a standalone [MCP server](https://www.npmjs.com/package/@feimacode/open-design-agent-kit-mcp) for Cursor and any other MCP-capable agent. See the [main repo](https://github.com/feimacode/open-design-agent-kit) for setup.

## Content & attribution

Skills, design systems, craft rules, and examples are vendored from the official [open-design](https://github.com/nexu-io/open-design) repo (Apache-2.0), pinned to a tagged release — see the [main repo's Content section](https://github.com/feimacode/open-design-agent-kit#content) for how the sync works, and `packages/core/src/vendored/SOURCE.md` for exactly what code was ported vs. rewritten.

## License

MIT — see [LICENSE](https://github.com/feimacode/open-design-agent-kit/blob/main/LICENSE).
