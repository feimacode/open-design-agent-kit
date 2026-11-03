---
name: open-design-redesign
description: Redesign a live website — audit it, take its brand and its real words, photos, hours and prices, and design a new home page and up to 3 inner pages as one linked site that fixes the problems found, marked as a concept until the owner agrees
argument_hint: the website address, and optionally up to 3 more pages (e.g. "https://rosas.example, plus /menu and /contact")
placeholder: Which website should be redesigned?
model_trigger: use whenever the user wants an existing website redesigned, refreshed, modernized or mocked up again ("redesign rosas.example", "show this bakery what a better site could look like", "a new version of our website", "pitch a redesign to this business"), even if they don't mention Open Design; not for a new site from scratch
---

Redesign a live website: keep its content and brand, fix what's wrong with it, and show it as a concept.

Request: {{brief}}

{{voice}}

## 1. Ask one question at most

You need the address. Up to 3 more pages on the same site are optional (a menu, services or contact page); if the request names them, use them, otherwise redesign the home page and pick up to 2 inner pages from its navigation.

Ask only this, unless the request already answers it: **keep the brand (colours, fonts, logo) or refresh it?** Default to keep.

Also note whether the user says the site is theirs or the work is commissioned. Unless they do, treat it as a concept of someone else's site (`owned: false`). Don't ask; it only decides the ribbon.

## 2. Audit the site

If `audit_open_design_site` is available, call it with `url` and `extraUrls`. Tell the user the top problems in one or two lines each; the design will fix them. If it is `blocked`, say why and stop: the same pages won't load for the content either.

## 3. Take the brand and the content in one visit

Call `extract_open_design_design_system` with the same `url` and `extraUrls`, and `content: true`. Add `localizeImages: true` only if the user said the site is theirs.

- Pages `blocked` because robots.txt disallows them are left out. Say so and don't retry.
- **Keep the brand**: write DESIGN.md and tokens.css from the draft, as the `open-design-design-system-from-url` skill does, and save it as a custom design system.
- **Refresh it**: keep the logo and the brand colour, and call `recommend_open_design_design_systems` for the rest.

## 4. Plan the pages

Plan the home page and the inner pages as one linked flow (a `collectionId` and a `flow` plan with the site's main navigation as the shared nav). Lead with what a visitor comes for (book, call, order, find the place), and add it as the flow's task, so the check and the critic walk it.

## 5. Design each page

For each page, call `prepare_open_design_brief` with:

- the `web-prototype` skill, the design system, the flow, `collectionId` and `screenRole`;
- `redesign: { site: <the url>, owned: <true only if the user said so> }`;
- `baseScreen`: that old page's desktop screenshot from the extraction bundle (`screenshots` in its result), so the check shows old and new side by side.

Follow the brief's redesign section: bind the site's own words from `content.json`, mark any rewritten text with `data-od-copy-edit` and the original in `data-od-original`, and keep the concept ribbon unless the site is the user's. Don't invent facts the site doesn't have.

## 6. Check and critique

Call `check_open_design_artifact` on each page and fix what it reports, including `copy-edit-original-missing` and `concept-unmarked`. Then get a second opinion with `open-design-critique`: the critic checks that the audit's problems are gone.

## 7. Before and after

Call `compare_open_design_before_after` with the `collectionId` (or the `entryPath` for a single page). It puts each old page beside the new one, re-checks every audit problem on the new design and lists the copy edits.

- Problems marked **still open** aren't fixed: fix them and run it again, or tell the user plainly which remain.
- Then run it once more with up to 3 `summary` lines for the client, each citing the fixed findings it rests on (`{ "text": "The booking button is readable and on the first phone screen.", "cites": ["F1", "F2"] }`). Lines that cite nothing or an open finding are left out. Don't claim anything the page doesn't show (speed, search ranking, sales).

## 8. Hand it over

Show the user the before/after page and list the copy edits. Offer next:

- **Send it**: export the before/after page as a PDF (one page per screen) for email, or publish the redesign with `open-design-publish`; a flow's published site links to the before/after page from its map. A page with the concept band gets a warning: send the link to the business rather than posting it publicly.
