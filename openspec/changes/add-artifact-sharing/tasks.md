## 1. Vendored bundler (core)

- [ ] 1.1 Vendor upstream `apps/daemon/src/artifacts/standalone-html.ts` to `packages/core/src/vendored/standaloneHtml.ts`. Record the path, commit, Apache-2.0 licence and any deviations in `vendored/SOURCE.md`
- [ ] 1.2 Add `@babel/parser`, `cheerio` and `postcss` to `packages/core/package.json`. Confirm the VS Code and MCP esbuild bundles build, and record the minified size growth (target under about 1.5 MB, otherwise revisit design D2)
- [ ] 1.3 Add a workspace-backed `readAsset` adapter that resolves paths against the artifact folder, refuses anything outside the workspace (absolute-path-safe, as in the existing workspace check), and reads with the MIME type taken from the file extension
- [ ] 1.4 Unit tests: inline stylesheet with `url()`, `@import` chain, module script import, `srcset`, missing dependency with chain, path escape rejected, remote URL kept and reported

## 2. Packaging formats (core)

- [ ] 2.1 Extend `exportFormats.ts` and the manifest validator with `standalone` and `site`. Update kind lists for `html`, `mini-app` and `deck`, and accept both formats for those kinds even when an older manifest's stored `exports` omits them
- [ ] 2.2 In `exportArtifact.ts`, route `standalone` and `site` before `findBrowser`. `standalone` writes `exports/<name>.html` and returns bundler warnings
- [ ] 2.3 Add `export/siteBundle.ts`: a file plan ported from upstream `buildDeployFilePlan` (HTML refs, inline CSS refs, recursive CSS refs, manifest `supportingFiles`, rewrite to root `index.html`). Write to a temporary folder, then swap it into `exports/site/` atomically. `missing-references` fails with no partial bundle
- [ ] 2.4 Port `analyzeDeployPlan` as the preflight with the spec's codes and thresholds. Include the file list and total bytes in the result
- [ ] 2.5 Add the badge injector: inline `<aside data-od-badge>` plus scoped CSS and a close control, inserted before the real `</body>` (port `findRealTagOffset` behaviour). Resolve the setting in order: argument, `OPEN_DESIGN_SHARE_BADGE`, the injected setting value, the format default
- [ ] 2.6 Add the link-preview meta injector: fill missing `<title>`, `og:title`, `og:description` and `twitter:card` from the manifest. Copy `exports/<name>.png` to `og.png` when present. Emit absolute `og:image` and `twitter:image` only with a known base URL
- [ ] 2.7 Unit tests: bundle layout, re-export removes stale files, badge default on for `site` and off for `standalone`, `badge: false`, `</body>` inside a script string, source file byte-identical, author tags preserved, `og:image` only with a base URL, preflight codes, and an SVG kind rejected with `unsupported-format`

## 3. Publish instructions and share records (core)

- [ ] 3.1 Add `workspace/shareRecords.ts`: read records, upsert by `(provider, siteRef)`, keep at most 20, check `https:` only, and report expired records
- [ ] 3.2 Add the provider recipe table (`generation/publishProviders.ts`) for the six providers. Each entry has detect and auth commands, a deploy command template run from the bundle folder, how to read the URL and claim URL, the reuse key, and limits. Include the generated `wrangler.jsonc` (inside the bundle) for Cloudflare and the `<user>/od-shares` `gh-pages` flow for GitHub Pages
- [ ] 3.3 Verify by hand, on a real machine, `netlify deploy --allow-anonymous` and `npx wrangler deploy --temporary` against a sample `site` bundle. Record the actual output lines and limits, fix the recipes, and note the results in design.md's Open Questions
- [ ] 3.4 Add `generation/publishInstructions.ts`, which composes the staged instructions: preflight summary, provider choice (when none is given), CLI and auth check, a mandatory stop-and-confirm (public, file list, expiry, badge and how to remove it, GitHub Pages visibility), deploy from the bundle folder (reusing the recorded `siteRef`), report, the `published` follow-up call, and an optional `og:image` redeploy. Rules: no invented accounts, no guessed retries
- [ ] 3.5 Add `publishArtifact()` orchestration: no `published` means a `site` export plus instructions; `published` means validate and record only
- [ ] 3.6 Export the new APIs from `packages/core/src/index.ts`. Unit tests: every provider's instructions contain the confirm stage before the first deploy command, the omitted-provider choice list, `vercel whoami` gating, a recorded `siteRef` reused, an `http:` URL rejected, upsert replaces the record

## 4. MCP server

- [ ] 4.1 Add the `publish_open_design_artifact` handler and schema in `packages/mcp-server`. Add `standalone` and `site` plus `badge` to `export_open_design_artifact`'s schema
- [ ] 4.2 Read `OPEN_DESIGN_SHARE_BADGE` in `env.ts`. Update the tool-count assertion in the MCP resolution test and add handler tests

## 5. VS Code extension

- [ ] 5.1 Add a `PublishArtifactTool` (mirroring `ShareToCommunityTool`) and register it as `publish_open_design_artifact`, with a `languageModelTools` contribution in `package.json`. Add the new formats and `badge` to the export tool's contribution schema
- [ ] 5.2 Add the `openDesign.share.badge` setting (boolean, default `true`, description noting it applies to publish bundles) and pass it into core
- [ ] 5.3 Add the **Share** toolbar button to `webview/main.ts` and handle its message in the artifact editor provider with a `showQuickPick`:
  - Download standalone HTML: export, then `showSaveDialog`, then copy
  - Get a temporary link: chat prefill
  - Publish to my hosting: chat prefill
  - Copy link: one item per live record, using `env.clipboard`
- [ ] 5.4 Check by hand in an Extension Development Host: download works with the browser path set to an invalid value, the prefills open chat with the right text, and Copy link appears after a recorded share and disappears for an expired temporary record

## 6. CLI

- [ ] 6.1 Accept `--format standalone|site` and `--badge` / `--no-badge` in `packages/cli/src/exportCommand.ts`, and print the written paths (the bundle folder for `site`) plus preflight warnings
- [ ] 6.2 CLI tests for both formats and the badge flags

## 7. Content and agent guidance

- [ ] 7.1 Add `packages/content/local/prompts/publish.md` (the curated `publish` command), then regenerate the VS Code prompt files, MCP prompts, and Claude Code and Codex skills via `npm run sync-content`
- [ ] 7.2 Update the overview skill and the VS Code chat instructions: share, publish, deploy or "link" requests go to `publish_open_design_artifact`, and "single HTML file" requests go to export `format: "standalone"`

## 8. Docs

- [ ] 8.1 Write `docs/guides/share-and-publish.md`: download standalone, temporary links versus own hosting (lifetime, account, visibility table), the confirmation step, the badge and how to turn it off, link previews and the second deploy, and troubleshooting. Link it from `docs/guides/README.md` and `docs/README.md`
- [ ] 8.2 Reference updates: `tools.md` (new tool, export formats and `badge`), `cli.md` (new options), `settings-and-env.md` (`openDesign.share.badge`, `OPEN_DESIGN_SHARE_BADGE`), `artifact-manifest.md` (`metadata.shares`, updated exports-by-kind table), and the prompts reference (`publish`)
- [ ] 8.3 Run `npm run lint` (including `scripts/check-docs.mjs`), `npm run typecheck` and `npm run test:unit` from the root until all are clean
