A structured, geometric interface: neutral cool-gray surfaces, precise
shapes, and clean sans typography, with a single confident blue accent
and a violet flourish held in reserve for secondary emphasis (gradients,
badges) — a system built to "stay out of the way" of the content.

## Style Foundations

- **Visual style:** geometric, structured, clean
- **Canvas:** neutral, cool off-white (`--bg`), with pure white card
  surfaces (`--surface`) — no warmth, no tint, just neutral gray-scale.
- **Ink:** a cool near-black (`--fg`) for text and structure.
- **Accent:** a confident blue (`--accent`) for primary actions and key
  numerals/emphasis. A secondary violet may appear in gradients or badge
  fills alongside the blue, but every interactive control stays blue.
- **Photography:** hero sections may sit on a dark, moody photograph (deep
  navy scrim) with bold white headline type — the rest of the system stays
  on the light, neutral canvas.
- **Shape:** precise, moderate radii — geometric and crisp, not soft or
  playful.

## Colors

- **Background:** `#F5F6F8`
- **Surface (card face):** `#FFFFFF`
- **Foreground / ink:** `#111827`
- **Muted:** `#5B6472`
- **Border:** `#E2E5EA`
- **Accent (blue):** `#3B82F6`
- **Secondary flourish (violet, gradients/badges only):** `#8B5CF6`

## Typography

- Display & body: Inter
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
| `--chart-1` | `#3b82f6` |
| `--chart-2` | `#db5a00` |
| `--chart-3` | `#b759cc` |
| `--chart-4` | `#908e00` |
| `--chart-5` | `#0098a6` |
| `--chart-6` | `#dd4878` |
| `--chart-seq-1` | `#d0e0fa` |
| `--chart-seq-2` | `#abcafb` |
| `--chart-seq-3` | `#87b3fa` |
| `--chart-seq-4` | `#629bf9` |
| `--chart-seq-5` | `#3b82f6` |
| `--chart-pos` | `#16a34a` |
| `--chart-neg` | `#dc2626` |
| `--chart-grid` | `#eef0f3` |
| `--chart-axis` | `#5b6472` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
