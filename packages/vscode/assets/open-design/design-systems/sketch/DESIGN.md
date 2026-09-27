# Sketch

> Category: Bold & Expressive

A hand-drawn, notebook-page aesthetic: warm cream paper, ink-black
handwritten headlines, a soft teal accent, and dashed strokes standing in
for every hairline border — as if the whole interface were sketched, not
rendered.

## Style Foundations

- **Visual style:** playful, tactile, hand-drawn
- **Canvas:** warm cream paper (`--bg`), with brighter near-white card
  surfaces (`--surface`) for anything that should feel "on top of the page."
- **Ink:** warm near-black (`--fg`) for headlines and structural text; a
  softer warm gray (`--muted`) for body copy, so the handwritten headline
  still reads as the loudest thing on the page.
- **Accent:** a single soft teal (`--accent`), used for primary actions and
  small badges only — the aesthetic stays monochrome-plus-one, not
  multicolor.
- **Borders:** every border (`--border`) is drawn **dashed**, not solid —
  this is the single signature move of the system. Apply `border-style:
  dashed` wherever a component would otherwise use a solid hairline: input
  fields, dividers, stat-card outlines.
- **Shape:** generously rounded — buttons read as full pills, cards and
  inputs use a large radius. This is a soft, tactile system, the opposite of
  a boxy print aesthetic.
- **Typography:** headlines use a genuine handwritten face
  (`--font-display`); body copy, labels, and UI chrome stay in a clean
  sans (`--font-body`) so long-form text stays legible — only the headline
  should look "sketched."

## Colors

- **Background (paper):** `#FBF3E6`
- **Surface (card face):** `#FFFEFA`
- **Foreground / ink:** `#2A2420`
- **Muted / body copy:** `#7A7268`
- **Border (dashed stroke):** `#3A342C`
- **Accent (soft teal):** `#1DAD97`

## Typography

- Display (headlines only): Delicious Handrawn
- Body & UI: a clean sans (e.g. Inter) — not the handwritten face
- Mono / labels: JetBrains Mono

## Craft notes

- Borders are dashed, not solid — this is the one non-negotiable signature
  detail; a solid-border version of this system isn't this system.
- Keep the handwritten face to headlines only. Setting body copy in it (as
  a literal reading of a generic "primary font" field would) hurts
  legibility and isn't what the reference aesthetic actually does.
