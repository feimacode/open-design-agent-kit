## ADDED Requirements

### Requirement: Sample Data File

For an app screen or flow, the instructions SHALL ask the agent to write one data file before the first screen (`_shared/data.json` for a collection, `<name>.data.json` for a single screen) holding the locale, currency and named collections of entities, with at least 12 rows for any table, a spread of value lengths including one over 30 characters, zero and very large numbers where a field allows, one missing optional value, values from the user's locale, and no business facts the brief didn't give.

#### Scenario: Invoices for a German user
- **WHEN** a German-speaking user asks for an invoices screen
- **THEN** the data file has `"locale": "de-DE"`, `"currency": "EUR"` and at least 12 invoices with varied customer name lengths

### Requirement: Binds and Repeats

Wherever the kit serves a design, it SHALL fill elements marked `data-od-bind="<path>"` from the data file, render one copy of a `data-od-repeat="<collection>"` template per item, and format values marked `data-od-format` (`currency`, `date`, `number`, `percent`) with the data file's locale; rendered nodes SHALL be preview-only, so saving keeps the binds and the single template.

#### Scenario: Same invoice on two screens
- **WHEN** the invoice list and the invoice detail both bind `invoices[2].total`
- **THEN** both show the same formatted amount, and changing it in the data file changes both

### Requirement: Sample Data Findings

The check SHALL report `sample-data-missing` for a bind whose path is not in the data file, `sample-data-thin` (warning) for a repeated table or list with fewer than 12 items or no value over 30 characters, and `items-promised` when the brief or flow plan names a count of items and fewer render.

#### Scenario: Plan promised six products
- **WHEN** the brief says "a grid of 6 products" and the screen renders four
- **THEN** the check reports `items-promised` with 6 expected and 4 found

### Requirement: Mock Data on Promote

Promote to code and component sets SHALL write a design's data file as typed mock modules (`mocks/<collection>.ts`) and make screens read through one data module with a marked seam where a real service replaces the mocks.

#### Scenario: Promoted list runs on the design's data
- **WHEN** the user promotes an invoices flow to a Next.js app
- **THEN** the app has `mocks/invoices.ts` with the design's rows, and the list page reads them through a data module with a `TODO(data)` seam
