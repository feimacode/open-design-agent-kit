An arcade-inspired game interface: a vivid royal-blue canvas, pixel-mono
display typography, and white "cabinet" panels floating on top with a
punchy offset-shadow instead of a soft blur — hard edges throughout, never
soft ones.

## Style Foundations

- **Visual style:** playful, arcade, high-contrast
- **Canvas:** a vivid royal blue (`--bg`) runs the whole page.
- **Panels:** genuinely white/cream panels (`--surface`) sit on top of the
  blue canvas for cards, stat blocks, and the "cabinet" graphic — text
  inside these panels uses near-black ink; headline text sitting directly
  on the blue canvas should be set in white in the surrounding markup (a
  single shared `--fg` can't cover both contexts at once — this system
  deliberately has two reading zones, canvas and panel).
- **Accent:** a bright yellow (`--accent`) for tickers, callouts, and key
  buttons — the signature high-energy note against the blue/white base.
- **Borders / shadow:** panels get a hard, punchy **offset shadow**
  (`box-shadow: 4px 4px 0 var(--border)`, not a blurred drop shadow) in a
  dark or bold color — this is the arcade-cabinet "physical" feel, and the
  single most important signature of the system.
- **Typography:** a genuine pixel/mono display face (`--font-display`) for
  headlines and numerals; body copy in a clean sans (`--font-body`) so
  longer text stays legible.
- **Shape:** small, hard-edged radii — this is a hard-edge system, never
  a soft or pill-shaped one.

## Colors

- **Background (royal blue):** `#4502FF`
- **Surface (white panel):** `#FFFFFF`
- **Foreground / ink (on panels):** `#111827`
- **Muted:** `#5B6472`
- **Border (offset-shadow color):** `#111827`
- **Accent (bright yellow):** `#FFDA14`

## Typography

- Display (headlines, numerals): VT323 (pixel mono)
- Body & UI: a clean sans (e.g. Inter)
- Mono / labels: JetBrains Mono

## Craft notes

- The offset shadow is hard-edged (no blur radius), not a soft drop
  shadow — this single detail is what makes the system read as "arcade
  cabinet" rather than generic flat design.
- Keep corners sharp to modest — this is not a rounded-pill system.

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
