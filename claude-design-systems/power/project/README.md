A high-end dark aesthetic for premium brand experiences: a deep
indigo-black canvas, bold oversized headlines, and a single confident
orange accent on fully-rounded "glint" pill controls.

## Style Foundations

- **Visual style:** premium, bold, monochromatic-plus-one
- **Canvas:** a deep indigo-black (`--bg`), never flat pure black — the
  slight tint is what reads as premium rather than austere. Card surfaces
  (`--surface`) sit a touch lighter, in the same family.
- **Ink:** near-white (`--fg`) for headlines and text.
- **Accent:** a single confident orange (`--accent`), used sparingly for
  primary buttons and key emphasis — the system's one chromatic note
  against an otherwise monochrome canvas.
- **Typography:** a technical monospace face (`--font-display` /
  `--font-body`) carries both headlines and body copy, giving the system
  its precise, engineered feel rather than a soft display-serif luxury
  look.
- **Shape:** buttons are fully-rounded pills with a subtle glint/highlight
  on hover; cards use a generous, confident radius.

## Colors

- **Background (indigo-black):** `#201F33`
- **Surface (panel):** `#2A2942`
- **Foreground / ink:** `#FAFAFA`
- **Muted:** `#9694B0`
- **Border:** `#3B3A56`
- **Accent (orange):** `#FF6101`

## Typography

- Display & body: IBM Plex Mono
- Mono / labels: IBM Plex Mono

## Craft notes

- Keep the orange accent rare — one or two uses per screen. The premium
  feel comes from restraint, not from more color.
- Buttons should read as pill shapes with a visible highlight/glint, not
  flat fills — this is the system's one signature interactive detail.

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
