## 1. Content: vendor tokens.css and token overrides

- [x] 1.1 Extend `copyDesignSystems()` in `packages/content/scripts/sync-open-design-content.mjs` to also copy `tokens.css` when present, and log the byte total
- [x] 1.2 Extend `apply-local-overlay.mjs` to copy `local/design-systems/<id>/tokens.override.css` beside the vendored `tokens.css`, failing loudly if `<id>` does not exist upstream (keep the no-shadowing rule: never overwrite `tokens.css`)
- [x] 1.3 Add overrides for the 8 placeholder-accent systems (`application`, `bento`, `contemporary`, `corporate`, `flat`, `perspective`, `professional`, `simple`), setting `--accent` / `--meta` to each DESIGN.md's stated `**Primary:**` hex. Document them in `local/README.md`
- [x] 1.4 Extend `check-content-sync.mjs` (+ tests in `packages/content/scripts/test/`) to cover vendored `tokens.css` and to report overrides whose values now equal upstream
- [x] 1.5 Run `npm run sync-content`. Confirm `tokens.css` + 8 overrides land under `packages/content/assets/open-design/design-systems/` and no kit/package files do
- [ ] 1.6 File an upstream issue listing the 8 placeholder-accent systems (the user will file it; draft text is in the 2026-09-26 session)

## 2. Core: vendored pure modules

- [x] 2.1 Port `packages/contracts/src/design-systems/token-schema.ts` → `packages/core/src/vendored/designTokenSchema.ts` (verbatim)
- [x] 2.2 Port `apps/web/src/runtime/design-md-parse.ts` → `packages/core/src/vendored/designMdParse.ts` (verbatim)
- [x] 2.3 Extract `renderKitHtml`, `baseStyle` and token helpers from `scripts/generate-design-system-system-assets.ts` → `packages/core/src/vendored/designSystemKit.ts` as pure exports taking `(identity, tokens, mode)`
- [x] 2.4 Port `apps/daemon/src/design-systems/showcase.ts` → `packages/core/src/vendored/designSystemShowcase.ts`, adding the optional `resolvedTokens` argument that overrides the heuristic bg/fg/accent/muted/border/surface/font picks
- [x] 2.5 Append a "Design system preview" section to `vendored/SOURCE.md`: upstream commit, the four files, and the deviations from 2.3/2.4
- [x] 2.6 Unit tests: parser fixtures over several vendored DESIGN.md dialects; kit renders light/dark with the given accent; showcase uses `resolvedTokens` when given and falls back to heuristics when not

## 3. Core: token resolution and content access

- [x] 3.1 Add `tokensCss?` and `tokensOverrideCss?` to `DesignSystemDetail` in `ContentIndex` (built-in: vendored files; custom: `<dir>/tokens.css`, never an override), live-read like custom DESIGN.md
- [x] 3.2 Implement `resolveDesignSystemTokens({ tokensCss, overrideCss, designMd })` in `packages/core/src/generation/designSystemTokens.ts` with precedence override → tokens.css → DESIGN.md (A1-identity colours/fonts only) → schema A2 fallbacks → B-slot aliases. Return the `approximated` flag and fill provenance
- [x] 3.3 Unit tests: each precedence rule, alias resolution, approximated flag, and Application resolving to `#9333EA` via its override
- [x] 3.4 Implement `renderDesignSystemVisualize(...)` in `packages/core/src/generation/designSystemVisualize.ts`: identity, typography specimens, palette (resolved tokens + extra named DESIGN.md colours), voice, imagery & layout, and a component-kit slot. Omit empty modules. Escape all DESIGN.md-derived text
- [x] 3.5 Implement `renderSourceView(text, 'markdown' | 'css')`: escaped, line-classified spans. Markdown classifier ported from upstream `DesignSpecView`
- [x] 3.6 Unit tests: omitted modules, escaping of `<script>` / event-handler markup in both renderers, same kit/palette output for a custom and a built-in system with identical tokens

## 4. Core + tools: custom systems produce tokens.css

