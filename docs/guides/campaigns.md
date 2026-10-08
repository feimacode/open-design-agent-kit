# Run a campaign

Turn one brief into a whole campaign: the same message and look in every channel size (feed posts, stories, link previews, LinkedIn, headers, display ads, an email header), in every language you need, plus an optional landing page and email. Everything is checked and shown on one campaign sheet.

## Before you start

- An installed Chrome, Edge or Chromium, for checking and exporting ([why](export-images.md#before-you-start)).

## Start

> A campaign for the launch of our reporting dashboard: Instagram, LinkedIn and display ads, in English and German.

> **In VS Code:** `/open-design-campaign …`, or pick **Campaign** in the Gallery's **New design** tiles.

> **In Claude Code / Codex:** just ask; campaign requests load the `open-design-campaign` skill (`/open-design:open-design-campaign` with the plugin).

## What happens

1. **The copy comes first.** The agent drafts the headline, subhead, call to action and any legal line, one row per language, and shows them to you. Once you agree, it saves them as `copy.csv` in the campaign folder.
2. **One fluid master.** The agent builds a single design that reflows to any shape (see [fluid posters](posters.md)). Every piece of copy is bound to a column of the copy deck, and the headline and subhead carry `data-od-fit`.
3. **You pick channels** from the format catalog:

   | Channel | Formats |
   |---|---|
   | Instagram / Facebook feed | `ig-portrait`, `ig-square` |
   | Stories, Reels, TikTok | `story` |
   | X | `x-image`, `x-header` |
   | LinkedIn | `linkedin-image`, `linkedin-banner` |
   | Link previews | `og-image` |
   | Display ads (150 KB each) | `banner-mrec`, `banner-leaderboard`, `banner-skyscraper`, `banner-mobile` |
   | Email header (exported at 2× for sharp screens) | `email-header` |

   Every size is in the [format catalog](../reference/tools.md#canvas-formats).
4. **Every shape is checked, in every language,** and weak shapes are tuned in the same file with [`adapt_open_design_artifact`](../reference/tools.md#adapt_open_design_artifact). Tiny ads get their own layout: headline and call to action only.
5. **Other pieces, if you want them:** a landing page and an [HTML email](html-email.md), built with the same design system and registered in the same collection.
6. **Export and the campaign sheet.** One file per shape per language, such as `master-de-banner-mrec.png`, plus `exports/campaign-sheet.png`: every shape and every other piece on one image, with a red dot on anything that still has errors.

## Long translations: `data-od-fit`

German or Finnish copy often runs longer than English. Text marked `data-od-fit` is shrunk in 5% steps, down to 70% of its designed size, until it fits its box and the card. The size stays relative to the card, so it still reflows across shapes. Each shrink is reported as a note (`fit`), naming the text and the percentage. Text that doesn't fit even at 70% is left at its designed size and reported as an `overflow` error, so you can shorten the copy for that language.

## Limits

One export can produce at most 400 files (shapes × languages). For bigger campaigns, export a few languages at a time; the agent does this when needed.

> **From the CLI:** `npx @feimacode/open-design-agent-kit export .open-design/launch/master.html --presets ig-portrait,story,linkedin-image,banner-mrec --data .open-design/launch/copy.csv --name-field locale --campaign-sheet`

## Related

- [Posters and print](posters.md): fluid designs, shape sheets, and per-row exports
- [Social media posts](social-posts.md)
- [HTML email](html-email.md)
