## Why

The "Publish to Canva" menu and `publish_open_design_artifact_to_canva` still compose the manual flow written before integrations existed: export a file, then import it on canva.com yourself. Now that the integration registry knows about Canva's official MCP server, and users can connect it (in Claude Code a synced claude.ai connector exposes 40 Canva tools), the agent can do the import itself when Canva is connected.

A live test on 2026-10-10 settled how:
- Canva's `create-upload-url` route stores a private file in the user's uploads and returns a `fileId`, not a design.
- Only `import-design-from-url` produces an editable design, and it takes a public HTTPS URL.

## What Changes

- **Connector-aware Canva instructions.** `composePublishCanvaTemplateInstructions` keeps the metadata and export steps, then:
  - looks up the Canva integration with `list_open_design_integrations` and checks the agent's tools;
  - **if Canva is connected,** explains two routes and recommends A, asking the user each time:
    - **A. Editable import:** host the exported PDF/PPTX on a public link through `publish_open_design_artifact` (`cloudflare-temporary` or the user's own host, never `netlify-temporary`, which is password-protected), after the publish flow's own confirmation; then `import-design-from-url` with a name and a design type derived from the artifact; verify with `read-design`; share the edit link. A Brand Template (`publish-brand-template`) is offered only after an explicit yes.
    - **B. Private upload:** `create-upload-url`, then POST the raw bytes with `curl`. The file lands in the user's Canva uploads, and they open it there to edit.
  - **if Canva isn't connected,** offers setup once, per the integration rules;
  - **otherwise,** keeps today's manual import steps as route C.
- **`publish_open_design_artifact` gains `includeFiles`:** workspace paths of files in the artifact's own `exports/` folder, copied into the bundle under `files/`. The result lists their public paths. They count as "files going out" in the confirmation stage.
- **Canva design type mapping** from the artifact's kind and canvas format to Canva's `intended_design_type`, e.g. deck → `presentation`, `ig-square` → `instagram_post`, `a3` → `poster`.
- **MCP parity:** `publish_open_design_artifact_to_canva` is added to the MCP server, so Claude Code, Codex and Cursor get the same flow. Until now it was VS Code only.
- **Registry note:** the Canva entry's caveats record the tested behaviour (import needs a public URL; upload gives a file in uploads, not a design).

## Capabilities

### New Capabilities
- `canva-publishing`: the connector-aware Canva flow (lookup, routes A/B/C, consent points, design type mapping, brand template step) and its availability on both hosts.

### Modified Capabilities
- `artifact-publishing`: the "Publish Instructions Tool" requirement gains the `includeFiles` input and its constraints.

## Impact

- `packages/core/src/generation/publishCanvaTemplateInstructions.ts` (rewritten flow and design type mapping) and its test.
- `packages/core/src/generation/publishArtifact.ts` (`includeFiles`) and `publishInstructions.ts` (listing included files and their public paths), plus tests.
- `packages/vscode`: `publishCanvaTemplateTool.ts` (passes the manifest format), the publish tool input and its `package.json` schemas.
- `packages/mcp-server`: a new Canva tool, plus the `includeFiles` argument on the publish tool.
- `packages/content/local/integrations.json`: Canva caveats.
- Docs: `docs/reference/tools.md` (Canva tool now on MCP, `includeFiles`) and a Canva section in `docs/guides/share-and-publish.md` or the integrations guide.
- No new dependencies. Our code still never talks to Canva or deploys anything.
