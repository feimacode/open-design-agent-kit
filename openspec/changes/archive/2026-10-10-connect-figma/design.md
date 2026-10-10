## Context

- **Pull** (`pull_open_design_figma_frame`, both hosts) needs a personal access token. It fetches `GET /v1/files/{key}/nodes` and `GET /v1/images/{key}`, flattens them into a structural summary (`summarizeFigmaNode`) and composes instructions.
- **Push** is VS Code only. The preview webview walks the iframe DOM (`webview/dom/figmaCapture.ts`, `captureFigmaIr(document, meta)`, max 6000 nodes) into the capture IR. The host resolves image references to data URIs (`resolveFigmaCaptureAssets`), writes `<entry>.od-figma.json`, and the user pastes the JSON into the vendored "OD Figma Import" plugin (`assets/figma-plugin/code.js`).
- **Figma MCP facts** (live, 2026-10-10):

| Tool | Behaviour |
|---|---|
| `use_figma` | Runs Plugin API JavaScript, `code` ≤ 50,000 chars; must load `figma-use` first; `return` values come back as JSON; no state survives between calls; `createImageAsync`, `loadAllPagesAsync` and `setPluginData` are unsupported, while sync `createImage` works |
| `upload_assets` | `{count, nodeIds}` → single-use submit URLs (10-minute expiry); a raw POST with the image content type places the image on the node |
| `create_new_file` | Needs a `planKey` from `whoami` |
| `get_design_context` | Needs `fileKey` (22–128 alphanumeric chars; the branch key for branch links) and `nodeId` (`1:2`); must load `figma-design-to-code` first |
| `get_screenshot` | Returns a short-lived URL plus curl instructions |
| `generate_figma_design` | Absent on this server |

- **The push test** ran our builder (plugin lines 33–273) unmodified with a tiny IR: 10.4k chars, every layer kind correct, verified visually.

## Goals / Non-Goals

**Goals:**
- Pull without a token when Figma is connected.
- Push with no plugin install or copy-paste, on every host.
- One capture implementation.
- Keep the manual paths as fallbacks.
- Integration docs that can't drift from the registry.

**Non-Goals:**
- Using Figma's design system or components for pushed layers (`search_design_system`): we rebuild the captured page as-is.
- Code Connect.
- Updating previously pushed layers in place (each push adds a new frame).
- FigJam and Slides targets.
- Removing the vendored plugin.

## Decisions

### D1. Connector-first pull instructions
`composePullFigmaInstructions` gains a connector section and accepts a missing summary. The tool parses the link (`parseFigmaUrl`, extended to `/make/`, `/board/` and branch links, keeping the node id rule), then composes. When a token is configured it still fetches the summary and image and includes them as extra ground truth. Without a token it no longer errors.

The instructions:
1. Look up `integration: "figma"` and check tools, including deferred ones.
2. **If Figma is connected:**
   1. Load guidance with `get_figma_skill` (`skill://figma/figma-design-to-code/SKILL.md`).
   2. Call `get_design_context` with fileKey and nodeId (clientLanguages `html,css`).
   3. Call `get_variable_defs` for tokens.
   4. Call `get_screenshot` to compare against the finished artifact.
   5. Treat the returned code as a **reference** to translate into an Open Design HTML artifact: same conventions, active design system, and register as usual.
3. **Else, with token data present:** proceed with the summary as today.
4. **Else:** offer Figma setup once. If declined, explain the token option, with per-host wording carried over from today's error text.

### D2. One capture function, two runners
Move `captureFigmaIr` into `packages/core/src/figma/captureIr.ts`:
- **DOM-only:** no imports, no Node APIs.
- **All helpers nested** inside the exported function, so `captureFigmaIr.toString()` is self-contained under the ES2020 target. A test asserts the source has no free references to module-level names by evaluating it in a fresh `Function` scope against a tiny jsdom-free fake, or, more simply, by running it inside the headless browser in a test.
- **The webview** imports it by deep path (`@feimacode/open-design-agent-kit-core/src/figma/captureIr`), which esbuild bundles. Types move alongside.
- **The headless runner** `captureArtifactForFigma({ workspaceRoot, entryPath })` opens the page with the existing `openArtifactPage`, runs `page.evaluate(\`(${captureFigmaIr.toString()})(document, meta)\`)`, resolves assets with the existing `resolveFigmaCaptureAssets`, and writes the sidecar like today. The viewport is the artifact's registered format, if any, else 1440×900.

*Alternative:* bundle a separate IIFE at build time. Rejected: core has no build step, and this keeps one readable source.

### D3. Connector builder and part splitter (core)
`buildFigmaPushParts(capture, { runId, maxChars = 30000 })` returns `{ parts: string[], images: Image[] }`.

