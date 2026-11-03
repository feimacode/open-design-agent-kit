## Context

`siteExtraction.ts` already renders public sites safely (URL and subresource guard, page budget, blocked-page detection) and saves screenshots. `checkArtifact.ts` runs page scripts in the browser on a kit artifact served by `staticServer`. The two never meet: checks assume a local file and kit attributes, and extraction measures brand, not problems.

## Goals / Non-Goals

**Goals:** a live page gets the kit's design and accessibility findings, with evidence a non-technical reader understands, in under a minute for 4 pages.

**Non-Goals:** crawling a whole site, SEO, performance lab metrics (LCP, CLS), uptime, security headers, and auditing pages behind a login.

## Decisions

### Share the guard, not the tool

The audit gets its own tool instead of a `url` option on `check_open_design_artifact`. The check's contract is "your design is ready", with errors that block; an audit of someone else's site has no "ready" and nothing to block. A separate result type keeps check history and critique free of foreign pages. The URL guard, browser launch and blocked-page detection move to a shared `export/livePage.ts` used by both extraction and audit.

### Only checks that don't need kit markup

The audit keeps an allow-list of the checks that read only the DOM and computed styles (`LIVE_PREFLIGHT_CHECKS` in `siteAudit.ts`) and runs only those. State, flow, data and token checks stay artifact-only. This avoids false findings ("no empty state") on pages that were never meant to have them.

### Rank by visitor cost, show at most five

A real site can produce 80 contrast findings. The report groups findings by check and element pattern, ranks the groups by a fixed weight per check, times 1 + log10 of the distinct elements, times 1.5 for a group with an element in the first screen and 0.5 for the footer, and shows the top 5 with a crop each. `audit.json` keeps everything.

### Page weight is the only speed signal

Bytes transferred and request count come from the browser's network log during the load. They are reported against stated budgets (2 MB, 80 requests on the phone load). Anything more would need a throttled lab run the kit can't do reliably everywhere.

## Risks / Trade-offs

- **Third-party sites change and block bots.** The report carries the capture time and screenshots, so a claim can be checked later. Blocked pages are reported, never retried with tricks.
- **Consent banners cover the page.** The audit hides elements matching common consent-manager selectors before measuring and notes that it did.
- **Overclaiming.** The scope statement is fixed text in the report, and tests assert that the report holds no number the audit didn't compute.
- **Evals can't reach public sites from the container.** The eval runner serves the fixture site on loopback and allows that one host through a test-only setting (`OPEN_DESIGN_ALLOW_HOSTS`, read only when `OPEN_DESIGN_EVALS=1`), as the extraction tests already do with `allowHostsForTesting`.
- **Phone without mobile emulation.** Chrome's mobile emulation zooms out to fit overflowing content, which hides sideways scrolling. The phone pass uses a 390 px viewport with touch but without `isMobile`, and checks the viewport tag from the DOM.
