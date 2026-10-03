## Context

Artifacts are plain files under `.open-design/<project>/`: an entry HTML, optional sibling assets, and a `<entry>.artifact.json` manifest. `exportArtifact()` in core serves the VS Code tool, the MCP tool and the CLI. It produces PNG, JPEG, PDF and PPTX through an installed headless browser. The `html` format returns the source as is.

There are two precedents to reuse:
- **Upstream Open Design** solved packaging well. `artifacts/standalone-html.ts` is a 1,390-line bundler that inlines a dependency graph of CSS, `@import`, `url()`, classic and module scripts, workers, `srcset` and fonts, with limits and typed errors. It's pure: its only imports are `@babel/parser`, `cheerio`, `postcss` and `node:path`. `deploy.ts` has `buildDeployFilePlan` (it walks references and the manifest's `supportingFiles`, then rewrites paths for a root `index.html`) and `analyzeDeployPlan` (preflight warnings). Its hosting half is about 2,000 lines: the Vercel and Cloudflare REST APIs, saved tokens in `~/.open-design/*.json`, and custom-domain DNS. It assumes a long-running daemon and a settings UI.
- **This repo** keeps outward-facing actions out of extension code. `share_open_design_artifact_to_community`, `port_open_design_artifact_to_app` and `publish_open_design_canva_template` all compose instructions. The model acts with its own tools, under the user's own identity, after an explicit check-in. The user has consistently preferred native, platform-owned mechanisms over bespoke machinery.

What changed in 2026 is that the hosts became agent-native. `netlify deploy --allow-anonymous` deploys with no account, claimable within an hour. `npx wrangler deploy --temporary` (Wrangler 4.102+) gives a 60-minute deployment with a claim URL. The user's own logged-in `vercel`, `netlify`, `wrangler` and `gh` CLIs cover links that last.

## Goals / Non-Goals

**Goals:**
- Anyone can get a working, self-contained `.html` file of any HTML artifact, with no browser and no network.
- One sentence ("publish this", "give me a link") gets a live URL, with zero accounts on the temporary path.
- The same thing works in VS Code, Claude Code, Codex and the CLI.
- Shared pages carry an optional, removable footer and good link previews, so they spread.
- Nothing public happens without explicit user confirmation, and the extension never holds a hosting credential.

