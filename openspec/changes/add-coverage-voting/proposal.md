## Why

With `extraUrls`, every page is measured fully, but the first page's value wins for every role, and the others' values become `draft.conflicts` (`extend-site-extraction`). That is right when the home page is typical. It is wrong when the home page is the odd one out: a campaign hero, a dark landing page on an otherwise light site, a seasonal accent. The draft then encodes the exception, and the site-wide value sits in a conflicts list the agent may not raise.

design-extract's `site` command elects each token by **coverage**, the share of pages that use it. A value used on 80% or more of pages is site-wide, 40% or more is section-level, and anything less is page-local. Near-identical colours are merged in OKLab before counting. Coverage also gives a consistency grade, with the off-system outliers listed.

The user also has to pick the pages today. A user who says "make a design system from acme.com" gets only the home page, unless the agent thinks to add more.

## What Changes

- **Coverage election.** With two or more pages, each role's value is the one with the highest coverage. Ties are broken by the current score (the home page first). Colours within ΔE 2000 of 3 count as one, keeping the most-used exact value. Each drafted token's source gains `coverage` (pages using it, out of pages measured) and `scope`: `site-wide` at 80% or more, `section` at 40% or more, otherwise `page-local`. Conflicts still list every other value, now with their coverage.
- **Home page outlier noted.** When the elected value differs from the home page's, a note says so: "--bg: the home page is dark (#0b0b0f), the other 3 pages are light (#ffffff)". The agent shows it to the user in the review.
- **Pages found for you.** A new `discover` input (default `true` when `extraUrls` is not given) adds up to 3 same-site pages from the home page's header and footer navigation. It prefers pricing, product or features, about and a docs or blog index, in that order, and skips log-in, sign-up, legal, careers and anything `robots.txt` disallows. Discovered pages are listed in the result. The existing limits (4 pages, 20 seconds each) are unchanged.
- **Consistency summary.** The result gains `consistency`: for colours, radii, fonts and spacing, the share of measured values that fall on drafted tokens, plus the page-local outliers with their page and crop. It is a short list for DESIGN.md and the review, not a grade.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `design-system-extraction`: coverage election across pages, scope on each token, page discovery and a consistency summary.

## Impact

- `packages/core/src/generation/evidenceToTokens.ts`: election by coverage, merge rule, `coverage` and `scope` on sources, notes.
- `packages/core/src/generation/siteExtraction.ts`: `discover` (nav links, preference order, skip list, robots.txt), consistency summary.
- MCP and VS Code extract tools: `discover` input. Gateway: not affected (sources only).
- Skill: show home-page outliers in the review; mention discovered pages.
- Fixtures: a 4-page site with a dark home page and light inner pages; nav with a log-in and a legal link to skip. Benchmark before and after.
- Docs: tools reference, design systems guide.
