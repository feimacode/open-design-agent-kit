## Why

What Open Design makes today never leaves the repo. The only way to show a prototype or deck to a teammate or stakeholder is a screenshot, a PDF, or "clone the repo and open the file", so nothing spreads. Claude Design ships standalone-HTML export and one-click send to Netlify or Vercel. Upstream Open Design ships standalone HTML, zip, and deploy to Vercel or Cloudflare Pages. The hosts themselves now support agents directly: `netlify deploy --allow-anonymous` and `wrangler deploy --temporary` give a live link with no account and a claim URL. Sharing is also the growth loop we're missing. Every shared prototype carrying an optional "Made with Open Design · Remix this" footer is free distribution.

Our `html` export currently returns the source file as is. Linked CSS, fonts and images stay external, so it breaks when attached or uploaded alone.

## What Changes

- **New export format `standalone`**: one self-contained `.html`, with stylesheets, scripts, ES modules, images and fonts referenced from the workspace inlined. It's written to `exports/<name>.html`. The bundler is vendored from upstream (`apps/daemon/src/artifacts/standalone-html.ts`, Apache-2.0). Remote URLs (CDN fonts and scripts) are left as they are and reported. It needs no browser.
- **New export format `site`**: a deploy-ready folder `exports/site/`. It has the entry as `index.html`, every referenced workspace file at its relative path, the optional footer badge, and Open Graph and Twitter meta tags. A preflight report comes with it, ported from upstream `analyzeDeployPlan`: missing or invalid references, large assets, no doctype or viewport, and external scripts and styles. It needs no browser.
- **Optional, removable "Made with Open Design" footer**: inline markup and CSS, no external script, no tracking, closeable by the viewer. It links to the project and to remixing. It's on by default for `site`, which feeds publishing, and off by default for `standalone` downloads. Turn it off with the `badge` argument, the setting `openDesign.share.badge`, or the env var `OPEN_DESIGN_SHARE_BADGE`.
- **New tool `publish_open_design_artifact`** (VS Code tool and MCP tool):
  - It builds the `site` bundle locally, which is reversible, and returns **provider instructions** for the model to carry out with its own terminal, under the user's own CLI login. It doesn't deploy anything itself and never stores tokens. This is the same principle as Share to Community and Port to App.
  - Providers:
    - `netlify-temporary` (`netlify deploy --allow-anonymous`)
    - `cloudflare-temporary` (`wrangler deploy --temporary`)
    - `netlify`, `vercel`, `cloudflare-pages`, `github-pages` (the user's own accounts)
  - The instructions require an explicit user confirmation before anything goes public.
  - When `provider` is omitted, the instructions present the choice.
  - Calling the tool again with `published: { provider, url, claimUrl?, expiresAt? }` records the result.
- **Share bookkeeping**: the manifest gains `metadata.shares[]`, one record per provider and site. A later publish to the same provider redeploys to the same site, and adds `og:image` once the public URL is known.
- **VS Code**: a **Share** button on the artifact preview toolbar opens a quick pick:
  - **Download standalone HTML** runs directly and opens the native save dialog.
  - **Get a temporary link** and **Publish to my hosting** open a pre-filled chat message.
  - **Copy link** appears when a share record exists.
- **CLI**: `export --format standalone|site` and `--no-badge`.
- **Content**: a curated `publish` command (a local overlay prompt) rendered for every host. The overview skill and the VS Code chat instructions learn when to publish.
- **Docs**: a new "Share and publish" guide, plus reference entries for the tool, formats, setting, env var and manifest fields.

Not in this change: our own hosted share service (like upstream's OpenDesign Cloud quick-share), CodePen/StackBlitz remix handoff, StatiCrypt password protection, publishing an exploration's `compare.html`, and collecting viewer feedback. See design.md for why.

## Capabilities

### New Capabilities
- `artifact-publishing`: the `site` bundle and its preflight, the footer badge and its opt-out, Open Graph tags, the `publish_open_design_artifact` instruction tool and its provider set, the confirmation rule, share bookkeeping in `metadata.shares`, the VS Code Share button, and the curated `publish` command.

### Modified Capabilities
- `artifact-export`: `export_open_design_artifact` and the CLI `export` command accept `format: "standalone"` and `format: "site"`, plus the `badge` argument. Both formats run without a browser. Manifests list `standalone` and `site` among the exports for `html`, `mini-app` and `deck` kinds.

## Impact

- **Core** (`packages/core`):
  - newly vendored `vendored/standaloneHtml.ts`, recorded in `SOURCE.md`
  - new `export/siteBundle.ts` (file plan, preflight, badge and meta injection)
  - new `generation/publishInstructions.ts`
  - `exportArtifact.ts` routes the two new formats before any browser lookup
  - `exportFormats.ts` gains the new formats
  - new `workspace/shareRecords.ts`
- **New runtime dependencies in core**: `@babel/parser`, `cheerio`, `postcss`. All are pure JS, needed by the vendored bundler, and bundled by esbuild into the VSIX and the MCP server.
- **MCP server**: the new tool, and the export tool's `format` enum.
- **VS Code**: the new `languageModelTools` contribution, the toolbar button and quick pick in the artifact editor, and the `openDesign.share.badge` setting.
- **CLI**: export options.
- **Content**: `packages/content/local/prompts/publish.md` and the generated skills, prompt files and MCP prompts.
- **Docs**: `docs/guides/share-and-publish.md`, `docs/reference/tools.md`, `cli.md`, `settings-and-env.md`, `artifact-manifest.md`, and the prompts reference. All are enforced by `scripts/check-docs.mjs`.
- **External**: none at runtime from the extension. Network calls happen only in provider CLIs the user runs through the agent after confirming.