**Non-Goals:**
- Running our own share host. That's an abuse and moderation burden: Netlify had to password-protect anonymous sites after a fraud wave. It can be revisited once there's evidence of demand.
- CodePen/StackBlitz remix handoff, StatiCrypt password protection, viewer-feedback collection, and publishing an exploration's `compare.html`. All are candidates for a follow-up. `compare.html` depends on add-explorations landing first.
- Inlining remote (CDN) resources into `standalone`. They're reported, not fetched.
- Custom domains and DNS management (upstream's Cloudflare zone and CNAME flow).

## Decisions

### D1. Split packaging (code) from hosting (instructions)
Packaging is deterministic, local and reversible, so it's core code: `standalone` and `site` export formats. Hosting is outward-facing, needs credentials, and every provider changes its CLI often, so it's composed instructions run by the model through the user's own CLIs.
- *Alternative*: port upstream's REST deploy with stored tokens. Rejected. It's 2,000 lines plus a token store and a settings UI, and it contradicts the instructions-only precedent. It also wouldn't help Claude Code or Codex users any more than their own terminal does.
- *Alternative*: instructions only, with no bundling code, letting the model hand-inline assets. Rejected. That's unreliable for fonts, modules and `url()`, and it's the part users most need to just work.

### D2. Vendor upstream's bundler as is
Copy `standalone-html.ts` into `packages/core/src/vendored/standaloneHtml.ts` with an Apache-2.0 provenance note in `SOURCE.md`. Wrap it with a workspace-backed `readAsset` that refuses paths outside the workspace, reusing the absolute-path-safe workspace check. Add `@babel/parser`, `cheerio` and `postcss` to core.
- *Alternative*: write a small inliner covering only `<link rel=stylesheet>`, `<script src>`, `<img>` and CSS `url()`. Fewer dependencies, but it silently produces broken output for module imports, `@import` chains, `srcset` and workers. Upstream already found and fixed those edge cases. The dependencies are pure JS and get bundled, so the cost is VSIX size only. Measure it in tasks; it's acceptable if under about 1.5 MB minified.

### D3. `site` is the unit of publishing, and `standalone` is the unit of download
`site` mirrors upstream's file plan. The entry is rewritten to root `index.html` and references are copied at their relative paths. That's what static hosts expect, and it keeps large images as separate cacheable files instead of base64 bloat. Both formats are export formats, so the CLI and every host get them for free, and the publish tool simply calls `exportArtifact({ format: 'site' })`.
- Neither format launches a browser. `exportArtifact` routes them before `findBrowser`, so they work on CI and on machines without Chrome.
- Missing or invalid references fail `site` with `missing-references`, listing them, like upstream's `MISSING_REFERENCES`. For `standalone` they fail with the bundler's typed error kind. The preflight's other findings are warnings.

### D4. Footer badge: inline, closeable, on for `site`, off for `standalone`
The badge is a small fixed-position `<aside data-od-badge>` with scoped inline CSS and a one-line inline close handler. It reads "Made with Open Design · Remix this". It links to the project README and the community gallery, with a `?ref=badge` query and no script fetch, so it doesn't track anyone.
- It's inserted at the document's real `</body>`, using upstream's `findRealTagOffset` approach so a `</body>` inside a script string isn't hit (upstream bug #7410).
- It's skipped for decks in present mode. It doesn't appear in the PNG, PDF or PPTX exports, which read the source, not `site`.
- Precedence: the per-call `badge` argument, then `OPEN_DESIGN_SHARE_BADGE`, then the `openDesign.share.badge` setting, then the format default.
- *Why on for `site`*: the user framed it as the growth loop, "optional, removable". The publish instructions tell the model to mention the badge and how to drop it during the confirmation step, so it's never a surprise.
- *Alternative*: upstream's external hook script (`OD_DEPLOY_HOOK_SCRIPT_URL`). Rejected. A third-party script on users' pages is a privacy and trust cost we don't need.

### D5. Open Graph tags, with og:image only once the URL is known
Missing `og:title`, `og:description`, `twitter:card` and `<title>` are filled from the manifest title and description. Existing author tags are never overwritten.
- `og:image` must be an absolute URL, and the URL isn't known before the first deploy. So `site` copies `exports/<name>.png` to `og.png` when that PNG exists, and emits `og:image` only when a `baseUrl` is available.
- `baseUrl` comes from the latest matching `metadata.shares` record, or an explicit argument.
- The publish instructions tell the model to run export PNG first when a browser is available. After a first publish, they offer one redeploy so link previews show the image.

### D6. One tool, two modes: `publish_open_design_artifact`
- `{ entryPath, provider?, badge? }` → runs the `site` export and returns preflight warnings, the bundle path and provider instructions.
- `{ entryPath, published: { provider, url, claimUrl?, expiresAt? } }` → records to `metadata.shares` and returns confirmation. It doesn't rebuild.
- *Alternative*: a separate `record_..._share` tool. Rejected, to keep the tool count down. The instructions name the exact follow-up call.

The instructions have stages, like Share to Community:
1. Present the preflight and bundle.
2. Pick a provider if none was given: temporary versus own hosting, with tradeoffs.
3. Check the CLI and auth (`netlify status`, `wrangler whoami`, `vercel whoami`, `gh auth status`). For temporary providers, check only that the CLI is present.
4. **Stop and confirm**. Say it's public, mention the badge and how to remove it, and give the expiry for temporary links.
5. Run the deploy from the bundle directory. Reuse the site, project or repo from the latest share record for the same provider.
6. Report the URL (and the claim URL with its expiry) and call the tool again with `published`.
7. Optionally redeploy for `og:image`.

The rules: never invent an account or team, never retry with guessed commands, and never deploy from the workspace root (only the bundle folder).

### D7. Provider recipes are data, kept in one table
Each provider entry holds:
- detect and auth commands
- the deploy command template
- how to read the URL (and claim URL) from the output
- the reuse key (site id, project name, repo)
- notes on the provider's limits

Where a host doesn't serve a bare static folder, the recipe says so:
- **wrangler**: deploying static assets needs a minimal `wrangler.jsonc` with an `assets.directory`. The recipe writes it inside the bundle, never in the user's repo.
- **github-pages**: the recipe pushes the bundle to a `gh-pages` branch of a dedicated `<user>/od-shares` repo created through `gh`, with one subfolder per artifact. It warns that Pages sites are public even from private repos.

The table is the single place to update when CLIs change.

### D8. Share records
`metadata.shares: Array<{ provider, url, claimUrl?, expiresAt?, siteRef?, publishedAt }>`. There's at most one record per `(provider, siteRef)`; republishing replaces it. Records for temporary providers past `expiresAt` are reported as expired, not deleted. This is the same pattern as `metadata.exports` and stays within the 16 KB metadata cap; the oldest records are trimmed past 20.

### D9. VS Code Share button
A toolbar button next to "Share to Community" opens `showQuickPick`:
- **Download standalone HTML**: run export, then `showSaveDialog` (default `~/Downloads/<name>.html`), then copy the file. There's no chat round-trip.
- **Get a temporary link**: prefill chat with `/open-design-publish` and a temporary provider.
- **Publish to my hosting**: prefill chat with the provider unspecified.
- **Copy link (\<provider\>)**: shown for each live record. Uses `env.clipboard`.

This keeps the button itself risk-free, as with Share to Community. It uses only native UI.

## Risks / Trade-offs

- [Provider CLIs change flags or output (both anonymous flows are months old)] → Recipes live in one data table with unit-tested rendering. The instructions tell the model to report the real error and stop, not improvise. The provider docs links are in the guide.
- [Temporary links expire in about an hour, and Netlify anonymous sites may be password-protected until claimed] → The confirmation step states the expiry and the claim step. The guide recommends own hosting for multi-day stakeholder review.
- [Accidental exposure of confidential designs or embedded data] → Mandatory confirmation, bundle-only deploys (never the workspace), a preflight list of every file going out, and a GitHub Pages public-visibility warning. Password protection is a follow-up (StatiCrypt).
- [The vendored bundler pulls in about 3 dependencies and VSIX growth] → Measure in tasks. They're bundled by esbuild, with no native modules.
- [Huge inlined `standalone` files from big images] → The bundler's limits (100 MiB output cap) plus a size warning over 10 MiB that suggests `site`.
- [Badge annoys users] → Off for downloads, one-flag removal, a setting to disable globally, and mentioned at confirmation every time.
- [og:image needs a second deploy] → It's optional and offered once. Link previews still show the title and description without it.

## Migration Plan

This change is purely additive.
- Existing manifests aren't rewritten. Their `exports` arrays lack `standalone` and `site`, but export accepts the new formats for `html`, `mini-app` and `deck` kinds regardless of the stored list, which is the same leniency as the existing `deck: true` rule.
- Rollback means removing the tool contribution. Bundles under `exports/` are ordinary files.

## Open Questions

- Whether `cloudflare-temporary` works for a static-assets-only Worker with a generated `wrangler.jsonc`, and the exact output lines for both anonymous flows. Verify by hand during implementation and adjust the recipes. Don't ship unverified command templates.
- The footer badge link target: the GitHub repo, a future landing page, or the awesome-open-design gallery. The default for now is the repo README, plus a gallery link for "Remix this".
