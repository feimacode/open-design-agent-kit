## 1. Data file and binds

- [ ] 1.1 Data file format (`locale`, `currency`, named collections); location for a collection and a single screen
- [ ] 1.2 `sampleData.ts`: `data-od-bind`, `data-od-repeat`, `data-od-format` with `Intl`; preview-only rendered nodes; applied wherever includes are resolved; unit tests
- [ ] 1.3 One-file prototype and site export carry the data once

## 2. Instructions

- [ ] 2.1 Data rules section for app screens and flows: row counts, spread of lengths and values, a missing optional value, locale, no invented facts
- [ ] 2.2 App-screens and flow templates use binds and repeats

## 3. Check

- [ ] 3.1 `sample-data-thin`, `sample-data-missing`, `items-promised`

## 4. Promote

- [ ] 4.1 Promote and component sets write `mocks/<collection>.ts` with inferred types and a single data module with a marked seam

## 5. Docs and evals

- [ ] 5.1 `app-screens.md`, `promote-to-app-code.md`, `reference/tools.md`
- [ ] 5.2 Eval brief for a table screen (an orders list) checking row count and long values; one live run
