## 1. Content inventory

- [x] 1.1 `contentInventory.ts`: headings, body blocks, calls to action, navigation, contact, hours, prices, images, in reading order with page and selector
- [x] 1.2 `content: true` on extraction, sharing the browser session; `robots.txt` disallow honoured; unit and browser tests on a fixture site
- [x] 1.3 Inventory usable as a sample data file; `localize` copies images only on the user's say-so (the argument is `localizeImages`, and it copies only images the page itself loaded, so no second request)

## 2. Recipe

- [x] 2.1 `open-design-redesign` skill and surfaces route; one keep-or-refresh question (a "Redesign a website" surface, also under the "Sell or run a small shop" goal)
- [x] 2.2 Redesign instructions section: inventory binds, audit findings as tasks for the brief and critic, restructure rather than mirror (`prepare_open_design_brief` `redesign: { site, owned }`; the critic gets `auditFixes` from the entry's `data-od-redesign`)
- [x] 2.3 Old pages stored as base screens of their redesigns (the skill passes each page's extraction screenshot as `baseScreen`, so there is no extra visit)

## 3. Copy edits and concept marking

- [x] 3.1 `data-od-copy-edit` with `data-od-original`; check finding when rewritten text has no original (`copy-edit-original-missing`)
- [x] 3.2 Concept ribbon (`data-od-concept`), removed on the user's word with `data-od-owned` on `<body>`; `concept-unmarked` when neither; publish warning. The ribbon stays on the published page rather than being preview-only, as the forwarded-link scenario asks

## 4. Docs and evals

- [x] 4.1 `guides/redesign-a-website.md`, `reference/tools.md`, CHANGELOG
- [x] 4.2 Eval brief on the audit fixture site: real copy bound, top findings fixed, ribbon present; one live run (`redesign-trattoria`, two runs: both 0 errors with the ribbon and the copy edits marked; the first run's fixed ribbon covered a menu line on the phone (`overlap`), so the ribbon is now a band in the page flow, and the second run had no overlap)
