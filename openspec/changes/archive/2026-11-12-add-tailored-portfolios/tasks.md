## 1. Targets

- [x] 1.1 `targets.ts`: schema, kinds, default limits, suggested order with matched words
- [x] 1.2 `save_open_design_portfolio_target` in MCP and VS Code
- [x] 1.3 Recipes accept `target`: projects, order, cover note

## 2. Outputs

- [x] 2.1 Unlisted site variant at its own path (noindex, not linked)
- [x] 2.2 PDF at A4, Letter or 16:9 within the size limit by image quality; failure names the heaviest pages
- [x] 2.3 School image set: one titled file per piece under the image limit; piece count check
- [x] 2.4 Client "For you" section linking a redesign concept and before/after page
- [x] 2.5 Promotion criteria map with empty criteria kept visible

## 3. Privacy

- [x] 3.1 `privacy.ts` ceiling check over `data-od-project` and `data-od-asset`, used by export and publish
- [x] 3.2 Provider rule: internal = file export only; unlisted = Claude artifact or a host with a designer-set password
- [x] 3.3 Untagged image warning in the portfolio checks

## 4. Docs and evals

- [x] 4.1 `guides/portfolio.md` (tailored versions, privacy), `reference/tools.md`, CHANGELOG
- [x] 4.2 Eval briefs: job target from a pasted ad; school target with a 10 MB PDF limit

## Notes from implementation

- PDFs and school image sets come from a new `portfolio-pdf` skill (deck mode, one `.slide` per page); the size fitting works on deck PDFs, whose pages are images. A page PDF (a printed site page) still only warns when it is over `maxBytes`.
- A portfolio design with no target uses the ceiling `unlisted`, so internal work never leaves without a target that allows it.
- Matching is word and two-word-phrase overlap with light stemming; phrases count double.
