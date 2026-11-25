A purple-themed app-dashboard aesthetic: glass-like panels, soft shadows,
and rounded components on a light canvas, with an optional deep-purple
gradient hero band — built for developer-first product dashboards.

## Style Foundations

- **Visual style:** modern, clean, high-contrast, glass-like panels, soft
  shadows, rounded components
- **Canvas:** a light, neutral canvas (`--bg`/`--surface`) for the general
  dashboard body — cards, tables, and settings panels stay light and calm.
- **Ink:** near-black (`--fg`) for text and structure.
- **Accent:** a confident purple (`--accent`) for primary actions,
  navigation highlights, and key numerals.
- **Hero treatment:** a marketing/landing hero may sit on a deep-purple
  gradient band with white headline text — the rest of the product stays
  on the light canvas described above.
- **Shape:** generously rounded, soft-shadowed cards — "glass-like" reads
  through gentle elevation, not hard borders.
- **Typography:** a clean geometric sans (`--font-display`/`--font-body`)
  throughout.

## Colors

- **Background:** `#F7F5FC`
- **Surface (card face):** `#FFFFFF`
- **Foreground / ink:** `#09090B`
- **Muted:** `#6B6478`
- **Border:** `#E7E2F2`
- **Accent (purple):** `#9333EA`

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
| `--chart-1` | `#9333ea` |
| `--chart-2` | `#9d6a00` |
| `--chart-3` | `#c9286a` |
| `--chart-4` | `#00922f` |
| `--chart-5` | `#0079dd` |
| `--chart-6` | `#ca3c00` |
| `--chart-seq-1` | `#e2d2fc` |
| `--chart-seq-2` | `#cdb0fa` |
| `--chart-seq-3` | `#b98cf6` |
| `--chart-seq-4` | `#a565f1` |
| `--chart-seq-5` | `#9333ea` |
| `--chart-pos` | `#009f69` |
| `--chart-neg` | `#ef4444` |
| `--chart-grid` | `#f0ecf8` |
| `--chart-axis` | `#6b6478` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
