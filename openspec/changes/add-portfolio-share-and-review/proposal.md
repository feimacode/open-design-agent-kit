## Why

Two situations from the portfolio study (2026-11-07) happen outside the portfolio site, in other people's spaces:

- **Posting work where people browse.** Dribbble, Behance, LinkedIn, Instagram and freelance marketplaces each want their own files. Dribbble: at least 1600 px wide, any ratio, images up to 10 MB, MP4 or MOV up to 20 MB. Behance: shown 1400 px wide and up to 2800 px in the lightbox, 10 MB recommended. LinkedIn document posts: a PDF, usually 1080 x 1350, up to 300 pages and 100 MB. Marketplace cards (Upwork, Contra, Fiverr) are seen as small thumbnails in a grid. The kit has Instagram, LinkedIn image and X sizes, but no Dribbble, Behance, document-post or marketplace formats, and device frames only go around screens the kit made.
- **Asking peers or seniors for a review.** In r/UXDesign's feedback thread, posters must give context and say what feedback they want; anonymous résumés must drop the name, contact details, links, employers and schools. Feedback comes back about first impressions, case-study story and mobile layout. Then the designer revises and often posts again. Nothing in the kit prepares that post, collects the feedback, or shows what changed.

This change adds a share pack and a review round on top of the work library (add-work-library) and targets (add-tailored-portfolios).

## What Changes

- **New formats** in `poster/formats.ts`: `dribbble-shot` (1600 x 1200), `behance-module` (1400 wide, fluid height, exported at 2x), `behance-cover`, `linkedin-document` (1080 x 1350, multi-card, exported as one PDF), `marketplace-cover` (4:3). Sizes for Behance covers and marketplace cards are checked against each platform's current help page before they ship.
- **A platform limits file.** `share-platforms.json` records each platform's sizes, ratios, byte limits, video limits and the help page and date it was checked. Export reads it to set byte budgets, and the check reports a file over a limit.
- **Share pack recipe (`portfolio-share-pack`).** From one library project, make a cover, three to five shots, a LinkedIn document post and an Instagram carousel, plus a short MP4 when the project has motion. Each piece comes with post text drafted from the project's facts. Only `public` content is allowed.
- **Device frames around your own screenshots.** Imported screen assets can carry a device (`iphone`, `android`, `ipad`, `browser`, `macbook`), and shots draw the kit's platform shells around them the same way they frame kit-made screens.
- **Review round recipe (`portfolio-review-round`).** Makes a review version and a post:
  - The review version is a target of kind `review` that removes the designer's name, contact details, links to their profiles, and employer, client and school names, swapping in neutral labels ("Fintech company, 2024"). It publishes unlisted.
  - `review-post.md` holds the context (role sought, years of experience), up to three questions the designer wants answered, what feedback they don't want, and the link.
  - An anonymity check reports any owner name, email, employer, client or school from the library that still appears in the text, image alt text, file names, page metadata or link targets.
- **Feedback back into the kit.** The designer pastes the replies or a summary. The agent records each point as a comment on the right page in `<entry>.comments.json` with `source: "community"`, using the comment import tool proposed in add-artifact-comment-review (built here if that change hasn't been). The existing resolve flow then tracks what was addressed.
- **Follow-up post.** After revising, `compare_open_design_before_after` compares the posted version with the revised one, and the recipe drafts a follow-up post listing what changed for each comment.
- **No auto-posting.** The kit writes files and text. The designer posts them.

## Capabilities

### New Capabilities
- `portfolio-share-pack`: the formats, the platform limits file, the share pack recipe and device frames on imported screens.
- `portfolio-review-round`: the review version, the post, the anonymity check, feedback import and the follow-up.

### Modified Capabilities
None in the main specs. Poster formats gain entries; platform shells gain imported screens as a frame source; the before/after page gains a portfolio version as a base. Each is additive.

## Impact

- `poster/formats.ts`, new `content/.../share-platforms.json`, export byte budgets from it; LinkedIn document PDF from a multi-card design.
- Platform shells: frame imported screen assets in captures and exports.
- `portfolio/review.ts`: anonymised version and anonymity check; target kind `review` in `targets.ts`.
- Comment import tool (`import_open_design_comments`) with `source: "community"`; before/after with a published portfolio version as the base.
- Skills `portfolio-share-pack` and `portfolio-review-round`; docs `guides/portfolio.md` (sharing, reviews), `reference/tools.md`, CHANGELOG; eval briefs: a share pack from the fixture library, and a review round with three pasted feedback points.
- Depends on add-work-library and add-tailored-portfolios.
