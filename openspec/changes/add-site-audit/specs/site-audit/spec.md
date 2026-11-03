## ADDED Requirements

### Requirement: Live Site Audit

`audit_open_design_site` SHALL render a public http(s) URL, plus at most 3 more pages on the same registrable domain, at desktop and phone sizes. It SHALL use the same host, subresource and time limits as design system extraction, and it SHALL report a bot check, login wall or empty page as `blocked`, with its screenshot.

#### Scenario: Private address refused
- **WHEN** the URL resolves to a loopback or private address
- **THEN** the tool returns an error and loads nothing

#### Scenario: Bot check
- **WHEN** the page shows a challenge instead of content
- **THEN** the page is reported as blocked, with its screenshot, and no findings are reported for it

### Requirement: Live-Safe Checks Only

The audit SHALL run only the checks that read the DOM and computed styles without kit markup. These include contrast, tap targets, 320 px reflow, large text, screen economy, broken assets, focus visibility, reduced motion and the taste rules. The audit SHALL add `page-weight`, `missing-viewport` and `missing-alt`. It SHALL NOT run state, flow, sample data or token checks.

#### Scenario: No state findings on a live page
- **WHEN** a live page has a table with no empty state
- **THEN** the audit reports no `state-missing` finding

### Requirement: Findings Page

The audit SHALL write `audit.json`, marked screenshots and an `index.html` report under `<outputDir>/.audits/<site-slug>/`. The report SHALL show at most five ranked finding groups, each with a crop, its cost to the visitor and a fix in plain language. It SHALL also list the checks run and state what was not measured.

#### Scenario: Many contrast findings
- **WHEN** a page has 40 low-contrast text elements in the footer and one in the main call to action
- **THEN** the report shows the call to action group above the footer group, and `audit.json` lists all 41

#### Scenario: No invented scores
- **WHEN** the report is generated
- **THEN** it contains no overall score, speed index or search ranking claim
