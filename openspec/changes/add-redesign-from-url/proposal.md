## Why

The fastest pitch for a redesign is the prospect's own site, made better: their name, their services, their opening hours, their photos, in a layout that fixes what's wrong. Today the kit can take a site's brand (`extract_open_design_design_system`) and it can design a landing page, but the page starts from a brief. The agent invents the copy, or the user pastes it in. Generic AI builders produce a draft in minutes. The kit should produce a *credible* one: real content, real brand, and checks passed.

This is the second pick of the web design client workflow study (2026-11-03). It reuses the redesign base screen from add-design-from-app (`.bases/`) and feeds the before/after page (add-before-after).

## What Changes

- **Content inventory from a URL.** A new step in the site browser session, offered by `extract_open_design_design_system` with `content: true` and used by the audit as well. It writes `content.json` beside the evidence. The file holds the site's pages (up to 4), each with its title, headings in order, body copy blocks, calls to action with their targets, navigation, contact details, opening hours, prices and services as they appear, and images with their alt text and size. Text is copied as it is, with its source page and selector. Nothing is summarized or invented.
- **Images by reference.** Images stay as URLs in the inventory. The concept uses them for the preview, and a `localize` option copies them into the design folder only when the user says the site is theirs or the client agreed.
- **New recipe skill `open-design-redesign`.** For "redesign <url>", "make our website better", "a new version of this site". Steps:
  1. Audit the site (when add-site-audit is installed).
  2. Take the brand and content.
  3. Ask one question: keep the brand or refresh it.
  4. Design the home page, and up to 3 inner pages as a linked flow, with the inventory as sample data.
  5. Check and critique.
  6. Store the old pages as base screens.
- **Fixes, not just restyling.** The brief section lists the audit's top findings, and the design must address each one: the critic gets them as tasks. Copy may be tightened, but only in a `data-od-copy-edit` element that keeps the original in `data-od-original`, so the pitch can show what changed.
- **Concept marking.** Every page of a redesign of a site the user doesn't own carries a removable "Concept by <designer>, not affiliated with <business>" ribbon. The ribbon is preview-only once the user says the client signed.

## Capabilities

### New Capabilities
- `site-redesign`: the content inventory, the redesign recipe, copy-edit marking and concept marking.

### Modified Capabilities
- `design-system-extraction`: extraction may also write `content.json` when asked.

## Impact

- `generation/siteExtraction.ts` (content pass), new `generation/contentInventory.ts`.
- `composeInstructions.ts` (redesign section: inventory, findings to fix, copy-edit rule), `sampleData.ts` (inventory as a data file), `baseScreen.ts` (store each captured page as the base of its redesign).
- New skill in `packages/content/local/skills` and the Claude plugin, `surfaces.json` route for redesign requests.
- Docs `guides/redesign-a-website.md`, `reference/tools.md`, CHANGELOG; eval brief on the audit fixture site.
