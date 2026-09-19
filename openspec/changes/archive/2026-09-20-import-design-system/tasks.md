# Tasks: import-design-system

## 1. Plan

- [x] Entered plan mode given scope (first multi-step UI in the extension, new network-fetch module, new deterministic write path); researched current codebase state (confirmed no existing file-picker/multi-step-QuickInput/scratch-document usage anywhere) before designing; plan approved before implementation

## 2. Shared extraction refactor

- [x] `src/core/generation/tokenExtraction.ts` — `extractHexColors`, `extractFontFamilies`, new `rankColors()`, moved/extracted from `brandExtraction.ts`
- [x] `brandExtraction.ts` updated to import from it — behavior unchanged, confirmed by its existing test suite still passing unmodified

## 3. Deterministic builder

- [x] `src/core/generation/designSystemImport.ts` — `looksLikeDesignMd()`, `buildDesignSystemMarkdown()` (verbatim passthrough vs. synthesize-with-preserved-source)

## 4. GitHub fetch

- [x] `src/core/generation/githubImport.ts` — `normalizeGithubUrl()` (pure), `fetchGithubDesignTokens()` (blob/raw direct-file fetch; bare-repo default-branch resolution + `DESIGN.md`-first-and-alone rule + candidate-path probing); no auth, public repos only, never throws

## 5. Wizard

- [x] `src/extension/commands/importDesignSystemCommand.ts` — name → source (file/paste/GitHub) → category → deterministic write → review → optional "Set as Active"
- [x] **Real type error caught by `tsc`, not runtime testing**: the source-type QuickPick item's custom field collided with `vscode.QuickPickItem`'s own reserved `kind` property — renamed to `sourceKind`, see `design.md`
- [x] Registered in `extension.ts`; new command declared in `package.json` (visible in Command Palette, no `when: "false"` hiding needed — this command takes no arguments)
- [x] `browseDesignSystemsCommand.ts`: leading "$(cloud-download) Import a design system…" QuickPick item, reachable even when the design-system list would otherwise be empty

## 6. Documentation

- [x] README's "Custom design systems" section rewritten to cover both paths (model-authored vs. deterministic import) side by side
- [x] `openspec/specs/open-design-tools/spec.md`: split into "Custom Design Systems (Model-Authored)" and new "Custom Design Systems (Deterministic Import)" requirements, 3 new scenarios
- [x] `openspec validate --specs --strict` — clean

## 7. Verify

- [x] `npm run typecheck` — caught the `kind` field collision on the first pass, fixed
- [x] `npm run lint` — clean
- [x] New unit tests: `designSystemImport.test.ts` (5 cases) + `githubImport.test.ts` (7 cases, one assertion needed a fix for `deepStrictEqual`'s key-presence strictness — not a behavior bug, just an over-specified expected value)
- [x] `rm -rf out out-webview && npm run test:unit` — 62 passing (50 prior + 12 new)
- [x] `rm -rf dist && npm run compile` — clean; confirmed `openDesign.importDesignSystem`, `fetchGithubDesignTokens`, `buildDesignSystemMarkdown` present in `dist/extension.js`
- [x] `node -e` sanity check: `package.json` parses, 8 commands declared (new one present)
- [ ] **Not performed**: manual verification in a live Extension Development Host — run the wizard for all three source paths (file, paste, GitHub — including a bare repo with a `DESIGN.md` and one without), confirm the written file's shape, confirm immediate visibility in the catalog/picker, confirm "Set as Active" works. Same documented, recurring gap as every prior change in this repo.
