# Riso

> Category: Editorial & Print

A joyful two-color risograph print aesthetic: every surface sits on a warm
off-white paper canvas, headings run in a deep federal-blue ink, and a single
fluorescent pink is held in reserve for actions — the two-color-press
constraint made into the whole visual language, never a full palette.

## Style Foundations

- **Visual style:** clean, high-contrast, print-inspired
- **Canvas:** warm off-white paper (`--bg`), never pure white — the second
  surface tier (`--surface`) is a touch lighter, for the card stock a
  risograph run would actually sit on top of.
- **Ink:** federal blue (`--fg`) carries headings and structural text, as if
  laid down in the first pass of a two-color print run. Body copy steps down
  to a softer indigo-gray (`--muted`) so blue reads as a heading signal, not
  wallpaper.
- **Accent:** a single fluorescent pink (`--accent`), the second print pass —
  reserved for the interactive layer only (primary buttons, active states,
  key highlights). Never used for body text or large fills.
- **Borders:** a visible blue-tinted hairline (`--border`) on cards and
  inputs, evoking the registration line of a print run. Prefer a flat
  1–2px border over soft shadows; when a card needs to lift off the page, an
  offset duplicate outline (a second border shifted 3–4px down-right, in
  `--accent` or `--fg`) reads truer to risograph misregistration than a blur
  shadow.
- **Typography:** a tight geometric grotesque for both display and body
  (`--font-display` / `--font-body`), with a mono face reserved for
  eyebrows, labels, and small caps (`--font-mono`).
- **Shape:** small, consistent radii — boxy, not soft. Corners stay close to
  square; this is a print aesthetic, not a bubble one.

## Colors

- **Background (paper canvas):** `#F2EEE1`
- **Surface (card stock):** `#FBF8EF`
- **Foreground / heading ink (federal blue):** `#2C3A8C`
- **Muted / body copy:** `#5B5F86`
- **Border (registration line):** `#B9BFDD`
- **Accent (fluorescent pink):** `#F0248F`

## Typography

- Display & body: Space Grotesk
- Mono / eyebrows: Overpass Mono

## Craft notes

- Keep the accent to at most one or two visible uses per screen — it's the
  second print pass, not a highlight color to reach for freely.
- Prefer the offset-outline treatment over drop shadows for any element that
  needs to feel "lifted" — shadows read as digital-native, offset lines read
  as print-native.
