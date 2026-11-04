# brand.json

A custom design system can keep a `brand.json` beside its `DESIGN.md` and `tokens.css`, at `<outputDirectory>/design-systems/<slug>/brand.json`. `DESIGN.md` stays the prose agents read; `brand.json` holds the facts code needs: whether the system is your own brand or a reference, where it came from, and the brand kit taken from your site. Bundled systems and hand-written custom ones have none, and every reader treats it as optional.

[`create_open_design_design_system`](tools.md#create_open_design_design_system) writes it when given `kind`, and fills it from an extraction when given `evidenceDir`. A later write merges into what's there.

## Files beside it

```
.open-design/design-systems/acme/
├── DESIGN.md
├── tokens.css
├── brand.json
├── reference.png        ← the site's desktop screenshot, from an extraction
├── review.html          ← the site beside a sample styled by tokens.css (check it for brand-fidelity)
└── assets/              ← own brands only: the marks, and fonts/ once you confirm the licence
    ├── logo.svg
    ├── logo-dark.svg
    ├── icon.png
    └── fonts/brand.woff2
```

## Fields

| Field | Type | Meaning |
|---|---|---|
| `version` | `1` | The format version. |
| `kind` | `own` \| `reference` | `own`: your brand. It is headed `# <Name> Design System`, recommended first, and the check and critic hold designs to it. `reference`: a look taken from someone else's site, headed `# Design System Inspired by <Name>`, with no marks, font files or copied lines of its text. |
| `name` | string | The display name. |
| `sources` | `{ urls, extractedAt, bundleDir }` | The pages it was measured from, when, and the evidence bundle. `extract_open_design_design_system` with `compareTo` measures these pages again. |
| `descriptor` | `{ moods, industries, surfaces }` | What the recommender matches on, as for bundled systems. |
| `reference` | string | `reference.png`, when the site's screenshot was kept. |
| `marks` | array | Own brands only. Each: `role` (`logo`, `logo-dark` from the dark theme, `logo-on-dark` shown on a dark surface, `icon`, `touch-icon`, `manifest-icon`, `social` from `og:image`), `path` (under `assets/`), `width`, `height`, `format`, `seenOn` (the background it was shown on, `#rrggbb`). |
| `fonts` | array | Each family the site loaded: `family`, `weights`, `source` (`google`, `adobe`, `self-hosted`, `system`), `stylesheet` (Google), `licence` (`free`, `unknown`, `confirmed`), `freeMatch` (a free family close to a self-hosted or Adobe face), `files` (under `assets/fonts/`, only once you confirmed the licence). |
| `components` | object | Measured specs for `button.primary`, `button.secondary`, `button.ghost`, `input`, `card`, `nav` and `badge`: `selector`, `crop`, `height`, `paddingY`, `paddingX`, `fontWeight`, `fontSize`, `textTransform`, `borderWidth`, `borderColor`, `radius`, `background`, `color`, `shadow`, `gap`, `focus` (inputs), `sticky` (nav). Numbers are px. |
| `voice` | object | `headingCase` (`sentence`, `title`, `upper`, `mixed`), `avgSentenceWords`, `person` (`first-plural`, `second`, `third`, `mixed`), `exclamations`, `emoji`, and `samples` (`page`, `kind`, `text`; at most 1,500 characters a page, own brands only). |
| `imagery` | object | `hero` (`photo`, `illustration`, `3d`, `video`, `none`), `imageRadius`, `aspectRatios`, `icons` (`set` such as `lucide` or `custom`, `style`, `strokeWidth`). These are hints from the page. |

## Fonts and licences

The kit can't know a font's licence. A font served by Google Fonts is free; a self-hosted or Adobe one is `unknown`, with a `freeMatch` from a short reviewed table of common brand faces (and a guess from the name otherwise). The font files the site loaded are kept in the evidence bundle and copied into your design system only when it is your own brand and you've said you hold the licence (`fontLicence: "confirmed"`). They are never copied for a reference site.
