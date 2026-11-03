## Context

`flowIncludes.ts` resolves `data-od-include` in the static server, the VS Code srcdoc preview, the MCP App and exports, marking inserted nodes preview-only. The stress pass rewrites a copy of the page's text to find overflow. Promote and component sets write app code from a design.

## Goals / Non-Goals

**Goals:** every screen of a flow shows the same believable data; tables are designed for real lengths and counts; promote hands the developer working mocks.

**Non-Goals:** a data generator library (the agent writes the data; the rules make it varied); live APIs; binding for marketing pages.

## Decisions

### Binding over copying

If each screen copies values from the data file, they drift the first time one is edited. Binds make the data file the single source, and they are cheap to resolve with the same machinery as includes. A screen without binds still works; the data file is then only a reference, and the drift risk stays.

### The template row stays in the file

`data-od-repeat` keeps one row in the source as the template; the kit fills it with the first item and renders one copy per further item after it, marked preview-only (an empty list hides the template). Saving from the preview strips the copies, so the file keeps the binds and the one template. A design opened outside the kit (a raw file in a browser) shows the template row, which is acceptable.

### Locale from the brief

The locale comes from the brief's language and region answers, or the user's locale, stored in the data file (`"locale": "de-DE"`, `"currency": "EUR"`). Formatting uses `Intl.NumberFormat` and `Intl.DateTimeFormat` when the kit serves the page (binds are filled on the server, with the shared fragments), so the check, previews and exports format alike and a currency change is one edit. Dates without a time are formatted in UTC so they never move a day.

### Thin data is a warning, not an error

Twelve rows and one long value are a floor for app tables, not a rule for every list: a three-item segmented control is fine. The finding applies only to `data-od-repeat` inside a `table`, `[role=grid]`, `ul` or `ol` with more than three visible template children, and to tables without binds that have fewer than six rows.

## Risks / Trade-offs

- **Two ways to put data in a screen.** Inline values still work, so not every design will bind. The app-screens templates use binds, and the critic's `copy` area keeps judging invented numbers either way.
- **Export size.** One-file exports and sites carry each screen already filled in, not the data file: the rows are repeated per screen, which keeps them working with no script and costs little for sample-sized data.
