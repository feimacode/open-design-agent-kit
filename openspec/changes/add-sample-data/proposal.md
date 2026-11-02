## Why

App screens show data, and ours show it tidily: four rows, short names, round numbers, dates in US format. Real tables have 40 rows, a customer called "Großhandel Müller & Söhne Lebensmittel GmbH", a balance of 0 and one of 1,284,903.17, and a missing phone number. The stress pass (PR #88) now injects long text into a copy of the page, but the design itself is still drawn for the easy case, and every screen of a flow invents its own data: the invoice that is €1,240 on the list is €1,420 on the detail screen.

When a design is promoted to code, the data is thrown away and the developer starts the mocks again. The getdesign.md starter kits sell exactly this seam: "every screen ships working on mock data", with marked places where real services plug in.

This is the third "Next" item of the UI design use case study (2026-11-02), gap R6. It takes OpenPencil's `plan_shared_context` (one set of entities across every screen), `source_facts` (don't invent business facts the brief didn't give) and `subtask_completeness` (if the plan promised six items, deliver six).

## What Changes

- **One data file per collection or screen.** Before the first screen, the agent writes `_shared/data.json` beside the screens (or `<name>.data.json` beside a single screen): named collections of entities (`invoices`, `customers`) with realistic, varied values. The brief gives the rules: at least 12 rows for any table, a spread of lengths including one very long name, zero, negative and very large numbers where the field allows, a missing optional value, and values from the user's locale (names, currency, date order). It never invents facts the brief didn't give (a real company's prices, a person's details).
- **Screens bind to it.** Elements take `data-od-bind="invoices[0].total"`, and repeated rows take `data-od-repeat="invoices"` around one template row, with `data-od-format="currency|date|number|percent"`. The kit fills them wherever it serves a design, the same way it fills shared navigation, using `Intl` with the collection's locale. The file keeps the template; inserted rows are preview-only.
- **Findings.** `sample-data-thin` when a repeated table or list has fewer than 12 rows or no value longer than 30 characters; `sample-data-missing` for a bind to a path that doesn't exist; `items-promised` when the brief or plan names a count ("6 products") and fewer render.
- **Promote keeps it.** Promote to code and component sets write the data as `mocks/<collection>.ts` with types inferred from it, and each screen reads from one `data` module with a `// TODO(data): replace with your API` seam, so the app runs on the same data the design showed.

## Capabilities

### New Capabilities
- `sample-data`: the data file and its rules, binds and repeats, locale formatting, the findings, and the mock layer on promote.

### Modified Capabilities
None. The stress pass, flow check and promote keep their requirements; this change adds to what they read and write.

## Impact

- New `packages/core/src/export/sampleData.ts` (load, resolve binds and repeats, format), applied where `flowIncludes` is applied.
- `composeInstructions.ts` (data rules section for app screens and flows), `flowPlan.ts` (data file path), app-screens templates.
- Check: `sample-data-thin`, `sample-data-missing`, `items-promised` (in `screenChecks.ts` or a new module).
- Promote: `portToAppInstructions.ts`, `componentLibrary.ts` (mock layer and seam).
- Docs `app-screens.md`, `promote-to-app-code.md`, `reference/tools.md`.
