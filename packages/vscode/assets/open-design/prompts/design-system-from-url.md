---
name: open-design-design-system-from-url
description: Make a design system from a website or a Figma file — measure its real colours, fonts, spacing and button states, write DESIGN.md and tokens.css that agree, and check the result side by side with the source before saving
argument_hint: the website address or Figma link, and optionally light/dark/both and whether it's your brand (e.g. "https://example.com, dark, our brand")
placeholder: Which website or Figma file should the design system come from?
model_trigger: use whenever the user wants a design system, brand kit, theme or tokens taken from a website, URL or Figma file ("make a design system from stripe.com", "take our design system from my Figma file", "match our site's look", "extract the brand from this page"), even if they don't mention Open Design
---

Make an Open Design design system from a website or a Figma file: measure the rendered site (or read the file's variables), write `DESIGN.md` and `tokens.css` from one set of measurements, and check the result against the source before saving it.

Request: {{brief}}

{{voice}}

## 1. Ask only what's missing

Three things decide the run. Take each from the request when it says so, and ask only about the ones it leaves open, in one message:

1. **The address** (and, optionally, up to 3 more pages on the same site, such as a pricing or product page) — or a link to a Figma file or frame.
2. **Light, dark or both.** Default to light if the user doesn't care.
3. **Their own brand, or a reference?** For a reference site the design system is named "<Name>-inspired" and no logos or images are copied.

If the request already answers all three ("make a dark design system from https://example.com, it's our brand"), ask nothing and go straight on.

**No website, or not one this can open?** The brand may live elsewhere: a Figma file, a page that isn't public (an intranet or a members-only page), a native app, or a brand with only a PowerPoint template or a brand guide. Ask which of these the user has, and pass them as `sources` (up to 6, with or without `url`):

- `{ kind: "figma", ... }`: the user's Figma file or frame. Pass its link as `url` first: see "From a Figma file" below.
- `{ kind: "template", path }`: a PowerPoint template (`.pptx` or `.potx`). Its theme colours, fonts, text sizes and the logo on its master. A legacy `.ppt` must be saved as `.pptx` first; a template still on the stock Office theme has no brand to take.
- `{ kind: "brandGuide", path }`: a PDF, DOCX, PPTX or Markdown brand guide. Colour codes with their labels (Primary, Background, Text map to roles; CMYK is converted and marked so; a Pantone-only colour is noted, ask for its hex) and the typefaces it names.
- `{ kind: "css", text | path }`: a stylesheet, a Tailwind theme or a `tokens.json` (W3C design tokens). Roles come only from names the file gives (`--color-primary`, `background`).
- `{ kind: "html", text | path }`: page source.
- `{ kind: "screenshot", path | data }`: a PNG of the site or app. Colours are sampled, and fonts can't be read from pixels: ask the user to confirm them.

Each value in `sources` then carries a `confidence`: `measured` (a rendered page), `declared` (CSS, tokens, a template), `stated` (a brand guide) or `sampled` (a screenshot). Where sources disagree the draft keeps the more trusted value and lists the other under `conflicts`: show the user those and ask which is the brand's. `sourceCandidates` are colours with no role yet, and `chartPalette` (from a template) is the brand's order for chart series; mention it in DESIGN.md.

**From a Figma file.** Call `extract_open_design_design_system` with the file or frame link as `url`. It returns `status: "needs-figma-read"` and `instructions`: the steps to read the file through your Figma connector (or a local access token). Follow them, and pass the replies back unchanged as a `figma` source with the same `url`. In short: check the connector with `list_open_design_integrations` and your own Figma tools, load Figma's guidance with `get_figma_skill`, find the token, logo and primary-button frames in `get_metadata`, read their variables with `get_variable_defs`, read the collections and scopes with `search_design_system`, then export the logos (`get_screenshot` for a PNG, or the SVG URL `get_design_context` returns) and name each font family under `fonts`. If the frames hold no token variables, ask the user for the link to the file's foundations page rather than guessing colours from the canvas. If there is no connector, offer to connect Figma once, and only after they say yes; otherwise fall back as the instructions say (published styles with a token, or a screenshot of the foundations page). On the hosted server, pass each logo's `role` and `name` only and don't call Figma's variables REST API. The draft that comes back is used like any other: same review in step 4, and `brand.json` records `source: "figma"` with the file link, the frames read and the date.

**If the tool refuses `url`** because it runs on a hosted server that doesn't open websites: fetch the page yourself, with your own web tool if you have one, and pass its HTML and its main stylesheets as `html` and `css` sources. If you can't fetch, ask the user for a screenshot, the CSS, a brand guide or a template.

**Refreshing one you saved.** If the user wants an existing design system brought up to date with the site ("our site changed, refresh our design system"), call `extract_open_design_design_system` with `compareTo` set to its id (and no `url`: it uses the addresses the system was saved from). The result's `refresh` lists the tokens added, changed (`from` and `to`) or no longer measured, and fonts, component specs and marks added or removed. Nothing has changed yet. Show the changes to the user in groups (colours, type, spacing and shape, components, marks) and apply only the groups they confirm, to `tokens.css` and `DESIGN.md` together. Then stop: the rest of this recipe is for a new system.

## 2. Measure the site

Call `extract_open_design_design_system` with `url`, `extraUrls` if there are any, and `theme`.

- **`ok`**: you get a `draft` (contract tokens, a `[data-theme="dark"]` set only if the site has a dark theme), `sources` saying which element each value came from (and `declared`, the site's own CSS variable with that value), the `unmeasured` tokens, `conflicts`, `notes` and the screenshot. Look at the screenshot and the role crops in the evidence bundle before writing anything.
- **The accent**: `sources['--accent']` has `candidates` (up to four colours that competed, each with the controls and links using it, its chroma, any `declared` brand property, whether the logo uses it, and a `crop`) and `choiceConfidence` (0–1). **Below 0.5, ask before writing anything**: show the user the top candidates' crops with their hex values ("the site uses both of these on buttons: which is your brand colour?") and use their pick. At 0.5 or above, use the draft's accent and mention the runner-up only if the user asks.
- **Pages**: with no `extraUrls`, the tool also measures up to three pages from the site's navigation and lists them as `discovered`; say which pages were measured. Pass `discover: false` only when the user wants one page measured.
- **`conflicts`**: another page (or its dark theme) gave a different value for a token. The draft takes the value most pages use (`sources[token].coverage` and `scope`); the first page's wins a tie. If the difference matters (a dark home page, a second accent on the pricing page), show it to the user in the review and ask which one is the brand's. `draft.consistency.outliers` are values only one page uses: mention them, and don't make tokens of them.
- **`notes`**: say which overlays were hidden before measuring (consent banners and chat widgets are never the brand), describe any gradient they mention in DESIGN.md (the token holds only its first colour stop), and mention an input radius that differs from the button's.
- **`partial`** (no browser installed): the page source and its stylesheets were read instead, so roles come only from the names the CSS gives them. Tell the user, show the draft and the candidates, and ask them to confirm the brand colour and font, or to install a browser for a full measurement.
- **`blocked`**: show the user the screenshot and the reason. Ask for a screenshot of the page they mean, the site's CSS, a brand guide or a template, and call again with them as `sources`, or try another public page. Don't retry the same page.
- An invalid-args error (a private address, an extra page on another site): tell the user what was refused and why.
- **`needs-figma-read`**: the link is a Figma file. Its `instructions` are the reading steps described under "From a Figma file" in step 1: follow them, then call again with a `figma` source. Don't write `DESIGN.md` or `tokens.css` from the link alone.
- **`nearest`** (reference sites): the three bundled design systems closest to the draft in style, each with the axes where it differs, and `distinctive`, the draft's most unusual features. Before writing a "<Name>-inspired" system, offer the closest one as a brand-free starting point ("`vercel` is close: same near-black text and tight radius, but a different accent. Start from it, or keep going with the site's own look?"). If the user picks it, set it active instead and stop. For the user's own brand, don't offer them; use `distinctive` in DESIGN.md's atmosphere instead.
- **`brandKit`**: the brand kit the page shows. `marks` with roles (`logo`, `logo-dark`, `logo-on-dark`, `icon`, `touch-icon`, `manifest-icon`, `social`) and the background each was seen on; `fonts` with their source (`google` with a stylesheet, `adobe`, `self-hosted`, `system`), and for a self-hosted or Adobe face a `freeMatch`; `components` (primary, secondary and ghost buttons, the input and its focus style, card, nav, badge, in px with a crop each); `voice` (sampled lines and counted facts: heading case, sentence length, person, exclamations, emoji); and `imagery` (hero kind, image radius and ratios, the icon set with its style and stroke). The create call puts it into `brand.json`.

**Fonts for the user's own brand.** If `brandKit.fonts` has a `self-hosted` face, it may be licensed. Ask the user once whether they hold the licence for it. If they say yes, pass `fontLicence: "confirmed"` to the create call, which copies the font files into the design system. If not, or for a reference site, name the face in DESIGN.md and use its `freeMatch` as the loaded fallback, and say so.

If the user asked for dark and the result notes that no dark theme was found, say so. Don't invent dark values.

## 3. Write both files from the draft

Call `create_open_design_design_system` with a `name` (for a reference site, "<Name>-inspired"), a `brief` describing the site in a sentence, `kind` (`own` for the user's brand, `reference` otherwise), `evidenceDir` (the result's `bundleDir`) and a `descriptor` (`moods`, `industries`, `surfaces`) from what you see. Don't pass `sourceUrl`: you have better measurements already. It returns the `suggestedEntryPath`, the `id`, the token contract, `brand` (the `brand.json` it wrote, which keeps the source addresses and the site's screenshot as `reference.png`) and `review` (a review page, see step 4). With `kind: own`, the recommender, the check and the critic treat it as the user's brand from then on.

Write `DESIGN.md` at `suggestedEntryPath` and `tokens.css` beside it, **both from the same draft**:

- **`tokens.css`**: start from `draftCss`. Keep every measured value exactly as measured. For an `unmeasured` token, leave it out so the contract fallback applies, or derive it from measured ones (a `color-mix()` of `--accent` for a missing hover); never make one up, and don't fill two steps with the same value.
- **Sanity-check each role against the screenshot first.** If a measured value plainly can't be that role (text that would be unreadable on `--bg`, a hairline as a spacing step), drop it and say so; don't write prose to explain it away.
- **`DESIGN.md`**: the values it names (primary colour, surface, text, the font families, the type scale) must be the same values as `tokens.css`. Where `sources` names the site's own variable for a value, use that name in DESIGN.md too (`#635bff, the site's --color-brand-500`). Write the prose (atmosphere, layout, do and don't) from the screenshots. For a reference site, say near the top that it is inspired by the site and name it.
- **Components**: write a Components section from `brandKit.components` as numbers ("Primary button: 44px high, 0 24px padding, weight 600, sentence case, pill radius, no border"), one line each for the buttons, the input (with its focus style), the card, the nav (sticky or not) and the badge. Leave out what wasn't measured.
- **Voice**: describe the tone from `brandKit.voice`'s facts and samples (sentence case, short sentences, speaks to "you", no exclamation marks). For the user's own brand you may quote a line or two as examples; for a reference site, describe the tone and copy no lines.
- **Imagery**: from `brandKit.imagery`, say what the hero uses (photo, illustration, 3D, video), the image corner radius and ratios, and the icon set ("Lucide, outline, 1.5 stroke"). These are hints from the page, so call them that if the screenshots disagree.
- **Marks**: for the user's own brand the create call copies `brandKit.marks` (or, from Figma, the logos you passed as a `figma` source) into `assets/` beside `DESIGN.md` (its `brand.json` lists them); mention them in DESIGN.md (which logo goes on light, which on dark). For a reference site, none are copied. A Figma draft's fonts are listed by family, as on a site.

## 4. Review it side by side

The create call already wrote `review.html` (its `review`) and registered it: the site's screenshot on the left, and on the right a sample (a hero, a primary and secondary button, a card, a form row) styled only by the new `tokens.css`, so it shows each edit to `tokens.css` as you make it.

Below the two columns, a **Components** band shows each of the site's captured components (buttons, badge, input, card, nav) beside a replica built only from the nearest tokens.

Call `check_open_design_artifact` on it. **Fix the component findings first**: a `brand-fidelity` warning such as "Primary button 81%: spacing. The site pads 14px 28px; nearest tokens give 12px 24px" means a button rebuilt from your tokens doesn't look like the site's, and names the token family that costs the most with both values. Adjust that family in `tokens.css` (or, when no token can hold it, like a bold weight or a hard shadow, say it in DESIGN.md's Components section); `info` notes list properties no token covers. Then the other `brand-fidelity` findings, which name each place the sample differs from what was measured on the site (the button colour, text colour, background, heading and body font, button and card radius), with both values: fix those in `tokens.css` unless you have a reason (say it). Compare the two columns yourself too (density, weight, shape), then show the user the review and ask whether it matches.

Apply what the user says ("the buttons are rounder on the site" → raise the radius tokens) in both files, rebuild the review and check again. Stop after **two rounds** of fixes: save then, and list anything still open.

## 5. Save

Call `set_active_design_system` with the returned `id` if the user wants to design with it now (offer it). Tell the user the design system's id and where its files are, and that the measurements are kept in the evidence bundle.

For the user's own brand, also offer to write the project's root `DESIGN.md` (`set_active_design_system` with `writeProjectDesignMd: true`), saying that other design tools in the project (Claude Design, Cursor, v0, Stitch and other agents) read that file, so they will use the brand too. Skip the offer if the project already has a root `DESIGN.md` the user wrote.

If the site is one the user wants to improve or pitch a redesign for, offer to audit it too: `audit_open_design_site` checks the same pages for contrast, phone layout and other problems (the `open-design-site-audit` skill has the steps).

<!-- claude-only -->
**Claude Design.** If you have Claude's Artifact tool, offer to copy the design system into Claude Design as a Design System artifact — including one drafted from a Figma file, once it is saved. Call `export_open_design_design_system` with its id: it writes Claude's `project/` files (checked against Claude's format), the brand's logo and icons under `project/assets/` for the user's own brand, and a `brand.html` page. Then publish the `project/` files with your Artifact tool as a Design System artifact, and show the user `brand.html`.
<!-- /claude-only -->
