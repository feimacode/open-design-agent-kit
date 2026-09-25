## Why

We want users to design social media posts (X, Instagram, Xiaohongshu, YouTube) with Open Design, and we want to use the same flow ourselves to publish X posts and HyperFrames videos on YouTube. The social skills are already vendored, but every one of them stops at an HTML artifact: nothing turns it into a PNG or MP4 that a platform accepts. On top of that, the vendored HyperFrames template tells the agent to render "through the OD daemon", which this extension deliberately doesn't ship, so video renders fail today.

## What Changes

- **New `export_open_design_artifact` tool** (VS Code language-model tool and MCP tool). It renders a registered HTML artifact in a headless browser and writes PNG (or JPEG) files that are ready to upload. The size comes from, in order: explicit arguments, the source skill's `aspect_hint`, then a safe default. A `selector` option exports each matching element (such as each card in a carousel) as its own numbered image. The tool uses a Chrome, Edge or Chromium already installed on the machine, and does not download a browser.
- **HyperFrames renders without the daemon.** `prepare_open_design_brief` adds a host-override section to the instructions of the HyperFrames-family skills. It replaces the upstream "dispatch render through the OD daemon" step with a direct HyperFrames CLI render (`npx hyperframes render …`) that writes an MP4 into the artifact's folder. The vendored upstream text is not edited. Any other skill whose instructions still depend on the daemon (e.g. `image-poster`, `video-shortform`, `audio-jingle`, `live-dashboard`) gets an explicit notice that the step is unavailable in this host, instead of failing without explanation.
- **New hand-written `open-design-social-post` prompt.** It asks for the target platform and format (post, carousel, story or vertical, YouTube thumbnail, YouTube video), maps that to a canvas size and the right skill, runs the normal generate flow, then exports the file(s). An MCP prompt and a Claude plugin command with the same content are provided for the other hosts.
- **Local curation list.** Some entries get a curated slash command even though upstream doesn't flag them: `card-twitter`, `poster-hero`, `social-carousel`. These are listed in a curation file owned by this extension. `image-poster` is left out on purpose: it generates images through the daemon's media pipeline, which this extension doesn't ship.
- **New extension-owned skill `social-youtube-thumbnail`** (1280×720), shipped from a local overlay directory that the content sync merges into the catalog, so a re-sync never erases it.
- Out of scope: syncing upstream `prompt-templates/` (the image and video model presets) and `plugins/_official/image-templates/`; posting to platforms directly or through their APIs.

## Capabilities

### New Capabilities
- `artifact-export`: rendering a registered artifact to upload-ready raster images (sizing rules, per-element export, output location, browser discovery and a clear error when no browser is installed) and to MP4 video for HyperFrames artifacts via the HyperFrames CLI, with no daemon.
- `social-post-workflow`: the platform-aware social post entry point (platform/format → size + skill mapping, generate-then-export flow) and the extension-owned `social-youtube-thumbnail` skill delivered through a local content overlay.

### Modified Capabilities
- `open-design-tools`: *Curated Slash-Command Shortcuts* also counts entries named in an extension-owned local curation list, not only upstream frontmatter flags. *No Daemon or MCP Dependency* now requires skill instructions that assume the daemon to be overridden with a daemon-free equivalent when the brief is prepared.

## Impact

- **packages/core**: a new `export/` module (browser discovery, sizing, screenshot capture using `puppeteer-core`); a skill-override hook in `composeInstructions`; parsing of `aspect_hint`.
- **packages/vscode**: a new `exportArtifactTool.ts` registered in `registerTools.ts` and `package.json` `languageModelTools`; a new `prompts/open-design-social-post.prompt.md`; `generate-featured-prompts.mjs` reads the local curation list.
- **packages/mcp-server**: the new export tool and the social-post prompt.
- **packages/content**: a local overlay directory (`local/`: overlay skills, `curated.json`, the social-post prompt source), merged by `sync-open-design-content.mjs` and read by `curatedEntries.mjs`; `check-content-sync.mjs` accounts for overlay entries.
- **packages/claude-plugin / codex**: the regenerated skills and commands pick up the new prompt and the curated entries.
- **Dependencies**: adds `puppeteer-core` (no bundled Chromium). A PNG export needs a local Chrome, Edge or Chromium; an MP4 render needs Node plus FFmpeg for the HyperFrames CLI. Both are checked at call time and reported clearly if missing.
