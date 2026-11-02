## Why

A product flow is several screens that link to each other, but a collection today is just artifacts that share a `collectionId`. Each screen's instructions list the other screens' roles and titles, and VS Code's preview has previous and next buttons. Nothing else connects them: buttons and tabs link nowhere, nobody can click through the flow in Desktop, ChatGPT or a shared link, there is no map of how screens connect, and each screen redraws the shared navigation, so tab labels and icons drift between screens. A screen the agent planned but never filled is not noticed.

This is the fourth "Now" item of the UI design use case study (2026-11-02). It draws on OpenPencil's orchestrator: it plans screens and routes up front and gives that list to every screen (`screen_route_inventory`), builds the shared nav once because per-screen redraws drift ("Library" became "Your Library", `unify_shared_nav`), wires tab labels to screen names so the preview runs as a clickable app (`wire_screen_navigation`), and flags planned screens left empty (`unfilled_screens`).

## What Changes

- **Flow plan.** For a multi-screen ask, `prepare_open_design_brief` accepts a `flow`: screens (id, title, role), the links between them (from screen, trigger label, to screen) and the shared navigation (items and which screen each opens). It is stored on every screen's manifest as `metadata.flow` with the collection, and each screen's instructions include the plan and its own outgoing links.
- **Real links.** Screens link with `href="<screen entry path>"` plus `data-od-goto="<screen id>"`; the shared nav is written once as a fragment (`<collection>/_shared/nav.html`) that every screen includes at build time, so it cannot drift.
- **Flow map.** A generated `flow.html` beside the collection shows each screen as a thumbnail with arrows for its links, from the plan and from the links actually found.
- **Clickable everywhere.** Preview follows links between screens in VS Code, the browser preview and the MCP App; `export` with `format: "html"` and publish of a collection bundle every screen and the flow map into one clickable prototype (a self-contained HTML file with screens as hidden sections, or a static site).
- **Flow findings.** Checking a collection adds `flow-broken-link` (a link to a screen or file that does not exist), `flow-dead-end` (a screen with no way forward or back, except one marked as an end), `flow-unfilled` (a planned screen missing or with no content), `flow-nav-drift` (a screen's nav differs from the shared one) and `flow-unlinked` (a planned link not found in the screen).

## Capabilities

### New Capabilities
- `screen-flows`: the flow plan and manifest record, link markup and shared nav, the flow map, clickable preview and export, and flow findings.

### Modified Capabilities
None. Collections keep their manifest shape and discovery; `metadata.flow` is an optional addition. Export and preview requirements are unchanged for single artifacts.

## Impact

- `prepare_open_design_brief` and `register_open_design_artifact` (MCP, VS Code): `flow` input and `metadata.flow`; `composeInstructions.ts` flow section; `collectionScan.ts` reads the plan.
- New `packages/core/src/generation/flowMap.ts`; `inlineExport.ts`, `siteBundle.ts` and `publish` for collection bundles; preview shell and `mcpApp` link following.
- `checkArtifact.ts` collection mode (`collectionId` input) with flow findings.
- VS Code Collections view opens the flow map. Docs `generate-a-design.md` (Collections), `share-and-publish.md`, `reference/tools.md`, `reference/artifact-manifest.md`.
