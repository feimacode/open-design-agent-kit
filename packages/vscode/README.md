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
- **27 one-click slash commands** for the most-curated entries: `/od-deck-guizang-ppt`, `/od-prototype-data-report`, `/od-deck-deck-swiss-international` and more. There's also `/open-design-generate` and `/open-design-list-skills` as general entry points, `/open-design-social-post` for social media, and `/open-design-custom-design-system` for inventing a design system. [All prompts and commands](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/reference/prompts-and-commands.md).
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

- VS Code 1.104+
- [GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat), or any other chat agent that can call VS Code's built-in language model tools. The Gallery, Collections, and preview work without one; generation needs a chat agent.
- For exporting to PNG/JPEG/PDF/PPTX: an installed Chrome, Edge, or Chromium (found automatically; nothing is downloaded). On Linux, install an emoji font (e.g. `fonts-noto-color-emoji`) if your designs use emoji.
- For rendering YouTube/HyperFrames videos: Node and [FFmpeg](https://ffmpeg.org/).

## Install

Search "Open Design Agent Kit" in the Extensions view, or install from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=feima.open-design-agent-kit). That's the whole setup.

## Quick start

Open Copilot Chat in agent mode and just ask:

> Make me a pitch deck for a Series A fintech startup, editorial style.

Copilot calls `list_open_design_skills` and `list_open_design_design_systems` on its own and writes the files. Or be explicit:

- `/od-deck-guizang-ppt A 10-slide pitch deck for...` runs one of the 27 curated one-click commands
- `/open-design-social-post An X post announcing our v2 launch` designs the post and exports the PNG
- "Use the Starbucks design system, then build me a landing page" sets it active and generates against it
- Click a card in **Open Design: Open Gallery Grid** to remix a real example instead of starting blank
- "Turn this Figma frame into code: <link>" rebuilds a frame (after **Open Design: Set Figma Access Token**)
- `#od-artifact` has Copilot look at what's already registered in the workspace

## Learn more

- **First steps:** [Get started in VS Code](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/getting-started/vscode.md), or open **Welcome → Walkthroughs → Get started with Open Design**.
- **Guides:** [social media posts](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/social-posts.md), [export images](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/export-images.md), [export decks and PDFs](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/export-decks.md), [preview, comment and edit](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/preview-comments-edit.md), [Figma](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/figma.md), and more.
- **Reference:** [settings](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/reference/settings-and-env.md#vs-code-settings), [commands and prompts](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/reference/prompts-and-commands.md#vs-code), [tools](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/reference/tools.md).
- **Help:** [troubleshooting](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/troubleshooting.md). The **Open Design: Open Docs** command opens [the full documentation](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/README.md).

## Not using VS Code?

The same library is built natively into other agents too: a Claude Code plugin, Codex skills, and a standalone [MCP server](https://www.npmjs.com/package/@feimacode/open-design-agent-kit-mcp) for Cursor and any other MCP-capable agent. See [Claude Code](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/getting-started/claude-code.md), [Codex](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/getting-started/codex.md) and the [CLI](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/getting-started/cli.md).

## Content & attribution

Skills, design systems, craft rules, and examples are vendored from the official [open-design](https://github.com/nexu-io/open-design) repo (Apache-2.0), pinned to a tagged release — see [Content sync](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/contributing/content-sync.md) for how the sync works, and [Upstream ports](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/contributing/upstream-ports.md) for what code was adapted.

## License

MIT — see [LICENSE](https://github.com/feimacode/open-design-agent-kit/blob/main/LICENSE).
