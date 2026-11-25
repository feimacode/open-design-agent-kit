A dark cyber-terminal visual language: mono typography throughout, dense
data layouts, and one green interaction accent against a near-black canvas.

## Style Foundations

- **Visual style:** high-contrast, technical, terminal-inspired
- **Canvas:** near-black navy (`--bg`), with a slightly lighter dark panel
  tone (`--surface`) for cards and terminal windows.
- **Ink:** off-white (`--fg`) for headlines and primary text; a cool
  desaturated gray (`--muted`) for secondary/meta text — the terminal's
  "dimmed" text tier.
- **Accent:** a single terminal green (`--accent`), used for the logo mark,
  live-status badges, key numerals, and primary actions.
- **Typography:** monospace *everywhere* — display, body, and labels all
  share one mono face (`--font-display` / `--font-body` / `--font-mono`
  are the same family). This is the system's core identity: no humanist
  sans anywhere.
- **Shape:** small, precise radii — sharp and technical, not soft.
- **Layout:** dense, data-forward — favors compact stat panels and tight
  grids over generous whitespace.

## Colors

- **Background (near-black):** `#0B0C14`
- **Surface (panel):** `#12141F`
- **Foreground / ink:** `#E8ECEF`
- **Muted:** `#6E7681`
- **Border:** `#232734`
- **Accent (terminal green):** `#2DB58A`

## Typography

- Display, body, and mono: Space Mono (one face throughout)

## Craft notes

- Don't introduce a humanist sans anywhere in this system — the all-mono
  typography is the point, not a stylistic accent.

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
| `--chart-1` | `#2db58a` |
| `--chart-2` | `#bc81d1` |
| `--chart-3` | `#11abda` |
| `--chart-4` | `#e1787f` |
| `--chart-5` | `#a6a130` |
| `--chart-6` | `#7f96ec` |
| `--chart-seq-1` | `#162929` |
| `--chart-seq-2` | `#1f4940` |
| `--chart-seq-3` | `#266b58` |
| `--chart-seq-4` | `#2b8f70` |
| `--chart-seq-5` | `#2db58a` |
| `--chart-pos` | `#2db58a` |
| `--chart-neg` | `#f87171` |
| `--chart-grid` | `#1a1d28` |
| `--chart-axis` | `#747c87` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
