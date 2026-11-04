## Context

The hosted gateway (`remote.ts`) runs the same tools as the local server in a per-project store with no access to the user's computer, and refuses anything that fetches the web. `read_open_design_source` already converts PDF, DOCX and PPTX to Markdown. The check already decodes PNG screenshots in Node for its review sheet.

## Goals / Non-Goals

**Goals:** every host can make a brand design system from something the person has; every value says how sure we are; nothing new reaches out to the network from the hosted server.

**Non-Goals:** editable PowerPoint export or reusing a template's slide master in exported decks (its own change); OCR of scanned brand guides (text PDFs only; a scanned page is treated as a screenshot); guessing fonts from images; reading Figma or Canva brand kits (Figma frames already come in through `pull_open_design_figma_frame`; a Canva Brand Kit route can follow once its connector exposes kit contents); a server-side browser on the gateway.

## Decisions

### One tool, many sources

A separate tool per source would split the skill and the review. One `sources` list feeding the same draft keeps the skill, the review page and the saved files identical whatever the input.

### Confidence order

Measured beats declared because a rendered value is what users see, and stylesheets often declare unused tokens. Declared beats stated because brand guides drift from what ships. Sampled is last because antialiasing, photos and compression shift pixels. The order only decides the draft; `conflicts` keeps every value so the person can choose another in the review.

### Screenshot palette without a model

K-means in CIELAB over a downscaled image (at most 400 px wide), then roles by rules: edge-dominant is the background, largest non-background block is the surface, small clusters with at least 4.5:1 contrast against the background are text, the most saturated cluster above 0.5% area is the accent. Deterministic, testable on fixtures, and cheap enough for the gateway.

### PowerPoint themes are declared, not measured

A template's theme XML names each colour's job (`dk1`, `lt1`, `accent1`) and each font's (`majorFont`, `minorFont`), so it ranks with stylesheets as `declared`. Office lets themes reference system colours (`sysClr windowText`); those resolve to their `lastClr` value. Master text sizes are in points on a slide of known width, so they are kept as ratios of the slide width and scaled onto the type scale with body as `--text-base`, the same anchoring as the URL draft. Stock Office themes are detected by theme name plus default font and accent values, so a deck nobody branded doesn't become "your brand".

### Hosts fetch, the server parses

The gateway can't fetch, but claude.ai and ChatGPT have their own web tools. The skill asks the model to fetch the page HTML and up to three of its stylesheets and pass the text in. That keeps the gateway's no-fetch promise while giving it real CSS to parse. Size caps: 2 MB of HTML and 2 MB of CSS per call.

### Roles only from names

CSS and token files name their own roles; we only map names we can read without guessing. This matches the VS Code import's existing rule ("found colours are never assigned to roles by guessing") while letting obvious names (`primary`, `background`, `foreground`, `muted`, `border`) through.

## Risks / Trade-offs

- Screenshot accents can come from a photo. Mitigation: clusters inside large high-variance regions (photos) are skipped; the crop is shown in the review.
- Templates often hold several themes (one per master). Mitigation: the first master's theme is drafted, the others are listed under `conflicts` by master name.
- CMYK to sRGB is approximate. Mitigation: the computed value is labelled as converted, and a hex code in the same guide wins.
- Image data on the gateway costs tokens to send. Mitigation: the skill prefers `html` and `css` where the host can fetch, and the 4 MB cap.
