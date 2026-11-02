## 1. Data file and binds

- [x] 1.1 Data file format (`locale`, `currency`, named collections); location for a collection and a single screen
- [x] 1.2 `sampleData.ts`: `data-od-bind`, `data-od-repeat`, `data-od-format` with `Intl`; preview-only rendered nodes; applied wherever includes are resolved; unit tests
- [x] 1.3 One-file prototype, site and standalone exports carry each screen filled in (see design: per screen, not the data file once)

## 2. Instructions

- [x] 2.1 Data rules section for app screens and flows: row counts, spread of lengths and values, a missing optional value, locale, no invented facts
- [x] 2.2 App-screens and flow templates use binds and repeats

## 3. Check

- [x] 3.1 `sample-data-thin`, `sample-data-missing`, `items-promised`

## 4. Promote

- [x] 4.1 Promote and component sets write `mocks/<collection>.ts` with inferred types and a single data module with a marked seam

## 5. Docs and evals

- [x] 5.1 `app-screens.md`, `promote-to-app-code.md`, `reference/tools.md`
- [x] 5.2 Eval brief for a table screen (an orders list) checking row count and long values; one live run
