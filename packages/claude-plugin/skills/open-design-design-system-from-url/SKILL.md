---
name: "open-design-design-system-from-url"
description: Make a design system from a website — measure its real colours, fonts, spacing and button states in a browser, write DESIGN.md and tokens.css that agree, and check the result side by side with the site before saving — use whenever the user wants a design system, brand kit, theme or tokens taken from a website or URL ("make a design system from stripe.com", "match our site's look", "extract the brand from this page"), even if they don't mention Open Design
argument-hint: the website address, and optionally light/dark/both and whether it's your brand (e.g. "https://example.com, dark, our brand")
---

<!-- generated:curated-entry -->

Make an Open Design design system from a website: measure the rendered site, write `DESIGN.md` and `tokens.css` from one set of measurements, and check the result against the site before saving it.

Request: "$ARGUMENTS" — or, if that is empty, the user's request in this conversation (if it isn't clear, ask the user: "Which website should the design system come from?")

**How to talk to the user.** Many people using Open Design don't write code, so:
- Use the user's own words. If they say "artifact", "design tokens" or give a file path, use those terms back; otherwise use the plain words below.
- Keep the machinery out of replies: no tool names, no ids like `od:prototype:poster-hero`, no internal files (`.artifact.json`, `.comments.json`, `config.json`), and not the words "register", "manifest", "sidecar", "entry" or "surface", unless the user used them first.
- Explain a print term the first time it comes up, in one short clause, and not again.
- Say where a file is the way the user would find it ("in your Open Design folder, under seed-swap-flyer"). Give a raw path only where the user can click it (Claude Code, Claude Desktop's Code tab, VS Code) or asks for it.
- End each reply that finishes a step with one line on what they can do next, with at most two options ("Want it in Instagram sizes too, or is it ready to print?").

| Instead of | Say |
|---|---|
| artifact, entry, registered | your design, saved |
| design system, active design system | your style (the first time: "a saved style: colours, fonts and spacing") |
| surface, skill, template, recipe | kind of design, starting layout, or nothing |
| workspace, output directory | your folder, your Open Design folder |
| bleed | print edge ("a few millimetres extra that the printer trims off") |
| trim size | final size |
| preflight findings, errors | "I checked it and fixed…", "one thing to look at:" |
| export | save as PDF, save as an image |
| inline preview, MCP App | the preview above |

## 1. Ask only what's missing

Three things decide the run. Take each from the request when it says so, and ask only about the ones it leaves open, in one message:

1. **The address** (and, optionally, up to 3 more pages on the same site, such as a pricing or product page).
2. **Light, dark or both.** Default to light if the user doesn't care.
3. **Their own brand, or a reference?** For a reference site the design system is named "<Name>-inspired" and no logos or images are copied.

If the request already answers all three ("make a dark design system from https://example.com, it's our brand"), ask nothing and go straight on.

## 2. Measure the site

Call `extract_open_design_design_system` with `url`, `extraUrls` if there are any, and `theme`.

- **`ok`**: you get a `draft` (contract tokens, a `[data-theme="dark"]` set only if the site has a dark theme), `sources` saying which element each value came from (and `declared`, the site's own CSS variable with that value), the `unmeasured` tokens, `conflicts`, `notes` and the screenshot. Look at the screenshot and the role crops in the evidence bundle before writing anything.
- **`conflicts`**: another page (or its dark theme) gave a different value for a token. The draft keeps the first page's. If the difference matters (a second accent on the pricing page), show it to the user in the review and ask which one is the brand's.
- **`notes`**: say which overlays were hidden before measuring (consent banners and chat widgets are never the brand), describe any gradient they mention in DESIGN.md (the token holds only its first colour stop), and mention an input radius that differs from the button's.
- **`partial`** (no browser installed): only candidate colours and fonts from the page source. Tell the user, show the candidates, and ask them to confirm the brand colour and font, or to install Chrome for a full measurement.
- **`blocked`**: show the user the screenshot and the reason. Ask for the site's CSS, a screenshot of the page they mean, or another public page. Don't retry the same page.
- An invalid-args error (a private address, an extra page on another site): tell the user what was refused and why.

If the user asked for dark and the result notes that no dark theme was found, say so. Don't invent dark values.

## 3. Write both files from the draft

Call `create_open_design_design_system` with a `name` (for a reference site, "<Name>-inspired") and a `brief` describing the site in a sentence. Don't pass `sourceUrl`: you have better measurements already. It returns the `suggestedEntryPath`, the `id` and the token contract.

Write `DESIGN.md` at `suggestedEntryPath` and `tokens.css` beside it, **both from the same draft**:

- **`tokens.css`**: start from `draftCss`. Keep every measured value exactly as measured. For an `unmeasured` token, leave it out so the contract fallback applies, or derive it from measured ones (a `color-mix()` of `--accent` for a missing hover); never make one up, and don't fill two steps with the same value.
- **Sanity-check each role against the screenshot first.** If a measured value plainly can't be that role (text that would be unreadable on `--bg`, a hairline as a spacing step), drop it and say so; don't write prose to explain it away.
- **`DESIGN.md`**: the values it names (primary colour, surface, text, the font families, the type scale) must be the same values as `tokens.css`. Where `sources` names the site's own variable for a value, use that name in DESIGN.md too (`#635bff, the site's --color-brand-500`). Write the prose (atmosphere, layout, components, voice, do and don't) from the screenshots. For a reference site, say near the top that it is inspired by the site and name it.
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