- [x] 4.1 Add a token-contract section to `composeCustomDesignSystemInstructions`, generated from `designTokenSchema.ts`: required names + descriptions, optional ones noted as defaulted, consistency-with-DESIGN.md rule, target path `<dir>/tokens.css`
- [x] 4.2 Add a tokens-only mode (`existingDesignSystemId`): instructions to author only `tokens.css`, embedding the current DESIGN.md. Error for a non-custom or unknown id
- [x] 4.3 Add the `existingDesignSystemId` input to `create_open_design_design_system` (`createCustomDesignSystemTool.ts` + `package.json` tool schema + model description)
- [x] 4.4 Implement a pure `buildDesignSystemTokensCss(rawContent)` in `designSystemImport.ts`: copy only contract-named custom-property declarations verbatim into a `:root { … }` block, or return `undefined`
- [x] 4.5 Import command: write `tokens.css` from 4.4. For a bare GitHub repo with root `DESIGN.md`, also fetch a root `tokens.css` and write it verbatim
- [x] 4.6 Unit tests for 4.1, 4.2, 4.4, and the GitHub sibling-tokens path in `githubImport`

## 5. VS Code: preview panel

- [x] 5.1 Add the `src/webview/designSystem/main.ts` webview entry and register it in `.esbuild.ts` (output `dist/webview/designSystem.js`)
- [x] 5.2 Implement `DesignSystemPreviewProvider` (singleton `openDesign.designSystemPreview` panel, `ready` handshake, nonce CSP, `openDesignTheme` styling), following `ExamplePreviewProvider`
- [x] 5.3 Host: resolve tokens, build header data, and lazily render + memoize tab HTML per `(id, tab, mode, contentVersion)`. Bump `contentVersion` from a watcher on the previewed system's DESIGN.md / tokens.css
- [x] 5.4 Webview: Visualize/Showcase tabs in `srcdoc` iframes with `sandbox=""` (nested kit iframe too), kit Light/Dark toggle, collapsible side panel with DESIGN.md | tokens.css switch (tokens option only when the file exists), open state in webview state
- [x] 5.5 Header: active badge, Set as active, Use in chat (extract the shared chat-prefill helper from `browseDesignSystemsCommand.ts`). Update on `onActiveDesignSystemChanged`
- [x] 5.6 Approximated notice with Generate tokens.css → prefilled, unsent chat message invoking `create_open_design_design_system` in tokens-only mode

## 6. VS Code: tree view and commands

- [x] 6.1 Implement `DesignSystemsTreeProvider` (`src/extension/views/designSystemsTreeProvider.ts`): categories with "Custom" first, active / custom / no-tokens markers, click → preview, `contextValue` variants for active/inactive and custom
- [x] 6.2 Refresh: watcher on `<outputDir>/design-systems/*/{DESIGN.md,tokens.css}`, `onActiveDesignSystemChanged`, `openDesign.refreshDesignSystems`
- [x] 6.3 Commands: `openDesign.previewDesignSystem` (optional id, else the shared grouped picker), `openDesign.setActiveDesignSystem`, `openDesign.useDesignSystemInChat`, `openDesign.generateDesignSystemTokens`, `openDesign.refreshDesignSystems`
- [x] 6.4 `package.json`: `openDesign.designSystemsView` (after Gallery), commands + icons, `view/item/context` inline and context entries, `view/title` Import/Refresh, hide id-only commands from the palette
- [x] 6.5 Register the tree, preview and commands in `extension.ts`

## 7. Docs and verification

- [x] 7.1 Update `docs/guides/design-systems.md`: tree view, two-tab preview, tokens.css for custom systems, Generate tokens.css, and click-opens-preview vs Gallery's click-to-chat
- [x] 7.2 Update `docs/reference` for the new commands and the `existingDesignSystemId` tool input
- [x] 7.3 Run `npm run typecheck`, `npm run lint` (incl. docs drift check), and `npm run test:unit`
- [ ] 7.4 Manual check in the Extension Development Host:
  - tree grouping and markers
  - Application previews purple
  - a custom system: create via chat and confirm tokens.css gets written, import from CSS and from a DESIGN.md-only source
  - an approximated preview updates live after Generate tokens.css
  - markup in DESIGN.md is escaped
- [x] 7.5 Record the `.vsix` size delta from `npm run package` in the PR description
  - Measured 2026-09-26 with `vsce package --no-dependencies` (as in release.yml): 5.14 MB, 1,332 files. Added: 160 token files (152 `tokens.css` + 8 overrides), 911 KiB raw / 311 KiB compressed; new core modules ~62 KiB minified / ~18.5 KiB compressed in `dist/extension.js`; `dist/webview/designSystem.js` 3.7 KiB / 1.4 KiB. Net ≈ +330 KiB compressed. Nothing was removed (no `kit.html` was ever vendored).
