## 1. Shared live page

- [x] 1.1 Move the URL and subresource guard, browser launch and blocked-page detection from `siteExtraction.ts` to `export/livePage.ts`; extraction uses it unchanged
- [x] 1.2 Consent banner hiding, noted in the result

## 2. Audit

- [x] 2.1 Allow-list the live-safe checks and run them at desktop and phone sizes
- [x] 2.2 `page-weight`, `missing-viewport`, `missing-alt`, `broken-asset` (`focus-visible` and `reduced-motion` left off: they need the state pass)
- [x] 2.3 Group, rank and crop findings; write `audit.json` and marked screenshots
- [x] 2.4 `index.html` report with top 5 groups, scope statement and capture time; unit and browser tests against a local fixture site

## 3. Tool and skill

- [x] 3.1 `audit_open_design_site` in MCP (hidden on the hosted gateway) and VS Code
- [x] 3.2 `open-design-site-audit` skill and a step in the design-system-from-url skill

## 4. Docs and evals

- [x] 4.1 `guides/site-audit.md`, `reference/tools.md`, CHANGELOG
- [x] 4.2 Fixture site `evals/fixtures/trattoria-site` with known problems, served by the eval runner for briefs with `site:` (`OPEN_DESIGN_EVALS=1` lets the tool load it); the live agent run comes with the redesign brief (add-redesign-from-url), since an audit alone makes no design for the scorer
