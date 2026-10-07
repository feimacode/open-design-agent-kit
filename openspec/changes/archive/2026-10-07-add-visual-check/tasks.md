## 1. Core: shared page loading

- [x] 1.1 Factor `withArtifactPage` (browser discovery and launch, static server, `loadPage`, cleanup) out of `exportArtifact.ts`; switch export to use it with no behavior change
- [x] 1.2 Run the existing export unit and integration tests to confirm export results are unchanged

## 2. Core: checks

- [x] 2.1 Add the `horizontal-scroll` page script to `poster/pageScripts.ts` (skip `overflow-x: auto|scroll` containers and transformed fixed off-canvas elements; name the furthest-right offender)
- [x] 2.2 Add `viewport` and `slide` optional fields to `Finding`, and include them in `formatFinding` and the dedupe key
- [x] 2.3 Unit-test `horizontal-scroll` with fixtures: wide table (error at 390), carousel in a scroll container (no finding), off-canvas drawer (no finding), desktop overflow (warning)

## 3. Core: `checkArtifact`

- [x] 3.1 Create `export/checkArtifact.ts`: resolve the renderer from the manifest, reject unsupported kinds, and dispatch to card, page or deck mode
- [x] 3.2 Page mode: loop over viewports (default desktop 1440×900, mobile 390×844), run `runPreflight` plus `horizontal-scroll` per viewport, and capture the first screen plus tiles for tall pages
- [x] 3.3 Card mode: reuse export's card capture per `[data-od-card]`; several cards become one contact sheet via `composeShapeSheet`
- [x] 3.4 Deck mode: step through slides with `captureDeck` navigation, run preflight per slide, build a 3-column contact sheet of at most 12 slides, validate `slides` with `validateSlideNumbers`, and fall back to a page check with a warning when slides can't be counted
- [x] 3.5 Image budget: resize in the browser to a long edge of 1568 px or less, encode as JPEG q80, enforce `maxImages` (default 3, cap 6, 0 means findings only), and list omitted views in the text
- [x] 3.6 `formatCheckResult`: findings first (reusing `formatPreflight`), then image labels and omissions, plus a note that animated pages were captured at a single moment
- [x] 3.7 Export `checkArtifact` and its types from `packages/core/src/index.ts`
- [x] 3.8 Integration tests with the installed browser: landing page (2 images, viewport-tagged findings), poster card (1 image, no viewport tags), deck with a clipped slide (slide-tagged finding plus contact sheet), `maxImages: 0`, unsupported kind, no-browser error

## 4. VS Code

- [x] 4.1 Add `CheckArtifactTool` returning `LanguageModelTextPart` plus `LanguageModelDataPart.image` parts; honor the cancellation token
- [x] 4.2 Register it in `registerTools.ts` and add the `languageModelTools` entry (name, modelDescription, inputSchema) to `package.json`
- [x] 4.3 Add the check-before-done paragraph to `instructions/open-design.instructions.md` and replace the poster flow's checking step with the new tool (keep `checkOnly` for `data` rows and shape sheets)

## 5. MCP server

- [x] 5.1 Widen the handler return type to `string | { text, images? }` and map images to `{ type: 'image', data, mimeType }` in the `CallToolRequestSchema` dispatcher
- [x] 5.2 Add the `check_open_design_artifact` tool definition and handler in `tools.ts`
- [x] 5.3 Update the tool-count test and add a test asserting text-then-image content ordering, and that other tools still return a single text item

## 6. Claude Code / Codex / CLI

- [x] 6.1 Add the check-before-done guidance to `packages/claude-plugin/skills/open-design/SKILL.md` and the poster/social-post skills that mention `checkOnly`; regenerate the `packages/cli/assets` Claude and Codex skill copies
- [x] 6.2 Add `check <entryPath>` to the CLI (`--viewport`, `--slides`, `--max-images`, `--screenshots`, `--browser`, `--workspace`, `--fail-on`) with exit-code behavior per spec
- [x] 6.3 CLI tests: `--fail-on error` exits non-zero on an error; warnings alone exit 0; `--screenshots` writes `<label>.jpg` files

## 7. Docs and verification

- [x] 7.1 Document the tool in the docs reference (tools list, CLI command) and run the docs drift check
- [ ] 7.2 Manual run in VS Code Copilot Chat: generate a landing page and confirm the agent calls the check, receives images, and fixes a seeded mobile overflow
- [ ] 7.3 Manual run in Claude Code via the plugin: same scenario through MCP
