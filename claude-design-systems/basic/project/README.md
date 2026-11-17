A print-inspired editorial system for publications, reports, and long-form
content: a bright paper canvas, condensed expressive display type for
headlines, and a single blue-violet accent for calls to action.

## Style Foundations

- **Visual style:** editorial, expressive, print-inspired
- **Canvas:** bright, near-white paper (`--bg`/`--surface`) — this is a
  reading-first system, so contrast and legibility come before mood.
- **Ink:** a dark ink-navy (`--fg`), close to black but never pure — matches
  the printed-page feel of a newspaper or report.
- **Accent:** a single confident blue-violet (`--accent`), used for primary
  actions and key emphasis only.
- **Typography:** a condensed, expressive display face (`--font-display`)
  carries headlines the way a masthead or magazine cover line would; body
  copy stays in a warm, readable humanist sans (`--font-body`).
- **Photography:** hero sections may sit on a dark, desaturated photograph
  with a scrim — the rest of the system stays on the light paper canvas.
- **Shape:** modest, editorial radii — rounded enough to feel current,
  never playful or boxy.

## Colors

- **Background (paper):** `#F7F6F2`
- **Surface (card face):** `#FFFFFF`
- **Foreground / ink-navy:** `#0A1829`
- **Muted / captions:** `#5B6472`
- **Border:** `#DEE1E6`
- **Accent (blue-violet):** `#4F5FEA`

## Typography

- Display (headlines): Oswald
- Body & UI: Nunito
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

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
