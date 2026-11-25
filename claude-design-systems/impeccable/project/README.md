A graphic editorial-poster aesthetic: warm cream surfaces, a confident
amber accent, and a burnt-orange/rust secondary carried in supporting
graphics — built for a print or production studio that wants precision and
warmth in equal measure.

## Style Foundations

- **Visual style:** graphic, editorial, high-contrast
- **Canvas:** warm cream (`--bg`), with a brighter warm off-white surface
  (`--surface`) for cards.
- **Ink:** near-black (`--fg`) for headlines and structural text.
- **Accent:** a confident amber/mustard (`--accent`) for primary actions,
  eyebrow badges, and announcement bars.
- **Secondary flourish:** a burnt-orange/rust tone appears in supporting
  graphics (data bars, secondary panels) alongside the amber — content-only,
  not an interactive color.
- **Typography:** a geometric, slightly technical display face
  (`--font-display`) for headlines gives the system its graphic-poster
  precision; body copy stays in a clean sans (`--font-body`).
- **Shape:** small, precise radii — this is a print-and-production system,
  not a soft one.

## Colors

- **Background (cream):** `#F2E9D3`
- **Surface (card face):** `#FBF6EA`
- **Foreground / ink:** `#1C1712`
- **Muted:** `#7A6E5A`
- **Border:** `#E4D6B8`
- **Accent (amber/mustard):** `#CC8800`
- **Secondary flourish (burnt-orange/rust, content only):** `#C55221`

## Typography

- Display (headlines): Chakra Petch
- Body & UI: a clean sans (e.g. Inter)
- Mono / labels: JetBrains Mono

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
| `--chart-1` | `#b87600` |
| `--chart-2` | `#0090bf` |
| `--chart-3` | `#5a922d` |
| `--chart-4` | `#7d77d9` |
| `--chart-5` | `#d46271` |
| `--chart-6` | `#00947b` |
| `--chart-seq-1` | `#e7d2b0` |
| `--chart-seq-2` | `#dcbb8d` |
| `--chart-seq-3` | `#d0a46a` |
| `--chart-seq-4` | `#c48d43` |
| `--chart-seq-5` | `#b87600` |
| `--chart-pos` | `#00963e` |
| `--chart-neg` | `#dc2626` |
| `--chart-grid` | `#ede2c9` |
| `--chart-axis` | `#746854` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
