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

## Content from html-anything

Five document templates are ported from [html-anything](https://github.com/nexu-io/html-anything), also by the Open Design team and licensed Apache-2.0, at commit `553ed98c283f`. They live under `packages/content/local/` like any other extension-owned content, so upstream syncs never touch them. `packages/content/local/ports.json` is the machine-readable record, and the content sync check fails if a port loses its provenance header or its row here. The license is kept at `packages/content/local/ports/LICENSE-html-anything.txt`.

| Skill | Source | Remixable examples | Divergences |
|---|---|---|---|
| `exec-briefing-memo` | `next/src/lib/templates/skills/exec-briefing-memo` | default, plus the `board-memo`, `board-paper` and `decision-command` styles | Common to all five: an `od:` frontmatter block and an English description; `featured` dropped (curation here is `local/curated.json`); `assets/*.html` style references point at the remixable examples. |
| `experiment-readout` | `next/src/lib/templates/skills/experiment-readout` | default, plus `growth-console`, `lab-notebook`, `product-readout` | As above. |
| `competitive-teardown` | `next/src/lib/templates/skills/competitive-teardown` | default, plus `analyst-dossier`, `radar-map`, `war-room-grid` | As above. |
| `info-funnel` | `next/src/lib/templates/skills/info-funnel` | default | As above. The original credits [baoyu-skills](https://github.com/JimLiu/baoyu-skills#baoyu-infographic) as its inspiration. |
| `article-sketchnote-editorial` | `next/src/lib/templates/skills/article-sketchnote-editorial` | default | As above. The original credits [lijigang/ljg-skills](https://github.com/lijigang/ljg-skills/tree/master/skills/ljg-card) as its inspiration. |

The examples are kept as upstream wrote them. They target desktop reading or fixed-width long images, so at phone width their tables clip and the sketchnote scrolls sideways. `check_open_design_artifact` reports these as `mobile` findings when an agent remixes one, and the agent fixes them in its copy.

## Rules for porting

1. Start every ported file with a header naming the upstream file and commit, and the license.
2. Keep the code close to upstream so future fixes can be compared side by side. Record each divergence, and why, in the header and in `SOURCE.md`.
3. In-page scripts (functions serialized into a browser page) must be **self-contained**: no references to module scope, because the VS Code bundle is minified. `pageScripts.test.ts` checks both the compiled and the minified output.
4. Don't edit vendored content (`packages/content/assets/open-design/`). To change agent behavior for a specific skill, add a host override in `packages/core/src/generation/hostOverrides.ts`.
