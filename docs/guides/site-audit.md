# Audit a website

Check a live website for the problems a visitor runs into, using the same checks Open Design runs on its own designs, and get a short report you can read with the site's owner.

Use it before a redesign pitch ("what's wrong with this site?"), on your own site, or to get talking points for a client call. Ask your agent:

> Audit https://rosas-trattoria.example, plus the menu page.

The agent calls `audit_open_design_site` and tells you the biggest problems in plain words. The report is saved as a folder you can open, zip or publish.

## What it checks

Each page is rendered in your installed Chrome, Edge or Chromium at desktop (1440×900) and phone (390×844) sizes.

| Problem | Where it's checked |
|---|---|
| Text that's hard to read (WCAG AA contrast) | desktop and phone |
| Text that runs out of its box or is covered | desktop and phone |
| Stock patterns: indigo glows and gradients, rows of identical cards, every card the same, main and destructive actions that look like the others ([calibrated](#template-looks)) | desktop and phone |
| The page scrolls sideways | phone, then 320 px wide (WCAG reflow) |
| Buttons and links too small or too close to tap | phone |
| Nothing to tap on the first screen | phone |
| The layout breaks when the reader's text is larger (20 px) | phone |
| Images without `alt` text | phone |
| No viewport tag, so phones show the desktop site shrunk | phone |
| Images, styles, scripts or fonts from the site that fail to load | phone |
| Download size and request count (over 2 MB or 80 requests) | phone |

Cookie and consent banners are hidden first, so they don't cover the page; the report says when it hid one.

Checks that only make sense for Open Design's own markup (states, flows, sample data, design tokens) don't run on a live site.

### Template looks

The pattern checks were written for Open Design's own designs, and plenty of hand-made sites use an indigo gradient or a row of three cards on purpose. So on a live site each one is held to a measured bar: it is run on about 40 hand-made sites (government, publishers, museums, studios and well-known brands), and it counts as a problem only if it fires on 5% of them or fewer. A check over the bar, or one not yet calibrated, is listed under **Notes** ("a common pattern, but many hand-made sites do this too"), not among the problems. A single pattern is named for what was seen ("Stock indigo glows and gradients"); the report says a page **looks like a stock template** only when two or more different patterns appear on it, and that combination is held to the same bar. The report names the date of the calibration it used. The [design check](../reference/tools.md#check_open_design_artifact) on your own designs is not affected.

## The report

`<output folder>/.audits/<site>/index.html` shows:

- the **five biggest problems**, ranked by what they cost a visitor (a problem in the first screen or on every page counts more than one in the footer), each with where it is, what it costs, the fix and a crop with the element marked in red;
- the smaller issues as a table;
- desktop and phone screenshots of each page;
- what was checked, and what wasn't.

`audit.json` beside it keeps every finding with its page, size, region and position.

The report gives **no score**, and it makes no claims about search ranking, real visitors' loading speed or conversion. Those need other tools.

## Limits

- Public `http` and `https` pages only. Private, loopback and local addresses are refused, for the page and everything it loads.
- At most 4 pages on one site, 20 seconds each.
- No cookies, logins or form submissions. A bot check, a login wall or an empty page is reported as blocked, with its screenshot; the agent doesn't try to get past it.
- Not offered by the hosted server (Claude and ChatGPT on the web), which doesn't render other websites.

## Next steps

- **Redesign it:** make a concept that keeps the site's words and brand and fixes these problems ([Redesign a website](redesign-a-website.md)).
- **Match the site's brand:** [take a design system from it](design-systems.md#take-one-from-a-website).
- **Share the report:** zip the folder, or publish it like any design ([Share and publish](share-and-publish.md)).
