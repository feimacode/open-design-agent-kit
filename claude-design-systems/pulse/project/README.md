A dynamic, vibrant system built around thick borders and geometric shapes:
a warm peach canvas, a punchy burnt-orange accent, and expressive
single-weight display type conveying motion and vitality.

## Style Foundations

- **Visual style:** bold, geometric, vibrant, thick-bordered
- **Canvas:** a warm peach cream (`--bg`), with a richer, more saturated
  peach-orange surface (`--surface`) for cards — the two tiers should
  visibly pop against each other, not blend.
- **Ink:** near-black (`--fg`) for body copy, legible and calm; the
  vibrant orange-red is reserved for headline emphasis and the accent, not
  long-form text.
- **Accent:** a punchy burnt orange-red (`--accent`) for primary actions
  and key emphasis.
- **Borders:** thick and dark (`--border`) — a defining move of the
  system. A thin hairline border undersells this aesthetic; borders here
  should read as a deliberate graphic element, not a subtle divider.
- **Typography:** a single expressive display weight
  (`--font-display`/`--font-body`) carries both headlines and body —
  this system doesn't lean on a weight range for hierarchy, it leans on
  size and color.
- **Shape:** small, geometric radii — precise corners, not soft ones.

## Colors

- **Background (peach):** `#FFEDD5`
- **Surface (saturated peach-orange):** `#FDBA74`
- **Foreground / ink:** `#1A1207`
- **Muted:** `#8A5A2A`
- **Border (thick, dark):** `#1A1207`
- **Accent (burnt orange-red):** `#EA580B`

## Typography

- Display & body: Limelight (single weight)
- Mono / labels: JetBrains Mono

## Craft notes

- Borders are thick (2–3px+) and dark, always — this is the system's
  single most load-bearing detail, more important than any specific hue.
- Keep the vivid orange-red for headlines/accents only; body copy stays
  in the calmer near-black ink for legibility at length.

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

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
