## Context

`siteExtraction.ts` renders up to 4 pages and measures brand evidence. `baseScreen.ts` stores a "before" image for a redesign, from a file or a captured URL. `sampleData.ts` fills `data-od-bind` and `data-od-repeat` from a data file. Linked flows make multi-page sites with shared navigation, and site export publishes them as one site.

## Goals / Non-Goals

**Goals:** a home page and up to 3 inner pages that use the business's real words, images and brand, fix the audited problems, and are marked as a concept until the client agrees.

**Non-Goals:** a full site migration, CMS import, blogs with hundreds of posts, e-commerce catalogues, and copying another site's layout (the brand is taken, not the layout).

## Decisions

### One browser session for brand, content and audit

Extraction, inventory and audit load the same pages. When a recipe asks for more than one, they share one `livePage` session, so the site sees one visit of at most 4 pages, not three.

### The inventory is data, not a brief

Copy goes into `content.json` and is bound into the design with `data-od-bind`. It is not pasted into the prompt. This keeps long copy out of the instructions, makes it checkable (`sample-data-missing` catches a bind to text that isn't there), and lets promote carry it into code later.

### Copy edits stay visible

Redesign pitches often fail when the client sees their words rewritten without asking. Edits are allowed but marked, and the original text is kept, so the before/after page can list them and the designer can revert any one.

### Ribbon by default, off by the user

The ribbon protects both sides when a concept link is forwarded. It is a preview-only element the agent removes only on the user's word that the work is commissioned. Exports for a site the user owns never get it.

## Risks / Trade-offs

- **Copyright of copy and photos.** Using a business's own material to pitch to that business is common practice, but publishing it is not ours to decide. Images stay remote until `localize`, and publish warns when a ribbon-marked design goes to a public host.
- **Robots and terms.** The content pass honours `robots.txt` disallow rules for the pages it loads and stops at 4 pages.
- **Messy sites.** Page builders nest text deeply. The inventory keeps blocks in reading order with their heading level, and the skill tells the agent to restructure, not to mirror the old layout.
