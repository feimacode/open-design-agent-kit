A sun-baked, clay-toned editorial system: warm cream surfaces, a confident
serif headline face, and a single burnt-terracotta accent — built for a
craft or maker brand that wants warmth and permanence, not a tech-startup
gradient.

## Style Foundations

- **Visual style:** warm, editorial, crafted
- **Canvas:** warm cream (`--bg`), with a slightly deeper warm tan
  (`--surface`) for cards and grouped content — the two tiers should read
  like paper and unglazed clay, not two shades of the same white.
- **Ink:** warm near-black (`--fg`) for headlines and structural text; a
  warm brown-gray (`--muted`) for body copy and captions.
- **Accent:** a single burnt terracotta (`--accent`), used for primary
  actions, small eyebrow labels, and key emphasis only.
- **Borders:** soft warm tan hairlines (`--border`) — quiet, never
  competing with the terracotta accent.
- **Typography:** a confident serif for display (`--font-display`) carries
  the brand's editorial weight; body copy and UI chrome stay in a clean sans
  (`--font-body`) for legibility at small sizes — the serif is a headline
  instrument, not a body face.
- **Shape:** moderate, confident radii on buttons and cards — rounded
  enough to feel handmade, not sharp-edged or corporate.

## Colors

- **Background (cream):** `#F7EEE0`
- **Surface (warm tan):** `#EFE3D0`
- **Foreground / ink:** `#241C15`
- **Muted / body copy:** `#7A6F62`
- **Border:** `#DCCDB4`
- **Accent (burnt terracotta):** `#BD5B34`

## Typography

- Display (headlines only): DM Serif Display
- Body & UI: a clean sans (e.g. Inter)
- Mono / labels: JetBrains Mono

## Craft notes

- Reserve the serif for headlines. Body copy in the same serif (a literal
  reading of a generic "primary font" field) reads as a dense wall of
  serif text at small sizes — the reference aesthetic keeps body text in a
  sans for exactly this reason.
- The accent is a warm rust, not a bright safety-orange — keep it muted
  enough to sit comfortably next to the cream/tan surfaces.

## Motion

Durations and easings for this system. Use these for every transition, animation delay and easing; don't invent others.

| Token | Value |
| --- | --- |
| `--motion-instant` | `80ms` |
| `--motion-slow` | `400ms` |
| `--motion-scene` | `800ms` |
| `--ease-enter` | `cubic-bezier(0.34, 1.12, 0.64, 1)` |
| `--ease-exit` | `cubic-bezier(0.7, 0, 0.84, 0)` |
| `--ease-spring` | a `linear()` spring |
| `--motion-stagger` | `60ms` |
| `--motion-distance` | `16px` |

## Charts

Chart colours derived from this system's accent, background and status colours. Use the series colours in order, the up and down colours for change only, and never show meaning by colour alone.

| Token | Value |
| --- | --- |
| `--chart-1` | `#bd5b34` |
| `--chart-2` | `#00948f` |
| `--chart-3` | `#8d7d00` |
| `--chart-4` | `#337ec9` |
| `--chart-5` | `#b05793` |
| `--chart-6` | `#3a9047` |
| `--chart-seq-1` | `#eed1bd` |
| `--chart-seq-2` | `#e3b39b` |
| `--chart-seq-3` | `#d89679` |
| `--chart-seq-4` | `#cb7958` |
| `--chart-seq-5` | `#bd5b34` |
| `--chart-pos` | `#029d44` |
| `--chart-neg` | `#c0392b` |
| `--chart-grid` | `#e9ddc8` |
| `--chart-axis` | `#74695c` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
