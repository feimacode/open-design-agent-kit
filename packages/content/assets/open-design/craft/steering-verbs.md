<!-- Kit craft doc (openspec add-steering-edits). The verb names follow Impeccable's steering commands (pbakaus/impeccable, Apache-2.0); the definitions are the kit's own, no text copied. Each "## verb" section is loaded on its own into a steering edit's instructions. -->
# Steering verbs

A steering edit changes one part of a design in one named direction and
leaves everything else as it was. The verb says which direction; this
file says what each verb means. Stay inside the active design system:
sizes, spacing, colours, radii and fonts come from its tokens (the
`:root` custom properties). When the next step up or down isn't in the
scale, take the nearest one that is.

## bolder

Make the part more confident and easier to notice at a glance.

- **Change:** raise the size contrast between the main heading and the rest (one or two type-scale steps up, or a heavier weight); let one element clearly lead; give the main action a solid, saturated fill from the brand colour; tighten heading line height a little.
- **Keep:** the copy, the order of the content, the number of items, the brand colours and fonts.
- **Avoid:** making everything bigger at once (then nothing leads), adding new colours, gradients, glows, shadows or decorative shapes, all-caps body text, or a second competing call to action.

## quieter

Make the part calmer and less demanding, so the rest of the page can lead.

- **Change:** fewer accent colours (one at most), softer or neutral fills, display type one step down, lighter borders, fewer decorative elements (badges, icons in tiles, ornaments, shadows).
- **Keep:** the copy, every fact, and a visible, readable main action if the part has one; contrast must still pass.
- **Avoid:** greying text below readable contrast, hiding the main action, removing content (that's `distill`).

## denser

Fit more into the same space, for people who scan and compare.

- **Change:** smaller gaps, padding and margins (one or two spacing-scale steps down), tighter line height on lists and tables, smaller row heights, more items per row where the width allows, secondary text one step smaller.
- **Keep:** every item and its copy; body text at least 14 px; buttons and links at least 24 × 24 px (44 px on touch screens); the reading order.
- **Avoid:** removing items, cramming text against borders, cutting labels off without a way to see them in full.

## roomier

Give the part room to breathe, so it reads slowly and calmly.

- **Change:** larger gaps, padding and margins (one or two spacing-scale steps up), more space around headings, longer line height on long text, fewer items per row.
- **Keep:** every item and its copy, the order, and the part's role on the page.
- **Avoid:** empty bands that push the main action below the first screen, line lengths above about 75 characters.

## distill

Remove what doesn't serve the part's purpose, so what remains is clearer.

- **Change:** take out duplicate or filler copy, extra badges, eyebrow labels, decorative icons and ornaments, redundant dividers and nested boxes; merge items that say the same thing; shorten long sentences.
- **Keep:** the main action, every fact the reader needs (prices, dates, names, numbers), and the part's heading. Mark any rewritten text with `data-od-copy-edit` and the original in `data-od-original` when the design already uses copy-edit marks.
- **Avoid:** adding anything new, removing facts, turning the part into a different layout.

## polish

Fix the small inconsistencies that make the part look unfinished.

- **Change:** align edges to one grid; bring spacing, radii and font sizes onto the scale and make same-shaped siblings share one style; give every interactive element visible hover, focus and pressed states; fix orphans and awkward line breaks; make icon sizes and stroke widths consistent.
- **Keep:** the content, the structure and the look; a person should feel it's the same design, finished.
- **Avoid:** new colours, new sections, a different layout or a change of tone.

## harden

Make the part hold up when real content and real conditions arrive.

- **Change:** handle long names and long unbroken strings (wrap or truncate with the full value in a `title`), missing images (a sized placeholder), zero, one and many items, very large numbers; add empty, loading and error states where the part shows data (as `data-od-state` frames when the design has a states board); visible focus and hover on every control; nothing scrolls sideways at 320 px.
- **Keep:** the happy path's look and copy exactly as it is.
- **Avoid:** changing the design to make room for edge cases; solve them inside it.
