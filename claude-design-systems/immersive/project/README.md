An exhibit-style interface that blends storytelling and game-like
interaction: a continuous deep-green canvas throughout (not a white system
with green accents), chunky comic-panel outlines on every card, and a
bright magenta pop reserved for badges and highlights.

## Style Foundations

- **Visual style:** bold, high-contrast, exhibit/game-like
- **Canvas:** a deep forest green (`--bg`) runs the whole page. Card
  surfaces (`--surface`) stay in the same dark-green family, just a touch
  lighter — this is a unified dark system, not a light-panel-on-dark-canvas
  mashup, so text stays legible everywhere without a separate "on-card"
  color.
- **Ink:** near-white (`--fg`) for headlines and body text throughout, on
  both the canvas and card surfaces.
- **Accent:** a bright magenta/pink (`--accent`) reserved for badges and key
  highlights — the single "pop" color against the green base.
- **Borders / outline:** a light, near-white outline (`--border`) traces
  every card, button, and badge at a visible 2px weight — the system's
  comic-panel signature, translated to read on a dark surface (a black
  outline, as a print reference might use, would vanish against this
  canvas — the outline has to be light here).
- **Typography:** a bold condensed display face (`--font-display`) for
  oversized headlines; body copy in a clean, readable sans (`--font-body`).

## Colors

- **Background (deep green canvas):** `#0B5C34`
- **Surface (card, same family, lighter):** `#14713F`
- **Foreground / ink:** `#F5FAF6`
- **Muted:** `#B9D6C2`
- **Border (light outline, 2px):** `#F5FAF6`
- **Accent (magenta pop):** `#F062B0`

## Typography

- Display (headlines): Oswald
- Body & UI: a clean sans (e.g. Inter)
- Mono / labels: JetBrains Mono

## Craft notes

- Keep the magenta accent rare (badges, a single key highlight) so it reads
  as a pop, not a second base color.
- The signature outline is always light-on-dark here, at a visible 2px+
  weight, never a soft 1px hairline.

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
| `--chart-1` | `#fe6fbd` |
| `--chart-2` | `#54b834` |
| `--chart-3` | `#ff7714` |
| `--chart-4` | `#00becb` |
| `--chart-5` | `#a990ff` |
| `--chart-6` | `#c59800` |
| `--chart-seq-1` | `#51654f` |
| `--chart-seq-2` | `#7e6b69` |
| `--chart-seq-3` | `#a97085` |
| `--chart-seq-4` | `#d371a0` |
| `--chart-seq-5` | `#fe6fbd` |
| `--chart-pos` | `#4ade80` |
| `--chart-neg` | `#ff7777` |
| `--chart-grid` | `#3a8f5e` |
| `--chart-axis` | `#b9d6c2` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
