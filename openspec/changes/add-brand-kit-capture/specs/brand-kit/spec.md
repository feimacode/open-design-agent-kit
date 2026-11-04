## ADDED Requirements

### Requirement: Brand Marks With Variants

The extraction SHALL collect the header logo in each measured theme, the largest favicon, the `apple-touch-icon`, web manifest icons, `og:image` and `theme-color`, saving files from the page's own responses or one same-site fetch under the page address rules, and SHALL record each mark's role, size, format and the background colour it was seen on.

#### Scenario: Light and dark logo
- **WHEN** a site shows a black SVG logo in light mode and a white one in dark mode, and the extraction runs with `theme: "both"`
- **THEN** the bundle holds both files, with roles `logo` and `logo-dark`

#### Scenario: Social image
- **WHEN** the page declares `og:image`
- **THEN** the bundle holds that image with role `social`

### Requirement: Font Availability

For each loaded font family the extraction SHALL record its source (`google`, `adobe`, `self-hosted` or `system`) and weights, SHALL give a stylesheet URL for Google families, and SHALL, for self-hosted families, say the font may be licensed and suggest the nearest free family; the skill SHALL copy font files into the design system only for the person's own brand and only after they confirm they hold the licence.

#### Scenario: Licensed brand font
- **WHEN** the body font is a self-hosted family that is not on Google Fonts
- **THEN** the result marks it as possibly licensed and names a free near-match

#### Scenario: Reference site fonts
- **WHEN** the site is a reference, not the person's brand
- **THEN** no font file is copied

### Requirement: Component Specs

The extraction SHALL measure primary, secondary and ghost buttons, inputs, cards, the nav and badges when present (height, padding, font weight and case, border, radius, shadow, and focus style for inputs) with each spec's selector and crop, and the skill SHALL write them as numbers in a Components section of DESIGN.md.

#### Scenario: Button spec
- **WHEN** the primary button is 44 px high with 0 24 px padding, weight 600 and sentence case
- **THEN** the draft's `components.button.primary` records those values and DESIGN.md's Components section states them

### Requirement: Voice Samples and Facts

The extraction SHALL collect per page the title, meta description, `h1`, up to six `h2`s, CTA, button and nav labels and one paragraph, capped at 1,500 characters, and SHALL derive heading case, average sentence length, grammatical person, and exclamation and emoji use; for a reference site the skill SHALL use the samples to describe tone and SHALL NOT copy them into DESIGN.md.

#### Scenario: Voice from the page
- **WHEN** the extraction reads headings in sentence case and CTAs addressing "you"
- **THEN** the voice facts record sentence case and second person, and DESIGN.md's voice section says so

### Requirement: Imagery and Icon Facts

The extraction SHALL record the hero media kind (photo, illustration, 3D render, video or none), image corner radius and common aspect ratios, and the icon set (a named library or `custom`) with its stroke width and style.

#### Scenario: Lucide icons
- **WHEN** the page's icons are SVGs with `lucide` class names and a 1.5 stroke width
- **THEN** the imagery facts name Lucide, outline style, stroke 1.5

### Requirement: Brand Record

Saving a design system from an extraction SHALL write `brand.json` beside DESIGN.md, holding a `version`, whether it is the person's own brand or a reference, source URLs and date, marks with roles and paths, fonts with source and licence status, component specs, voice facts and imagery facts; readers SHALL treat the file as optional.

#### Scenario: Own brand saved
- **WHEN** the person saves an extraction of their own site
- **THEN** the design system folder holds `brand.json` with `"kind": "own"` and the marks it copied into `assets/`
