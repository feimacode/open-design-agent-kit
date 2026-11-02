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

## Design systems from awesome-ios-design-md

The `Mobile Apps` design systems (`packages/content/local/design-systems/<app>-ios/`) are adapted from [awesome-ios-design-md](https://github.com/Meliwat/awesome-ios-design-md), Copyright (c) 2026 Muhammed Eliwat, MIT License. Each package's `DESIGN.md` is the source file with our header and an attribution footer, and its `tokens.css` was extracted with `npm run extract-ios` and then reviewed by hand (see `packages/content/local/README.md`). The source has no tags, so each package is a snapshot of `main` as of 2026-10-13. The MIT notice is kept at `packages/content/local/notices/LICENSE-awesome-ios-design-md.txt`, and the overlay ships it as `notices/` in the content assets, so every host carries it.

## 3D review from threejs-game-skills

Two pieces of the 3D critic loop (openspec `add-3d-critic-loop`) are adapted from [majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills) at commit `8286774`, licensed MIT (Copyright (c) 2026 Majid Manzarpour):

| Ours | Source | Divergences |
|---|---|---|
| `computePixelMetrics` in `packages/core/src/export/sceneReview.ts` | `computePixelMetrics` in `skills/threejs-qa-release/scripts/inspect-threejs-canvas.mjs` | TypeScript over a PNG buffer; fewer fields. Details in `SOURCE.md`. |
| The cookbook in the `3d-scene` skill (`packages/content/local/skills/3d-scene/SKILL.md`, section 7) | `skills/threejs-aaa-graphics-builder/references/shader-cookbook.md`: fake glass, the fresnel rim with `onBeforeCompile`, the gradient sky dome, the contact-shadow blob, the post-processing chain | Condensed and in our own words. Re-checked against three r160: per-material `envMapIntensity` in place of `scene.environmentIntensity` (r163+), `three/addons/…` import paths, and `OutputPass` last. Recipe values adapted (opacity 0.14 glass, rim strength 0.6, bloom 0.4). |
| The scorecard in the `3d-object` skill (`packages/content/local/skills/3d-object/SKILL.md`, "Critique") | The structure of `skills/threejs-aaa-graphics-builder/references/visual-scorecard.md`: categories scored 0–3, a pass threshold, automatic failures | Our own wording. Seven categories for a single designed object instead of ten for a game: the HUD, enemy and reward categories are dropped, and fidelity to the brief and stage are added. |

[OpenMontage](https://github.com/calesthio/OpenMontage) is AGPL-3.0. Its ideas informed the critique rules (cite evidence, look for more of the same kind of flaw, give a fix), but none of its code or text is used. Keep it that way.

## Microcopy rules from ux-ui-agent-skills

The `ux-writing` craft doc (`packages/content/local/craft/ux-writing.md`, openspec `add-states-and-microcopy-craft`) takes two ideas from the `ux-writing` skill in [plugin87/ux-ui-agent-skills](https://github.com/plugin87/ux-ui-agent-skills) at commit `55156b40e3a9`, licensed MIT (Copyright (c) 2026 Thientan Soparat): the confirm button restates the action and object, and errors go what happened, why, how to fix. The text is the kit's own. It is recorded in `packages/content/local/ports.json` with `"kind": "craft"`, so the content check verifies its provenance header, and the MIT notice ships as `notices/LICENSE-ux-ui-agent-skills.txt`.

| Craft doc | Source | Divergences |
|---|---|---|
| `ux-writing` | `.claude/skills/ux-writing/SKILL.md` | A craft doc pasted into briefs, not a skill; no voice-and-tone files or checklist script; adds the kit's empty-state, loading, filler and invented-number rules. |

## Taste and state checks from OpenPencil and ux-ui-agent-skills

The taste checks in `collectPreflight` (`packages/core/src/poster/pageScripts.ts`) and the state accessibility checks (`collectStateTargets`, `compareStateStyles`, `collectTapTargets`, `collectRunningMotion`, driven from `packages/core/src/export/checkArtifact.ts`) follow the detectors of two MIT-licensed projects. No code or fixture was copied: the detectors were written for the rendered page here, and the fixtures under `packages/core/src/test/fixtures/taste/` were written for this kit (see its `NOTICE.md`).

| Ours | Idea from | Divergences |
|---|---|---|
| `slop-glow`, `card-row`, `uniform-surface` | [OpenPencil](https://github.com/ZSeven-W/openpencil) `crates/op-design-lint/src/detectors/slop.rs` (`purple-glow-gradient`, `three-card-feature-row`, `rounded-card-wall`) | Measured on computed styles and boxes in the export browser, not a design document. Warnings, never blocking, and silenced by `data-od-allow`. The indigo list is upstream Open Design's (`anti-ai-slop.md`). |
| `type-scale`, `intent` | [ux-ui-agent-skills](https://github.com/plugin87/ux-ui-agent-skills) (XIAS) `lint_intent.mjs`, `slop_tells.mjs`, `taste_audit.mjs` | Same: rendered DOM instead of source files, warnings only. The destructive-words list is English; other languages use `data-intent`. |
| `state-contrast`, `focus-visible`, `tap-target`, `reflow`, `reduced-motion` | XIAS `verify_states`, `verify_target_size`, `verify_overflow`, `verify_reduced_motion` | One pass inside `check_open_design_artifact` instead of separate scripts; states forced through CDP `CSS.forcePseudoState`; reflow at 320 px (WCAG 1.4.10), not 280. |

## App screens, states and flows from OpenPencil, XIAS and OpenUI

The app-screens surface, the states checks and linked flows (openspec `add-app-screens`, `add-states-board`, `add-linked-flows`, `add-design-from-app`) take ideas, not text or code, from three MIT-licensed projects. The rules, templates, checks and fixtures are the kit's own, so there is no `ports.json` entry or notice file; `product-ui.md` names its sources in its header comment.

| Ours | Idea from | Divergences |
|---|---|---|
| `local/craft/product-ui.md` (one work area, records with name, status, key fields and one action, the density table) | [OpenPencil](https://github.com/ZSeven-W/openpencil) web-app, form-ui and dashboard domain skills | A craft doc pasted into briefs; densities are numbers the brief sets from the user's answer. |
| `app-*` pattern templates and `flow-*` packs | [ux-ui-agent-skills](https://github.com/plugin87/ux-ui-agent-skills) (XIAS) app templates | Plain HTML seeds with `data-od-state` frames and `data-od-goto` links, one shared shell checked identical across templates by `check-content-sync`. |
| `state-missing`, `stress-overflow`, `stress-truncation`, `dead-control` | XIAS state and content-stress audits | Run in the rendered page inside `check_open_design_artifact`, per state frame; stress compares against the page's own baseline. |
| Flow plan, shared `_shared/nav.html`, `flow-*` findings | OpenPencil's screen route inventory and shared-nav unification | Plain links and a `data-od-include` template resolved when served; the plan lives on each screen's manifest. |
| Component vocabulary and `data-od-component` marks | [OpenUI](https://github.com/thesysdev/openui) component-constrained generation | HTML stays the output, constrained by the brief and a checkable mark instead of a DSL and renderer. |

## Rules for porting

1. Start every ported file with a header naming the upstream file and commit, and the license.
2. Keep the code close to upstream so future fixes can be compared side by side. Record each divergence, and why, in the header and in `SOURCE.md`.
3. In-page scripts (functions serialized into a browser page) must be **self-contained**: no references to module scope, because the VS Code bundle is minified. `pageScripts.test.ts` checks both the compiled and the minified output.
4. Don't edit vendored content (`packages/content/assets/open-design/`). To change agent behavior for a specific skill, add a host override in `packages/core/src/generation/hostOverrides.ts`.