**Images:**
- every IMAGE paint's `dataUri` is decoded to `exports/figma/images/<n>.<ext>`;
- the paint is replaced by `{ type: 'IMAGE_REF', ref: n }`;
- the builder gives such nodes a neutral placeholder fill and records them.

**Builder code** is a core string derived from the plugin's logic: fonts, paints, effects, box props and `buildNode`, same behaviour. It adds:
- **marker names:** every frame built gets ` ⟦od:<runId>:<path>⟧` appended to its name;
- **parent lookup:** each part finds its parents with `figma.currentPage.findAll` by marker (the container is found by `⟦od:<runId>:root⟧`);
- **a return value:** `{ created: [...ids], imageNodes: [{ ref, id }] }`.

**Splitting:**
- part 1 builds the container, placed away from the canvas origin (figma-use rule 13), plus as many top-level subtrees as fit;
- later parts build whole subtrees, descending a level when one subtree alone exceeds `maxChars`;
- the final **clean-up part** strips the markers from names, selects the container and returns `{ containerId, imageNodes }` (found by name marker before stripping, so it works without state from earlier calls).

**`maxChars` is 30k,** not 50k, to leave headroom and reduce copy errors, since the agent passes each part verbatim as a tool argument.

*Alternative:* return parts inline in the tool result. Rejected: large results bloat context. Parts are files, and the agent reads each one when calling `use_figma`.

### D4. Push tool and instructions
`push_open_design_artifact_to_figma({ entryPath, refresh? })`, both hosts:
1. Captures (D2), reusing a sidecar newer than the entry file unless `refresh`.
2. Writes `exports/figma/part-NN.js`, `exports/figma/images/*` and `exports/figma/manifest.json` (parts, images with content types, runId, node count, truncation).
3. Returns instructions:
   1. Look up `integration: "figma"`. **If not connected:** offer setup once; else give the plugin steps (reveal the plugin folder, Copy JSON from the sidecar).
   2. Ask: add to an **existing file** (paste a link; parse the fileKey) or a **new file** (`whoami`; with one plan use it, otherwise ask which; then `create_new_file` named after the artifact).
   3. Load `figma-use` via `get_figma_skill`.
   4. For each part in order, read the file and call `use_figma` with fileKey, a short description and code = the file **verbatim**. On error, report it and stop; don't improvise code.
   5. If there are images: `upload_assets` with `count` and `nodeIds` from the clean-up part's `imageNodes` (≤60 per call), then POST each image file with its content type to its submit URL (single-use, 10-minute expiry; on failure, request fresh URLs).
   6. `get_screenshot` of the container; compare with the artifact; report.
   7. Share the file link.
   8. **Consent:** creating a new file and writing to an existing one both need the user's yes on the target first.

### D5. VS Code button
After the capture is written, the notification offers **"Push with Figma connection"** first. It opens chat with a query to call `push_open_design_artifact_to_figma` on the entry (reusing the fresh sidecar), followed by the existing "Copy JSON" and "Show Import Plugin" options.

### D6. Generated integration docs (C5)
`scripts/generate-integrations-docs.mjs` renders, from `integrations.json`:
- the "Supported integrations" table in `docs/guides/integrations.md`;
- a compact table in `README.md`.

Both live between `<!-- integrations:start -->` / `<!-- integrations:end -->` markers. Human-written docs fields come from a new optional `docs` object per entry (`summary`, `signIn`), falling back to the capability descriptions. `check-docs.mjs` re-renders and fails on drift.

## Live Check Findings (2026-10-10)

- Missing fonts (e.g. Georgia) fell back to Inter Regular and lost bold. The connector builder now falls back to Inter in the same style, using Inter's spaced names ("Semi Bold"). The vendored plugin keeps its old fallback.
- A card design (`[data-od-card]`) was captured at the format's page width, which left an empty strip. The headless runner now sizes the viewport to the card before capturing, like export.

## Risks / Trade-offs

- **[`toString()` capture breaks under transpilation]** → keep it plain ES2020 with no TS helpers (no async, no spread of iterables needing helpers); a headless-browser test runs it on a fixture page.
- **[The agent corrupts a part when copying it verbatim]** → 30k part size; parts are syntax-checked before writing (`new Function` parse in core); the instructions say to stop on a `use_figma` syntax error rather than edit code.
- **[Builder copy drifts from the plugin]** → a test builds the same IR fixture through both code strings against a minimal fake `figma` object, comparing created node kinds and properties.
- **[Fonts missing in Figma]** → the builder already falls back to Inter. The result reports which fonts fell back.
- **[A huge capture (6000 nodes) means many parts]** → the manifest reports the part count; when there are more than 8 parts, the instructions tell the agent to warn the user first.
- **[Writes to the user's Figma]** → a target-choice consent step; the push always adds a new frame and never edits or deletes existing layers.
