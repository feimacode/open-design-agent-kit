A graceful, refined aesthetic: a bright white canvas, visible thin
borders, delicate geometric typography, and a single warm-peach accent —
minimal without feeling cold.

## Style Foundations

- **Visual style:** minimal, clean, refined, sophisticated
- **Canvas:** bright white (`--bg`/`--surface`) — the refinement comes
  from restraint and precise spacing, not from tinting.
- **Ink:** near-black (`--fg`) for headlines and text.
- **Accent:** a warm, soft peach/orange (`--accent`) — this is what keeps
  the system feeling graceful rather than cold; avoid a cool blue or
  purple accent, which reads as generic SaaS rather than refined.
- **Borders:** visible, thin, and quiet (`--border`) — cards and sections
  are delineated with real hairlines, not shadows alone.
- **Typography:** a clean, delicate geometric sans (`--font-display` /
  `--font-body`) at a light-to-regular weight — hierarchy comes from
  size and spacing, not heavy weight contrast.
- **Shape:** small, precise radii.

## Colors

- **Background / surface:** `#FFFFFF`
- **Foreground / ink:** `#141414`
- **Muted:** `#6B7280`
- **Border (visible, quiet):** `#E5E7EB`
- **Accent (warm peach):** `#F0965E`

## Typography

- Display & body: Google Sans
- Mono / labels: Anonymous Pro

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
