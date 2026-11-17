A radically minimal, genuinely monochrome interface: pure white canvas,
solid black carrying every structural and interactive signal, and
typography alone driving hierarchy. There is no accent color — black *is*
the accent.

## Style Foundations

- **Visual style:** minimal, monochrome, blank-canvas
- **Canvas:** pure white (`--bg`/`--surface`) — no tinting, no warmth.
- **Ink:** near-black (`--fg`) for every structural element: text, the
  primary button fill, icons, and dividers.
- **Accent:** deliberately the same near-black as the ink (`--accent`) —
  this system does not introduce a second color for interaction. A primary
  button is a solid black pill; nothing in the interface competes with it.
- **Borders:** hairline light gray (`--border`) — the only other value on
  the page besides black and white.
- **Typography:** a single clean humanist sans for both display and body
  (`--font-display` / `--font-body`) — hierarchy comes from size and
  weight, not typeface variety.
- **Shape:** buttons and pills are fully rounded; cards use a moderate
  radius — soft geometry is what keeps a pure black-and-white palette from
  feeling severe.

## Colors

- **Background / surface:** `#FFFFFF`
- **Foreground / accent (monochrome ink):** `#0A0A0A`
- **Muted:** `#6B7280`
- **Border:** `#E5E7EB`

## Typography

- Display & body: Open Sans
- Mono / labels: JetBrains Mono

## Craft notes

- Do not introduce a second hue anywhere — badges, links, and focus states
  all stay in the black/white/gray range. Any color is a deviation from
  this system, not an enhancement of it.

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
