## Why

Designers who sell redesigns start by judging the prospect's current website, and the best pitch names specific problems ("your menu text is 2.4:1 on your photo", "the booking button is below the fold on a phone"). The kit already has the checks for those problems (contrast, tap targets, 320 px reflow, large text, overflow, taste rules, screen economy), but `check_open_design_artifact` runs them only on designs the kit made. A live site gets nothing but brand extraction.

This is the first pick of the web design client workflow study (2026-11-03, "Web design client workflow: kit opportunities"). It also serves owners redesigning their own site, and it gives the redesign recipe (add-redesign-from-url) and the pitch page (add-before-after) the "before" findings they compare against.

## What Changes

- **New MCP tool `audit_open_design_site`.** Takes a URL plus up to 3 more pages on the same site. Renders each at desktop (1440×900) and phone (390×844) sizes in the same polite browser the extractor uses: http(s) only, no private hosts, no cookies, logins or form posts, 20 s per page. A bot check or login wall is reported as `blocked`, with its screenshot.
- **The kit's own checks, on a page it didn't make.** Runs the browser passes that don't depend on kit markup: `contrast`, `overflow`, `overlap`, `horizontal-scroll` and `tap-target` on the phone, `reflow` (320 px), `large-text-overflow`, `screen-economy` (nothing to tap on the first phone screen), and the taste rules (`slop-glow`, `card-row`, `uniform-surface`, `intent`). `type-scale` needs the kit's tokens, and `focus-visible` and `reduced-motion` need the state pass's forced states, so they stay off in this version. It adds four findings that only make sense for a live site: `page-weight` (bytes and request count over a budget), `missing-viewport`, `missing-alt` and `broken-asset` (files from the site that fail to load). Checks that need kit markup (states, flows, sample data, tokens) are skipped.
- **A findings page.** The audit is written to `<outputDir>/.audits/<site-slug>/` as `audit.json`, numbered screenshots with the finding marked, and `index.html`. The page is a short, plain-language report: the top 5 findings ranked by impact, each with a crop, what it costs the visitor, and the fix. It is meant to be read by a business owner, not a developer.
- **Honest scope.** The report names the checks it ran and says what it doesn't measure (search ranking, real-user speed, conversion). It never shows a score it didn't compute and never imitates Lighthouse.
- **Skill.** A new step in the `open-design-design-system-from-url` and redesign flows, plus a short `open-design-site-audit` skill for "audit this site", "what's wrong with our website" and "find problems on <url>".

## Capabilities

### New Capabilities
- `site-audit`: auditing a live URL with the kit's checks, the findings page and its scope statement.

### Modified Capabilities
None. `artifact-visual-check` keeps its requirements; the audit reuses its browser passes.

## Impact

- New `packages/core/src/export/siteAudit.ts`, sharing the URL guard and browser setup with `generation/siteExtraction.ts` and the page scripts with `checkArtifact.ts`, `screenChecks.ts` and `poster/pageScripts.ts`.
- MCP `tools.ts` (new tool, hidden on the hosted gateway like extraction), VS Code language model tool, Claude plugin skill.
- Docs: new `guides/site-audit.md`, `reference/tools.md`, CHANGELOG.
- Evals: a saved fixture site served locally (the container blocks many public sites), and a brief.
