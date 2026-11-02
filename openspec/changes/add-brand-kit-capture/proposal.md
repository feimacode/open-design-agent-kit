## Why

People who extract their own brand want the result to make designs that look and sound like them, not just use their colours. Today the extraction stops at tokens plus one logo:

- **Logo:** one mark, the first `svg` or `img` in the header. No light and dark versions, no square icon (`apple-touch-icon`, web manifest icons), no social image (`og:image`), no `theme-color`. A dark hero with a white logo, or an image logo that wasn't in the response cache, gives a crop instead of a file.
- **Fonts:** family names and the `@font-face` `src`, but nothing says whether a font can actually be used. Many brands use licensed, self-hosted faces (a custom grotesk, Söhne, Circular); designs then fall back to whatever the stack ends in, and nobody is told. Google Fonts families aren't turned into a loadable link either.
- **Components:** only the primary button's colours. The review page and every later design guess button height, padding, weight and case, input height and border, card padding, nav height and badge shape, the things a viewer notices first.
- **Voice:** nothing. The skill writes "Voice & Tone" from screenshots, so it is invented. The page's own headline, CTA labels, nav labels and meta description are right there.
- **Imagery and icons:** nothing. Whether the brand uses photography, flat illustration or 3D, its image corner radius, and its icon set (Lucide, Heroicons, Material Symbols, Font Awesome, its own sprite) and stroke width all go unrecorded.

The `DESIGN.md` template asks for "Voice & Tone" and "Imagery & Iconography", so the model fills them anyway, from guesses. This change measures what can be measured and records it in one place.

## What Changes

- **Brand marks.** Collect the header logo in the default and the dark theme (and the version over a dark hero, if different), `link[rel~=icon]` at the largest size, `apple-touch-icon`, web manifest icons, `og:image` and `meta[name=theme-color]`. Files come from the page's own responses; an image that wasn't loaded is fetched once from the same site, with the same address rules as pages. Each mark records its size, format and the background it was seen on.
- **Font availability.** For each loaded family, record where it comes from (`google`, `adobe`, `self-hosted`, `system`) and its weights. Google families get a ready `<link>` URL. For a self-hosted family the result says it may be licensed, and suggests the nearest free family by classification (from a small table of common licensed brand faces and their free near-matches, plus a generic fallback by serif, sans, mono and width). For the person's own brand, the skill asks whether they hold the font licence before copying any font file into `assets/fonts/`; for a reference site, fonts are never copied.
- **Component specs.** Measure primary, secondary and ghost buttons (height, padding, font weight, case, border, radius, icon gap), inputs (height, border width and colour, placeholder colour, focus style), cards (padding, border, shadow), the nav (height, link spacing, sticky or not) and badges or tags, each with its selector and crop. They go into the draft as `components`, and into a "Components" section of DESIGN.md as numbers, not prose.
- **Voice samples.** Collect, per page, the title, meta description, `h1`, up to six `h2`s, CTA and button labels, nav labels and one paragraph, capped at 1,500 characters, plus derived facts: heading case (sentence, title, upper), average sentence length, person ("we", "you"), exclamation and emoji use. The skill writes "Voice & Tone" from these. For a reference site, samples are used to describe tone and are not copied into DESIGN.md.
- **Imagery and icons.** Classify the hero media (photo, illustration, 3D render, video, none) from element type, file type and colour count; record image radius and common aspect ratios; detect the icon set from class names, sprite ids and SVG attributes, with its stroke width and style (outline or filled).
- **`brand.json`.** The saved design system gets a `brand.json` beside DESIGN.md: whether it is the person's own brand or a reference, the source URLs and date, marks with roles (`logo`, `logo-dark`, `icon`, `social`), fonts with availability and licence status, component specs, voice facts and imagery facts. Other tools read this file instead of parsing prose (see `connect-brand-design-systems`).

## Capabilities

### New Capabilities
- `brand-kit`: brand marks with variants, font availability and licence handling, component specs, voice samples and facts, imagery and icon facts, and the `brand.json` record.

### Modified Capabilities
None. `design-system-extraction` keeps its requirements; this change adds fields to the evidence and the draft.

## Impact

- `packages/core/src/generation/siteExtraction.ts` (marks, fonts, components, voice, imagery passes), `evidenceToTokens.ts` (components in the draft), new `generation/brandKit.ts` (font table, `brand.json` writer and reader, schema).
- `packages/core/src/content/contentIndex.ts`: user systems expose `brand.json` when present.
- `customDesignSystemInstructions.ts` and `local/prompts/design-system-from-url.md`: Components section from specs, voice from samples, imagery from facts, font licence question.
- Docs: `docs/guides/design-systems.md`, `docs/reference/tools.md`, new `docs/reference/brand-json.md`.
