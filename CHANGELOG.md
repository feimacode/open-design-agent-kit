# Changelog

One version covers the VS Code extension and the npm packages (`content`, `mcp-server`, `cli`). The release workflow uses the section for the tag being released as the GitHub Release notes (see [Releasing](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/contributing/releasing.md)).

## [0.2.0] - 2026-10-10

Open Design Agent Kit now covers the whole path from idea to delivery: explore directions before committing, build from your own documents, check how a design renders, export it in any format (including print, video and email), share a link, and hand it to Canva, Figma or a posting service through the connectors your agent already has. The MCP server goes from 11 tools to 23.

### New ways to start

- **`/open-design-new` and "New design" tiles.** Pick what to make (prototype, mobile app, slides, wireframe, poster, social post, campaign, HTML email, diagram, color + type, 3D object and more); the agent asks only for what's missing and uses the right recipe. In VS Code, the Gallery Grid opens with one tile per kind. `list_open_design_skills` gains a `surface` argument. [Generate a design](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/generate-a-design.md)
- **Explore design directions.** `/open-design-explore` builds 2–4 genuinely different directions side by side, with a comparison page and contact sheet; pick one and it becomes the full design. Style tiles (up to 6) compare color and type pairings and can become your design system. New tools: `prepare_open_design_exploration`, `compare_open_design_exploration`, `choose_open_design_direction`. [Explore design directions](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/explore-directions.md)
- **Decks from your documents.** `read_open_design_source` turns DOCX, PPTX, XLSX, PDF, Markdown, CSV and text into Markdown with extracted images. `/open-design-deck-from-source` agrees a storyline with you first, then builds the deck with every number traced to its source; `get_open_design_artifact` flags a deck whose sources changed. [Turn a document into a deck](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/deck-from-a-document.md)

### New kinds of design

- **Posters and print.** `/open-design-poster` makes one fluid design that reflows to any size, from A0 to an Instagram story. Print PDFs get bleed and optional crop marks; `create_open_design_qr_code` makes real, offline QR codes; `adapt_open_design_artifact` re-composes a fixed-size design for other shapes; and `data` exports one copy per spreadsheet row (name cards, certificates). [Posters and print](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/posters.md)
- **Campaigns.** `/open-design-campaign` takes one master design to every channel size and language, checked, with a campaign sheet. [Run a campaign](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/campaigns.md)
- **HTML email.** An email-campaign skill and an `email` export that renders properly in Gmail, Outlook and Apple Mail; VS Code can copy it ready to paste into your email tool. [HTML email](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/html-email.md)
- **Diagrams of your code.** The agent reads the repo first, then draws architecture, dependency, flow, ER, state and sequence diagrams with an automatic layout runtime (`add_open_design_diagram_runtime`). [Diagrams](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/diagrams.md)
- **3D objects and product shots.** A studio-lit three.js scene from a brief, a `.glb` model or an SVG logo, exported as a still, a transparent cut-out or a turntable video. [3D objects](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/3d-objects.md)
- **Engineering documents.** RFC, ADR, postmortem, PR explainer and changelog-page skills grounded in git, plus competitive teardown, executive briefing memo, experiment readout, funnel and sketchnote-article templates ported from html-anything. `/open-design-docs` turns a folder of Markdown into designed pages and refreshes only what changed. [Engineering documents](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/engineering-docs.md)

### Check and export

- **`check_open_design_artifact`** renders a design and shows the agent what it looks like: screenshots plus preflight findings (overflow, safe area, minimum type size, contrast, image resolution, QR decoding, overlapping text, broken assets, WebGL), at desktop and mobile, per card or per slide, and at chosen moments of an animation (`at`).
- **Animation export:** MP4, WebM and GIF, frame-exact and identical on every run thanks to a virtual clock. Uses an installed ffmpeg (never downloaded). [Export animations](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/export-animations.md)
- **More export formats:** `standalone` (one self-contained HTML file), `site` (a deploy-ready folder), `email`, and `paste` (HTML that keeps its look when pasted into WeChat, Notion or a newsletter tool). [Paste into WeChat, Notion and newsletters](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/paste-html.md)
- **Export options:** canvas `preset`/`presets` for print and screen formats, `transparent` PNGs, `shapeSheet` and `campaignSheet` contact sheets, `checkOnly`, and spreadsheet-driven `data` exports.

