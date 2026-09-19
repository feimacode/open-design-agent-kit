# Add OpenDesign tools to VS Code chat

## Why

OpenDesign (`/home/iven/tools/open-design`) is a local-first design tool. Its normal path into VS Code is: run its daemon (`od`), then talk to it over MCP. That's a lot of ceremony for what the user actually wants — driving OpenDesign's design-generation capability directly from Copilot Chat, using whichever model they already have selected there.

Research into open-design's internals (this change) found that its daemon (`apps/daemon`, ~18k-line Express server) and MCP server (`apps/daemon/src/mcp.ts`) are not embeddable — the MCP server is a pure HTTP proxy; every tool call requires a live daemon process. But three pieces are genuinely pure and daemon-free: the skill/design-system markdown content itself, the manifest-validation logic (`apps/daemon/src/artifacts/manifest.ts`), and the artifact-creation logic (`apps/daemon/src/artifacts/create.ts`). Those are portable; the daemon shell around them is not.

Research into VS Code's chat extensibility surface (`code.visualstudio.com/api/references/contribution-points`) found five real mechanisms, two of which turned out to be dead ends: custom chat modes are not extension-contributable (microsoft/vscode#251580), and an extension-managed MCP server definition provider would still use the MCP transport this change explicitly avoids.

## What Changes

- New VS Code extension `open-design-tools`, structured after `feima-copilot-llms-extension`'s conventions (esbuild bundling, `src/extension` entry point, this OpenSpec workflow) but with a much smaller surface.
- Five `languageModelTools`: `list_open_design_skills`, `list_open_design_design_systems`, `prepare_open_design_brief`, `register_open_design_artifact`, `get_open_design_artifact`. No dedicated `@open-design` chat participant.
- A `chatInstructions` file and two `chatPromptFiles` (`/open-design-generate`, `/open-design-skills`) — both zero-runtime-code, native contribution points — to make the tools discoverable without an explicit `@mention`.
- Skill/design-system/craft markdown is vendored at build time (`scripts/sync-open-design-content.mjs`) from an open-design checkout, not read live — the extension works standalone.
- Artifact content is written by Copilot's own model using its native file-editing tools; this extension only writes the artifact manifest sidecar (`<entry>.artifact.json`), never design content itself.
- Generated artifacts land inside the open workspace (default `.open-design/<slug>/`), not in extension-managed storage.

Explicitly out of scope for this change: a dedicated chat participant, live/two-way sync with an open-design checkout, porting open-design's `composeSystemPrompt()` (see `design.md` for why), and any daemon/MCP interop.

## Capabilities

### New: `open-design-tools`

VS Code chat can browse OpenDesign's bundled skills and design systems, compose a generation brief for one of them, and register a workspace file as a recognized OpenDesign artifact — all in-process, no daemon or MCP server involved.

## Impact

- New repo: `/home/iven/toys/open-design-extension` (this repo).
- New dependency: `gray-matter` (skill frontmatter parsing).
- Vendored content: `assets/open-design/{skills,design-systems,craft}` (~4.4MB of markdown, re-synced via `npm run sync-content`).
- Vendored/adapted code: `src/core/vendored/{artifactManifest,artifactCreate}.ts` (from open-design, Apache-2.0 — see `src/core/vendored/SOURCE.md` for the attribution/provenance this change is required to keep).
