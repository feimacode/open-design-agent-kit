A clean, high-contrast enterprise system for data-driven workflows: a
warm cream canvas, a deep forest-green ink/accent, and a refined serif
headline face that gives it more warmth than a typical corporate-blue
dashboard.

## Style Foundations

- **Visual style:** clean, high-contrast, enterprise, structured
- **Canvas:** warm cream (`--bg`), with a slightly brighter cream surface
  (`--surface`) for cards and panels.
- **Ink:** near-black warm charcoal (`--fg`) for body text and structure.
- **Accent:** a deep forest-green (`--accent`), doubling as both a strong
  ink tone for headlines/CTAs and the system's one interactive color —
  there is no separate bright hue anywhere in this system.
- **Borders:** soft, warm hairlines (`--border`) — quiet, structured,
  never competing with the green.
- **Typography:** a refined serif (`--font-display`) for headlines gives
  this enterprise system unexpected warmth; body copy and UI chrome stay
  in a clean humanist sans (`--font-body`) for data-table legibility.
- **Shape:** small, structured radii.

## Colors

- **Background (cream):** `#EDEADE`
- **Surface (card face):** `#F6F4EA`
- **Foreground / ink:** `#1C1B17`
- **Muted:** `#6E6A5C`
- **Border:** `#DBD6C4`
- **Accent (deep forest-green):** `#0F2E20`

## Typography

- Display (headlines): a refined serif (e.g. Lora)
- Body & UI: Ubuntu
- Mono / labels: Ubuntu Mono

## Craft notes

- This system has no orange or other bright secondary hue anywhere —
  the deep green plus warm cream is the whole chromatic identity.
- The display face is a genuine serif, not a condensed sans — that
  contrast against the clean sans body is what gives this "enterprise"
  system its distinctive warmth.

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
| `--chart-1` | `#0f2e20` |
| `--chart-2` | `#66467a` |
| `--chart-3` | `#006079` |
| `--chart-4` | `#7f3e48` |
| `--chart-5` | `#605609` |
| `--chart-6` | `#3e5387` |
| `--chart-seq-1` | `#bdc1b4` |
| `--chart-seq-2` | `#8e998b` |
| `--chart-seq-3` | `#627365` |
| `--chart-seq-4` | `#385041` |
| `--chart-seq-5` | `#0f2e20` |
| `--chart-pos` | `#00963e` |
| `--chart-neg` | `#dc2626` |
| `--chart-grid` | `#e9e5d5` |
| `--chart-axis` | `#686456` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
