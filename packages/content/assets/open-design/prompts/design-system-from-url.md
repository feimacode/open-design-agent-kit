---
name: open-design-design-system-from-url
description: Make a design system from a website — measure its real colours, fonts, spacing and button states in a browser, write DESIGN.md and tokens.css that agree, and check the result side by side with the site before saving
argument_hint: the website address, and optionally light/dark/both and whether it's your brand (e.g. "https://example.com, dark, our brand")
placeholder: Which website should the design system come from?
model_trigger: use whenever the user wants a design system, brand kit, theme or tokens taken from a website or URL ("make a design system from stripe.com", "match our site's look", "extract the brand from this page"), even if they don't mention Open Design
---

Make an Open Design design system from a website: measure the rendered site, write `DESIGN.md` and `tokens.css` from one set of measurements, and check the result against the site before saving it.

Request: {{brief}}

{{voice}}

## 1. Ask only what's missing

Three things decide the run. Take each from the request when it says so, and ask only about the ones it leaves open, in one message:

1. **The address** (and, optionally, up to 3 more pages on the same site, such as a pricing or product page).
2. **Light, dark or both.** Default to light if the user doesn't care.
3. **Their own brand, or a reference?** For a reference site the design system is named "<Name>-inspired" and no logos or images are copied.

If the request already answers all three ("make a dark design system from https://example.com, it's our brand"), ask nothing and go straight on.

## 2. Measure the site

Call `extract_open_design_design_system` with `url`, `extraUrls` if there are any, and `theme`.

- **`ok`**: you get a `draft` (contract tokens, a `[data-theme="dark"]` set only if the site has a dark theme), `sources` saying which element each value came from, the `unmeasured` tokens, and the screenshot. Look at the screenshot and the role crops in the evidence bundle before writing anything.
- **`partial`** (no browser installed): only candidate colours and fonts from the page source. Tell the user, show the candidates, and ask them to confirm the brand colour and font, or to install Chrome for a full measurement.
- **`blocked`**: show the user the screenshot and the reason. Ask for the site's CSS, a screenshot of the page they mean, or another public page. Don't retry the same page.
- An invalid-args error (a private address, an extra page on another site): tell the user what was refused and why.

If the user asked for dark and the result notes that no dark theme was found, say so. Don't invent dark values.

## 3. Write both files from the draft

Call `create_open_design_design_system` with a `name` (for a reference site, "<Name>-inspired") and a `brief` describing the site in a sentence. Don't pass `sourceUrl`: you have better measurements already. It returns the `suggestedEntryPath`, the `id` and the token contract.

Write `DESIGN.md` at `suggestedEntryPath` and `tokens.css` beside it, **both from the same draft**:

- **`tokens.css`**: start from `draftCss`. Keep every measured value exactly as measured. For an `unmeasured` token, leave it out so the contract fallback applies, or derive it from measured ones (a `color-mix()` of `--accent` for a missing hover); never make one up, and don't fill two steps with the same value.
- **Sanity-check each role against the screenshot first.** If a measured value plainly can't be that role (text that would be unreadable on `--bg`, a hairline as a spacing step), drop it and say so; don't write prose to explain it away.
- **`DESIGN.md`**: the values it names (primary colour, surface, text, the font families, the type scale) must be the same values as `tokens.css`. Write the prose (atmosphere, layout, components, voice, do and don't) from the screenshots. For a reference site, say near the top that it is inspired by the site and name it.
- **Marks**: for the user's own brand, copy the files in the result's `marks` into an `assets/` folder beside `DESIGN.md` and mention them there. For a reference site, copy none.

## 4. Review it side by side

Write a review page next to the design system as `review.html`, and register it with `register_open_design_artifact`. One page, two columns:

- **Left, "The site":** the desktop screenshot from the evidence bundle (an `<img>` with a relative path to it), cropped with `object-fit: cover` to the top 900px.
- **Right, "The design system":** a sample page that uses only the new `tokens.css` (`<link rel="stylesheet">` to it, or its `:root` block inlined): a hero with a heading and a primary and secondary button, a card with text, and a form row with a label, an input and a button.

Call `check_open_design_artifact` on it. Compare the two columns yourself (colours, font, button shape, density), fix anything that's clearly off, then show the user the review and ask whether it matches.

Apply what the user says ("the buttons are rounder on the site" → raise the radius tokens) in both files, rebuild the review and check again. Stop after **two rounds** of fixes: save then, and list anything still open.

## 5. Save

Call `set_active_design_system` with the returned `id` if the user wants to design with it now (offer it). Tell the user the design system's id and where its files are, and that the measurements are kept in the evidence bundle.

If the site is one the user wants to improve or pitch a redesign for, offer to audit it too: `audit_open_design_site` checks the same pages for contrast, phone layout and other problems (the `open-design-site-audit` skill has the steps).

<!-- claude-only -->
**Claude Design.** If you have Claude's Artifact tool, offer to copy the design system into Claude Design as a Design System artifact. Export it with `npx tsx scripts/claude-design-system.ts export <its folder> <out-dir>` when you're in a checkout of the agent kit; that writes Claude's format and checks it. Otherwise follow the Open Design design systems guide, "Use one in Claude Design".
<!-- /claude-only -->
