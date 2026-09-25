# Upstream ports

Some code is adapted from upstream [Open Design](https://github.com/nexu-io/open-design), which is licensed Apache-2.0. The authoritative record of what was ported, from which upstream file and commit, and every deliberate divergence, is [`packages/core/src/vendored/SOURCE.md`](../../packages/core/src/vendored/SOURCE.md). Keep it up to date whenever ported code changes.

## Summary

| Area | Our files | Upstream origin |
|---|---|---|
| Artifact manifests | `packages/core/src/vendored/artifactManifest.ts`, `artifactCreate.ts` | `apps/daemon/src/artifacts/` |
| Preview editing and comments | `packages/vscode/src/webview/dom/*` | `apps/web/src/edit-mode/`, `apps/web/src/comments.ts` (adapted, reduced) |
| Design-system preview | `packages/core/src/vendored/designTokenSchema.ts`, `designMdParse.ts`, `designSystemKit.ts`, `designSystemShowcase.ts` | `packages/contracts/src/design-systems/token-schema.ts`, `apps/web/src/runtime/design-md-parse.ts`, `scripts/generate-design-system-system-assets.ts`, `apps/daemon/src/design-systems/showcase.ts` (one local deviation: resolved tokens) |
| Deck export | `packages/core/src/export/deck/*` | `apps/desktop/src/main/deck-capture.ts`, `apps/daemon/src/deck-export.ts`, `packages/contracts/src/runtime/deck-stage-fallback.ts` |

Not ported on purpose:

- upstream's system-prompt composer (tied to its own UI protocol and daemon); `generation/composeInstructions.ts` is written from scratch instead;
- editable PowerPoint export (`dom-to-pptx`);
- the design-system preview's React view (`DesignKitView`) and its Tokens tab (`design-systems/preview.ts`); `generation/designSystemVisualize.ts` re-implements the Visualize tab instead;
- anything that needs the daemon, whose steps are replaced by host overrides.

## Rules for porting

1. Start every ported file with a header naming the upstream file and commit, and the license.
2. Keep the code close to upstream so future fixes can be compared side by side. Record each divergence, and why, in the header and in `SOURCE.md`.
3. In-page scripts (functions serialized into a browser page) must be **self-contained**: no references to module scope, because the VS Code bundle is minified. `pageScripts.test.ts` checks both the compiled and the minified output.
4. Don't edit vendored content (`packages/content/assets/open-design/`). To change agent behavior for a specific skill, add a host override in `packages/core/src/generation/hostOverrides.ts`.
