## ADDED Requirements

### Requirement: Content Inventory

When asked for content, extraction SHALL write `content.json` for each page it loads. The file SHALL hold the title, headings with levels, body blocks, calls to action with targets, navigation, contact details, opening hours, prices, and images with alt text. Each entry SHALL keep its source page and selector, and text SHALL be copied verbatim. The pass SHALL honour `robots.txt` disallow rules and the 4-page limit.

#### Scenario: Verbatim copy
- **WHEN** a page's hero heading reads "Fresh bread since 1962"
- **THEN** `content.json` holds that exact text with its page URL and selector

#### Scenario: Disallowed page
- **WHEN** `robots.txt` disallows `/menu` and the user asks for `/menu` as an extra page
- **THEN** that page is skipped, and the result says why

### Requirement: Redesign Recipe

The `open-design-redesign` skill SHALL audit the site when the audit tool is available, take its brand and content, and ask at most one question (keep or refresh the brand). It SHALL design a home page and at most 3 inner pages as a linked flow bound to the inventory, store each old page as its base screen, and pass the audit's top findings to the brief and the critic as tasks.

#### Scenario: Findings carried into the design
- **WHEN** the audit's top finding is a booking button below the fold on a phone
- **THEN** the brief lists it, and the critic checks that the redesigned home page has its booking action above the fold

### Requirement: Marked Copy Edits

A redesign SHALL keep the business's text as bound from the inventory. Any rewritten text SHALL be in an element marked `data-od-copy-edit` that keeps the original in `data-od-original`.

#### Scenario: Tightened tagline
- **WHEN** the agent shortens a 40-word intro to 18 words
- **THEN** the element carries `data-od-copy-edit` and the original 40 words in `data-od-original`

### Requirement: Concept Marking

Pages of a redesign of a site the user hasn't said they own SHALL show a preview-only "concept, not affiliated" ribbon. The ribbon SHALL be removed only when the user says the site is theirs or the work is commissioned. Publishing a ribbon-marked design to a public host SHALL warn.

#### Scenario: Forwarded link
- **WHEN** the designer publishes a concept for a bakery's site they don't own
- **THEN** the published page shows the ribbon, and the publish result warns that it is a concept of a third party's site
