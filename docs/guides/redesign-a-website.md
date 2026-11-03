# Redesign a website

Make a new version of a live website that keeps its own words, photos and brand, fixes what's wrong with it, and is clearly marked as a concept until the owner agrees. It's the usual way to pitch a redesign to a business: show them their own site, better.

Ask your agent:

> Redesign https://rosas-trattoria.example so I can pitch it to the owner. Keep their real menu, hours and address.

The agent uses the `open-design-redesign` skill. In VS Code it's the `/open-design-redesign` prompt, or the **Redesign a website** card in the picker.

## What happens

1. **Audit.** The site is [audited](site-audit.md) at desktop and phone sizes. The top problems become the redesign's to-do list.
2. **Brand and content, in one visit.** [Extraction](design-systems.md#take-one-from-a-website) measures the brand and, with `content: true`, copies each page's content into `content.json`: headings, body copy, buttons and their targets, the menu, phone numbers, email, address, opening hours, prices and images with their alt text. Text is copied exactly, with the page and element it came from. Pages the site's `robots.txt` disallows are skipped, and the agent tells you which.
3. **One question.** Keep the brand (colours, fonts, logo) or refresh it? Everything else comes from the site.
4. **The pages.** A home page and up to 3 inner pages, planned as one [linked flow](app-screens.md#linked-flows) with the site's navigation. Each page's old screenshot is kept as its [base screen](design-from-your-app.md#redesign-a-screen-you-have), so the check shows old and new side by side.
5. **Check and critique.** The check runs as usual, and the [design critic](generate-a-design.md#second-opinion) also checks that each audit problem is gone (the booking button on the first phone screen, readable text, nothing scrolling sideways).
6. **Before and after.** A page that puts the site as it is beside the new design, for the call with the owner (below).

## The site's own words

The pages bind their text from `content.json` with `data-od-bind`, the same way app screens use [sample data](app-screens.md#sample-data). The agent doesn't retype the copy and doesn't invent prices, hours, people or awards the site doesn't have.

The layout is new. The redesign takes the content and the brand, not the old page structure, and leads with what a visitor comes for: booking, calling, ordering or finding the place.

### Copy edits stay visible

Sometimes text has to be shorter or clearer. The new text goes in an element marked `data-od-copy-edit`, with the original kept word for word in `data-od-original`:

```html
<p data-od-copy-edit data-od-original="At Rosa's we have been making our pasta fresh by hand every single morning since 1962, using only the finest local ingredients">Fresh pasta, made by hand every morning since 1962.</p>
```

The check reports `copy-edit-original-missing` when an edit has no original, so you can always show the owner what changed and put any line back.

## The concept ribbon

Unless you say the site is yours or the owner has commissioned the work, every page starts with a thin band above the header:

> Concept by *your name*, not affiliated with Rosa's Trattoria

It protects you and the business when a link gets forwarded. The check reports `concept-unmarked` for a redesign without it. Publishing a page with the ribbon works, with a warning: send the link to the business, don't post it publicly.

Tell the agent "it's my site" or "they've hired me" and it removes the ribbon and marks the page `data-od-owned`. For your own site, extraction can also copy the images into the project (`localizeImages: true`); otherwise they load from the site.

## Show the owner before and after

In the meeting, don't make the owner compare from memory. The agent calls `compare_open_design_before_after` and writes `before-after.html` beside the pages:

- each page's old and new versions at desktop and phone sizes, with a slider to drag across and a side-by-side view;
- every problem the audit found on that page, run again on the new design with the same check at the same size. It says **Fixed** only when the check passes there ("Book a table" 1.43:1 → 6.84:1), and **Still open** otherwise. Nothing is hidden;
- the copy edits, original beside new;
- up to three summary lines at the top. Each one has to cite the fixed problems it's based on, so the summary can't promise more than the page shows. "Loads twice as fast" with nothing behind it is left out.

It's one file that works offline. Export it as a PDF to email (one page per screen), or publish the redesign: the published site links to the before/after page from its index. The concept band shows on it too, and the "before" screenshots are the owner's site as it is.

## Limits

- The same limits as the [audit](site-audit.md#limits): public pages only, at most 4 pages, no logins or forms, and not on the hosted server.
- The before/after page compares screenshots, not live pages, and doesn't measure speed, search ranking or sales.
- A home page and up to 3 inner pages. Not a full site migration, a blog with hundreds of posts or a shop catalogue.
- Using a business's own words and photos to pitch to that business is common practice; publishing them is not the kit's call. Keep the ribbon on until the owner agrees.
