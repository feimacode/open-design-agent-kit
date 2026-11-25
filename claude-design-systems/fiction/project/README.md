A playful, storybook-inspired interface: warm cream surfaces, chunky black
outlines on every card and control, and a confident violet accent — built
for indie presses, classrooms, and anything that wants to feel hand-crafted
rather than corporate.

## Style Foundations

- **Visual style:** playful, illustrated, storybook
- **Canvas:** a warm cream/peach surface (`--bg`) — never white; this is a
  picture-book page, not a spreadsheet.
- **Ink:** near-black (`--fg`), used both for text and for the system's
  signature **chunky 2–3px outlines** on cards, buttons, and badges.
- **Accent:** a single confident violet (`--accent`) for primary actions.
  Content itself (illustration tiles, category cards) is free to use a
  playful multicolor palette, but the *interface* — buttons, links, focus
  states — stays to this one accent.
- **Borders:** always the near-black ink color, always visible, always
  2–3px — never a soft hairline. This is the single signature move: every
  card, button, and badge is outlined like a panel in a picture book.
- **Typography:** a big, expressive display face (`--font-display`) for
  headlines; body copy steps down to a warm, readable sans (`--font-body`)
  so long captions stay easy to read.
- **Shape:** generously rounded corners on cards and pills on buttons —
  soft shapes wrapped in a hard outline is the core visual joke of the
  system.

## Colors

- **Background (cream):** `#FCE6C8`
- **Surface (card face):** `#FFF8EC`
- **Foreground / ink & outline:** `#1E1B18`
- **Muted / captions:** `#6B6259`
- **Border (always ink, always 2–3px):** `#1E1B18`
- **Accent (violet):** `#7C5CFC`

## Typography

- Display (headlines): Cossette Texte
- Body & UI: a warm humanist sans (e.g. Nunito)
- Mono / labels: JetBrains Mono

## Craft notes

- Borders are thick (2–3px) and always ink-black, never a light gray
  hairline — a thin border on this system reads as a bug, not a variant.
- Reserve the violet accent for interface actions only; illustrated content
  tiles may use their own bright colors freely.

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
| `--chart-1` | `#7c5cfc` |
| `--chart-2` | `#bf6600` |
| `--chart-3` | `#cd3d97` |
| `--chart-4` | `#3a9800` |
| `--chart-5` | `#008bd2` |
| `--chart-6` | `#dd3d25` |
| `--chart-seq-1` | `#dfced8` |
| `--chart-seq-2` | `#c3b5e4` |
| `--chart-seq-3` | `#a99aee` |
| `--chart-seq-4` | `#917ef6` |
| `--chart-seq-5` | `#7c5cfc` |
| `--chart-pos` | `#00963e` |
| `--chart-neg` | `#dc2626` |
| `--chart-grid` | `#ccb894` |
| `--chart-axis` | `#6b6259` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
