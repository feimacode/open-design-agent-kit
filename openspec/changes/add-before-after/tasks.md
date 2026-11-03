## 1. Page

- [x] 1.1 `beforeAfter.ts`: base screens plus fresh captures at desktop and phone sizes, slider, side-by-side and full-page toggles, capture times, stale-base note (the phone "before" is the audit's or extraction's phone screenshot; base screens now record their origin in `.bases/<name>.json` so a page can be traced to its old URL)
- [x] 1.2 Collection support with one section per page

## 2. Evidence

- [x] 2.1 Pair audit findings with the design and re-check at the same size; fixed and open states, plus not re-checked for page weight. The audit's passes are shared (`desktopPasses`, `phonePasses`, `reflowPass`), so both measure the same way. Not done: a "replaced by" state chosen by the agent; a finding whose element is gone is fixed only when the check finds nothing in that region
- [x] 2.2 Copy edit list from `data-od-copy-edit`
- [x] 2.3 Summary lines with citation validation (invalid lines are left out and returned in `rejectedSummary`, the rest are kept)
- [x] 2.4 Fallback with only a base screen; unit and browser tests

## 3. Tool, exports and skills

- [x] 3.1 `compare_open_design_before_after` in MCP and VS Code (hidden on the hosted server)
- [x] 3.2 One-file HTML, registered as its own design, so publish works on it; a flow's site export includes it and links it from the map; PDF one page per screen (A4)
- [x] 3.3 Redesign recipe final step; preview and publish skills offer it

## 4. Docs and evals

- [x] 4.1 Pitch section in `guides/redesign-a-website.md`, `reference/tools.md`, CHANGELOG
- [x] 4.2 Redesign eval also scores the comparison: the summary reports before/after pages with fixed and open counts and cited summary lines (one live run: 6 of 6 audit findings re-checked as fixed, 3 cited summary lines)
