## 1. Shared live page

- [ ] 1.1 Move the URL and subresource guard, browser launch and blocked-page detection from `siteExtraction.ts` to `export/livePage.ts`; extraction uses it unchanged
- [ ] 1.2 Consent banner hiding with a note and a kept screenshot

## 2. Audit

- [ ] 2.1 Tag live-safe page scripts and run them at desktop and phone sizes
- [ ] 2.2 `page-weight`, `missing-viewport`, `missing-alt`
- [ ] 2.3 Group, rank and crop findings; write `audit.json` and marked screenshots
- [ ] 2.4 `index.html` report with top 5 groups, scope statement and capture time; unit and browser tests against a local fixture site

## 3. Tool and skill

- [ ] 3.1 `audit_open_design_site` in MCP (hidden on the hosted gateway) and VS Code
- [ ] 3.2 `open-design-site-audit` skill and a step in the design-system-from-url skill

## 4. Docs and evals

- [ ] 4.1 `guides/site-audit.md`, `reference/tools.md`, CHANGELOG
- [ ] 4.2 Fixture site under `evals/fixtures/` with known problems, and a brief; one live run
