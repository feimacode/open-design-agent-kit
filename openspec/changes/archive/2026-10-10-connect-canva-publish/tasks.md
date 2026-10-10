## 1. Hosting export files with publish

- [x] 1.1 `publishArtifact`: add `includeFiles?: string[]`. Validate each path: inside `<artifact dir>/exports/`, not under `exports/site/`, exists, unique basename. Return an error before building anything otherwise. Copy into `<bundle>/files/<basename>` after the site export.
- [x] 1.2 `composePublishInstructions`: list the included files with their bundle paths, show them among the files going out at the confirmation stage, and say each will be public at `<site URL>/files/<name>`.
- [x] 1.3 Tests: included file copied and listed; an outside path, a missing file and duplicate names rejected with no bundle written.

## 2. Connector-aware Canva instructions

- [x] 2.1 `canvaDesignTypeFor(kind, format)` in core, with the D4 mapping and tests.
- [x] 2.2 Rewrite `composePublishCanvaTemplateInstructions` (new optional `manifestFormat`): metadata, export, Canva lookup and tool check, routes A/B (recommend A, wait for the choice), setup offer, route C manual fallback, and Brand Template gating with the missing-scopes note. Use bare Canva tool names (`import-design-from-url`, `read-design`, `create-upload-url`, `publish-brand-template`).
- [x] 2.3 Update `publishCanvaTemplateInstructions.test.ts` for the new flow: route choice present; `netlify-temporary` excluded; `includeFiles` used; upload not claimed as a design; deck → `presentation`; manual steps kept.

## 3. Hosts

- [x] 3.1 VS Code: `publishCanvaTemplateTool.ts` passes the manifest's `metadata.format`. Add `includeFiles` to the publish tool input and its `package.json` schema. Update the Canva tool's `modelDescription`/`userDescription` (no longer "manual only").
- [x] 3.2 MCP server: add `publish_open_design_artifact_to_canva` (tool def + handler, the same compose call) and `includeFiles` on `publish_open_design_artifact`. Add tests.
- [x] 3.3 Registry: update the Canva caveats (import needs a public HTTPS URL; upload gives a file in Uploads, not a design; tested 2026-10-10). Re-apply the overlay and the VS Code mirror, then run the content checks.

## 4. Docs and verification

- [x] 4.1 `docs/reference/tools.md`: the Canva tool is now on MCP with the new flow; document `includeFiles`. Add a short "Canva" section to `docs/guides/integrations.md`. Run the docs check.
- [x] 4.2 Full typecheck, lint and unit tests.
- [x] 4.3 Manual, Claude Code (Canva connected): run the Canva tool on a real artifact, choose route B, and confirm the file appears in Uploads. Route A only with the user's go-ahead, since it publishes a temporary link. (Done 2026-10-10: the run stopped at the route choice by design, after the Canva tool, PDF export and integration lookup. The route B mechanics (create-upload-url, POST, fileId, file in Uploads) were verified directly with the user's consent earlier the same day. Route A not run: it needs the user's go-ahead to publish.)
- [ ] 4.4 Manual, VS Code Copilot: the "Publish to Canva" menu leads to the route choice when Canva is connected, and to a setup offer, then the manual steps, when it isn't.