### Share and connect

- **Share a link.** `publish_open_design_artifact` and `/open-design-publish` package a design and walk the agent through publishing it to a temporary Netlify or Cloudflare link, or your own Netlify, Vercel, Cloudflare Pages or GitHub Pages. Published pages carry an optional, closeable "Made with Open Design" badge and link-preview metadata. [Share and publish](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/share-and-publish.md)
- **Integrations.** `list_open_design_integrations` and `/open-design-integrations` show which trusted services (Canva, Figma, Notion, Google Drive, Slack, Buffer, Metricool, X) your agent is connected to and how to connect the rest, only with your consent. [Connect other services](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/integrations.md)
- **Canva:** `publish_open_design_artifact_to_canva` gets a design into Canva through your Canva connector, or as a file to import.
- **Figma:** `push_open_design_artifact_to_figma` pushes a design in as editable layers through Figma's own MCP server, and `pull_open_design_figma_frame` now uses that connection too; a token is only needed without it. [Figma](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/guides/figma.md)

### VS Code

- **Tweaks panel** in the preview: live controls for a design's colors, type and spacing variables. Apply them to the file, save a variant, send them to chat, or write them into your custom design system's tokens.
- New toolbar: **Export** and **Share** menus, and for fluid posters a **Shape** picker with zoom, **Check** and **Use as default**.
- A banner shows page script errors with **Ask the agent to fix**.
- **Integrations** view in the Open Design sidebar, with **Refresh Integrations** and **Show Integration Setup** commands.
- **Collections** view lists explorations and their directions; **Open Comparison in Browser** opens an exploration's comparison page.
- New prompts: `/open-design-new`, `/open-design-explore`, `/open-design-deck-from-source`, `/open-design-poster`, `/open-design-campaign`, `/open-design-docs`, `/open-design-publish`, `/open-design-integrations`.
- New settings: `openDesign.export.ffmpegPath` and `openDesign.share.badge`.

### Claude Code, Codex and MCP

- The same workflows ship as model-invocable skills for Claude Code (plugin and `init`) and Codex: `open-design-new`, `-explore`, `-deck-from-source`, `-poster`, `-campaign`, `-docs`, `-publish` and `-integrations`, plus matching MCP prompts.
- **Claude Code plugin:** the Figma token is now a plugin option stored in your keychain; the MCP server is pinned to an exact version and installed from the plugin's lockfile instead of `npx`; the plugin has an icon.
- **MCP server:** uses the client's MCP roots for the workspace when it reports them (VS Code does), and is listed in the [MCP registry](https://registry.modelcontextprotocol.io) as `io.github.feimacode/open-design`.
- New environment variables: `OPEN_DESIGN_FFMPEG_PATH` and `OPEN_DESIGN_SHARE_BADGE`.

### CLI

- New **`check`** command: preflight findings and optional screenshots, with `--fail-on` to gate CI. [CLI reference](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/reference/cli.md#check)
- **`export`** gains the new formats and `--preset`/`--presets`, `--bleed`, `--crop-marks`, `--check`, `--data`/`--sheet`/`--name-field`/`--split`, `--fps`/`--duration`/`--loop`, `--transparent`, `--ffmpeg`, `--campaign-sheet`, `--shape-sheet`, `--target`, `--base-url` and `--badge`.
- `init` writes the new workflow skills.

### Fixes

- Preflight no longer reports text inside scroll containers as clipped.

### Releasing

- npm packages are now built and smoke-tested (a real publish to a local registry, `npx` resolution, an MCP handshake and `init`) on every release tag, then published by a manual, confirmed workflow that also updates the MCP registry listing.

## [0.1.8] and earlier

See the [GitHub Releases](https://github.com/feimacode/open-design-agent-kit/releases).
