# Bug fix (round 2): filesystem leak recurred for "Liquid Background Hero" via a craft doc, not the skill body

## Why

After the twelfth round's fix (disclaimer scoped to the embedded skill body only), the user reported the same class of bug recurring for a different skill ("Liquid Background Hero" / `frame-liquid-bg-hero`) — the model tried to read `src` from this extension's own install directory again. That skill's own `SKILL.md` has no file-path references at all, so the twelfth round's fix (which only wrapped the "Active skill" section) couldn't have been the gap here.

Traced to a different vendored content pool: `assets/open-design/craft/anti-ai-slop.md`, embedded verbatim via `composeInstructions()`'s "Universal craft rules" section (applied to every generation regardless of skill), references OpenDesign's own daemon source path: `` `apps/daemon/src/lint-artifact.ts` ``. That section had no disclaimer at all. A broader grep found the same pattern in a few skill bodies too (`chat-motion-overlay`, `tweaks`, `velar-luxury-real-estate` all mention `apps/web/src/...` or `src/...` describing upstream's own codebase or, in `velar-luxury-real-estate`'s case, a legitimate *output* path instruction — not every "src" match is a bug, so each was checked individually before deciding what to fix).

The user also pasted two lines of the model's own status text: *"Let me search for the template and related assets to understand the expected structure."* and *"I need to find the OpenDesign brief generation tools. Let me check what tools are available."* — showing the model's default instinct is to search the filesystem for "the template" before even reaching for the extension's own tools, independent of any specific leaked path.

## What Changes

- `composeInstructions()` (`src/core/generation/composeInstructions.ts`): moved the disclaimer from prefacing only the skill-body section to the very top of the whole composed document — it now covers the skill body, the design system body, AND the craft sections uniformly (all three embed raw vendored markdown; craft sections previously had no protection at all). The now-redundant per-section disclaimer on the skill body was removed in favor of the single top-level one.
- `instructions/open-design.instructions.md`: added an explicit line directly addressing the observed behavior — "do not search the filesystem... to 'find the template' or 'understand the expected structure' first" — since the pasted model reasoning showed this instinct precedes any tool call, not just a reaction to a specific leaked path.
- Did not edit the vendored content itself (`anti-ai-slop.md` etc.) — consistent with the twelfth round's approach: a disclaimer at the embedding point is more robust than trying to scrub every one of ~450 vendored files (and re-running the sync script would wipe any such edits anyway).

## Impact

- Modified: `src/core/generation/composeInstructions.ts`, `instructions/open-design.instructions.md`.
- No tool response shape changed; no spec delta (behavior correction, not a capability change).
