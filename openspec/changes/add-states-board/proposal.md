## Why

App screens are judged in their unhappy states as much as their happy one, but our designs ship one state: the populated, everything-fits version. The kit already knows states matter. The craft docs `state-coverage`, `action-states` and `form-validation` load for prototypes, the check tests hover and focus contrast, and the critic scores "states". But nobody sees the empty list, the loading table, the failed save or a name 80 characters long, so they are never designed or reviewed. Component sets show every state, but only after a design is promoted to code.

This is the third "Now" item of the UI design use case study (2026-11-02). It draws on XIAS's `examples/component-states` and its "hostile content" page (long unbroken strings, truncation that keeps the full value, empty, single and missing, extreme numbers, many items), its `verify_interactive` gate (a control that claims a state must change something when clicked), and OpenPencil's rule that every list or table ships populated plus an empty or loading state.

## What Changes

- **States in one artifact.** A screen can hold state versions as sibling frames marked `data-od-state="default|empty|loading|error|success|no-access|long-content"`. The instructions for app screens ask for the states that apply to the screen's data surfaces (at least populated plus empty or loading for any list, table or fetched panel; error for any form).
- **States board.** Preview and the check's review sheet show the state frames side by side with labels; preview has a state switcher. Export and publish show the default state unless asked for the board.
- **Check covers every state.** The check renders each state frame at each viewport, so clipping, overflow and contrast are checked in all of them, and reports `state-missing` when a data surface has only the default.
- **Content stress pass.** For app screens the check also renders the default state with stressed content (each text node lengthened by 2.5 times, one unbroken 60-character string, numbers at 0 and 9,999,999) and reports `stress-overflow` where text escapes its box or overlaps, and `stress-truncation` where text is cut with no way to see the full value.
- **Dead controls.** The check clicks each enabled control that declares `aria-pressed`, `aria-expanded`, `aria-checked`, `aria-selected` or `aria-sort` or has a state-bearing role, and reports `dead-control` when nothing in the document changes.
- **Critic sees the states.** The critic's input includes the state frames, and its "states" score judges them, not the craft doc alone.

## Capabilities

### New Capabilities
- `screen-states`: state frames and markup, the states board in preview and review sheet, per-state checks, `state-missing`, the stress pass and `dead-control`.

### Modified Capabilities
None. `artifact-visual-check` keeps its requirements; the state frames and new findings are additions it runs alongside.

## Impact

- `packages/core/src/export/checkArtifact.ts` (state frames as extra captures within the image budget, stress pass, dead-control pass), `preflight.ts` or a new `stateChecks.ts`.
- Preview shell (`packages/core/src/preview/shell`, `mcpApp`) state switcher and board view; `campaignSheet.ts`-style board layout reused for the review sheet.
- `composeInstructions.ts` and the app-screens templates' slots (`add-app-screens`); critic input in `workspace/critique.ts`.
- Docs `reference/tools.md` (findings), `generate-a-design.md`, `preview-comments-edit.md`, `browser-preview.md`.
