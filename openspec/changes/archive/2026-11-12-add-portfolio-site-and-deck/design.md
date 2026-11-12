## Context

Linked flows (add-linked-flows) give a collection of pages with shared navigation and a flow map, and the collection site export publishes all of them. Decks have many templates, presenter mode in the html-ppt family, and an editable PPTX export. add-work-library adds the library with facts, assets and privacy.

## Goals / Non-Goals

**Goals:** a site that passes a hiring manager's first 15 seconds on a phone; case studies built around decisions and outcomes from real facts; an interview deck the designer can rehearse with.

**Non-Goals:** blog or writing sections, CMS hosting, password gates (add-tailored-portfolios), share images for Dribbble and Behance (add-portfolio-share-and-review), mock interview coaching.

## Decisions

### Reuse linked flows for the site

A portfolio site is a collection with a plan: `home`, one screen per case study, `about`. The shared nav is a `data-od-include`. For a portfolio the flow map is not published as the index; home is `index.html` and the map stays a preview-only page. This is a flag on the collection plan (`kind: "site"`), not a new export.

### Case-study outline is guidance, not a template

The recipe gives a section order and length range, but the layout comes from the library's style and the agent's direction, so two designers' sites don't look alike. Decisions get the most room, since reviewers weigh them most.

### Process story only from records

The kit already stores exploration plans, comparison pages, steering edit records, revisions and before/after pages per design. The process block lists what exists for designs linked to the project (`project.json` gets `designs: [entryPath]`). If nothing exists, the block is left out instead of being written from imagination.

### Timing on slides

Each slide carries `data-od-minutes`. The check adds them up and compares the sum to the chosen length. Backup slides are marked `data-od-backup` and not counted.

### Checks run where the recipe ran

The `portfolio` group runs only for designs registered with `portfolio` brief inputs, so other pages don't get portfolio warnings.

## Risks / Trade-offs

- **Generic results.** The biggest risk the study found. Mitigations: library style first, decisions-first outline, the taste checks already in the kit, and an eval comparing two fixture designers for layout sameness.
- **Link checks are slow or blocked.** Done with a short timeout, local server only, and reported as warnings.
- **Phone first screen is crowded.** The check only requires name, role, contact and the first card's top edge, not all cards.
