## Why

Marketing teams rarely need one design. They need a campaign: the same message and visual system across feed posts, stories, a LinkedIn image, web banners, an Open Graph image, an email header, often in several languages and sometimes personalised per region or partner. Every building block exists now: fluid posters that reflow to any shape, `presets` and shape sheets, `adapt_open_design_artifact`, collections, per-row `data` exports and the visual check. But nothing ties them into "one brief in, a whole campaign out". The canvas catalog also lacks the common ad and web sizes, so most of a campaign can't be exported at the right size today.

## What Changes

- **New canvas formats** (screen):
  - `linkedin-image` (1200×627), `og-image` (1200×630), `x-header` (1500×500), `linkedin-banner` (1584×396), `email-header` (600×200, 2× capture).
  - IAB display ads: `banner-mrec` (300×250), `banner-leaderboard` (728×90), `banner-skyscraper` (160×600), `banner-mobile` (320×50). Each ad format is capped at 150 KB, the usual ad-network limit.
- **Campaign flow** as a host prompt, `/open-design-campaign`, on every host:
  1. **Copy:** agree the copy deck (headline, subhead, CTA, legal line, optional per-locale rows) with the user, as a CSV in the campaign folder.
  2. **Master:** build one fluid master with `data-od-field` bindings.
  3. **Channels:** pick the channels from a menu.
  4. **Shapes:** check every shape with a shape sheet, and tune weak shapes with `adapt_open_design_artifact`.
  5. **Other pieces:** build the non-card pieces, which are a landing page and an email (via `email-campaign`, if add-email-and-paste-export has landed), registered into the same collection.
  6. **Export:** export everything with `presets` × `data` (one file per locale or row per shape).
- **Campaign collection:** the master, the landing page and the email are registered into one collection with `screenRole` set to the channel.
  - **VS Code:** the Collections view shows the campaign.
  - **Every host:** `compare_open_design_exploration`'s contact-sheet machinery is reused to write `exports/campaign-sheet.png`, every asset at a glance with error dots.
- **Text-fit check** for localized rows: when bound text overflows its box in a row, preflight already reports `overflow` per row. The flow tells the agent to fix by row (shorter copy or `data-od-fit`) and re-check.
- New attribute **`data-od-fit`** on bound text: export shrinks the font, down to 70%, until the text fits its box, and reports that it did.

## Capabilities

### New Capabilities
- `campaign-kit`: the campaign prompt and flow, the campaign collection and sheet, and `data-od-fit`.

### Modified Capabilities
- `poster-formats`: the named canvas format catalog gains the ad, web and social sizes listed above.

## Impact

- `packages/core/src/poster/formats.ts` (new formats), `poster/pageScripts.ts` (`data-od-fit`), a campaign sheet built on the shape-sheet code.
- `packages/content/local/prompts/campaign.md`, regenerated on every host; a "Campaign" entry in the surface catalog (add-surface-picker).
- Docs: a campaign guide, and new format ids in the reference.
- Depends on the fluid poster pipeline (done). Soft dependencies: add-email-and-paste-export (the email piece), add-surface-picker.
