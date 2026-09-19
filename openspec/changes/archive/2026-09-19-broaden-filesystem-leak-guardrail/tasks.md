# Tasks: broaden-filesystem-leak-guardrail

## 1. Diagnose

- [x] User report: same class of bug recurring for "Liquid Background Hero" (`frame-liquid-bg-hero`) — model read `src` from the extension's own install directory
- [x] Confirmed `frame-liquid-bg-hero`'s own `SKILL.md`/`open-design.json` have zero file-path references — ruled out as this specific test's trigger
- [x] Broad grep across all vendored content (`craft/`, `skills/`, `design-templates/`, `examples/`, `design-systems/`) for `apps/(daemon|web)/` and `src/...` path patterns — found `craft/anti-ai-slop.md` references `apps/daemon/src/lint-artifact.ts`, embedded via the "Universal craft rules" section, which had no disclaimer at all
- [x] Checked the other matches individually: `chat-motion-overlay`/`tweaks`/`velar-luxury-real-estate` skill bodies mention `src/...` paths describing upstream's own codebase (or, for `velar-luxury-real-estate`, a legitimate *output*-path instruction, not a leak) — covered by the same broadened top-level disclaimer regardless
- [x] Two `example.html` files also matched (`html-ppt-knowledge-arch-blueprint`, `trading-analysis-dashboard-template`) but on inspection are literal demo *content* (code snippets shown as part of the artifact's own subject matter), not instructions — correctly left untouched
- [x] User pasted the model's own status text ("Let me search for the template...", "I need to find the OpenDesign brief generation tools...") showing the filesystem-search instinct precedes any tool call — not solely a reaction to one specific leaked path

## 2. Fix

- [x] `composeInstructions.ts`: disclaimer moved from the skill-body section only to the top of the whole document, covering skill body + design system body + craft sections uniformly; removed the now-redundant per-section version
- [x] `instructions/open-design.instructions.md`: added an explicit "do not search the filesystem... to find the template first" line addressing the observed pre-tool-call instinct

## 3. Verify

- [x] `npm run typecheck`, `npm run lint` — clean
- [x] `rm -rf out out-webview && npm run test:unit` — 41 passing, unchanged
- [x] `rm -rf dist && npm run compile` — clean; confirmed the new top-level disclaimer text present in `dist/extension.js`
- [x] `instructions/*.md` loaded directly by VS Code (not bundled) — that half of the fix is live without a rebuild
- [ ] **Not performed**: manual verification in a live Extension Development Host — run the Liquid Background Hero generation again, confirm no filesystem exploration. Same documented, recurring gap as every prior change in this repo.
