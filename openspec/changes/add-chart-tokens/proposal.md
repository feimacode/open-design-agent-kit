Roadmap area: Design systems

## Why

A chart needs more colours than a page: five or six series that can be told apart, an "up" and a "down", gridlines and axis text that stay quiet. None of the 198 bundled design systems has them. Each holds one `--accent`, `--success`, `--warn` and `--danger`, so the agent invents series colours for every chart, and two charts on the same dashboard can disagree. The roadmap has "Chart colour tokens" under Later (Astryx study, item 5). The dashboard assessment, 25 November 2026 (item 2), moves it up because `add-data-bound-charts` and `add-dashboard-recipe` need one place to read chart colours from.

Claude's own dataviz guidance makes the same point: it ships a neutral placeholder palette and says to swap in the brand's. The kit has the brand; it just doesn't derive the chart colours from it.

## What Changes

- **Derived chart vocabulary.** Resolving a design system's tokens appends, like the motion vocabulary:
  - `--chart-1` to `--chart-6`: categorical series, starting from `--accent` and stepping hue in OKLCH at the brand's chroma, each at least 3:1 against `--bg` (WCAG non-text contrast) and far enough from its neighbours to tell apart;
  - `--chart-seq-1` to `--chart-seq-5`: a sequential ramp of the accent for heatmaps and ordered values;
  - `--chart-pos` and `--chart-neg`: from `--success` and `--danger`, adjusted to 3:1;
  - `--chart-grid` and `--chart-axis`: from `--border-soft` and `--muted`.

  A name a system already declares keeps its value, and the vendored token files and schema stay unchanged.
- **Light and dark.** When a system has dark values, the vocabulary is derived for each. The planned readable-pairs and dark-mode change (roadmap, Design systems, Next) will give most systems dark values; this change doesn't wait for it, and derives light only until then.
- **In the brief.** Skills that draw charts get a short Chart colours section: use these tokens in order, `--chart-pos` and `--chart-neg` only for change, never colour alone for meaning.
- **Out of the kit.** `export_open_design_design_system`, the Claude Design builds and the design-system preview page show and export the chart family.

## Capabilities

### New Capabilities
- `chart-tokens`: the derived chart vocabulary and its contrast rules, light and dark derivation, the brief section, and export.

### Modified Capabilities
None.

## Impact

- New `packages/core/src/generation/chartVocabulary.ts`, appended in `resolveDesignSystemTokens()` (`designSystemTokens.ts`), using contrast and colour helpers from `colorMix.ts`.
- `composeInstructions.ts` (Chart colours section), `designSystemExport.ts`, `claudeDesignSystem.ts`, `designSystemPreview.ts`.
- Tests across all 198 bundled systems: every derived colour meets 3:1 on `--bg`, and adjacent series differ by a minimum OKLab distance.
- Docs: design systems reference, CHANGELOG.
