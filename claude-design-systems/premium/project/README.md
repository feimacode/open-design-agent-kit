> Apple-inspired premium aesthetic with precise spacing, modern typography, and a refined, polished visual language.

## 1. Visual Theme & Atmosphere

Apple-inspired premium aesthetic with precise spacing, modern typography, and a refined, polished visual language.

- **Visual style:** modern
- **Color stance:** primary, neutral, success, warning, danger
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#a06a3b` — Token from style foundations.
- **Secondary:** `#8B5CF6` — Token from style foundations.
- **Success:** `#3f8f5f` — Token from style foundations.
- **Warning:** `#c4872c` — Token from style foundations.
- **Danger:** `#b84a4a` — Token from style foundations.
- **Surface:** `#FFFFFF` — Token from style foundations.
- **Text:** `#1c1b19` — Token from style foundations.
- **Neutral:** `#FFFFFF` — Derived from the surface token for official format compatibility.

- Favor Primary (#a06a3b) for CTA emphasis.
- Use Surface (#FFFFFF) for large backgrounds and cards.
- Keep body copy on Text (#1c1b19) for legibility.

## 3. Typography

- **Scale:** 12/14/16/19/26/40/60/84
- **Families:** primary=Inter, display=Canela, mono=IBM Plex Mono
- **Weights:** 100, 200, 300, 400, 500, 600, 700, 800, 900
- Headings should carry the style personality; body text should optimize scanability and contrast.

## 4. Spacing & Grid

- **Spacing scale:** 4/8/12/16/20/24/32/48
- Keep vertical rhythm consistent across sections and components.
- Align columns and modules to a predictable grid; avoid ad-hoc offsets.

## 5. Layout & Composition

- Prefer clear content blocks with consistent internal padding.
- Keep hierarchy obvious: headline → support text → primary action.
- Use whitespace to separate concerns before adding borders or shadows.

## 6. Components

- Buttons: primary action uses `#a06a3b`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#a06a3b) as the interaction signal.
- Default to short, purposeful transitions (150–250ms) with stable easing.
- Ensure hover, focus-visible, active, disabled, and loading states are explicit.

## 8. Voice & Brand

- Tone should reflect the visual style: concise, confident, and product-specific.
- Keep microcopy action-oriented and avoid generic filler language.
- Preserve the style identity in headlines while keeping UI labels literal and clear.

## 9. Anti-patterns

- Do not introduce off-palette colors when an existing token can solve the problem.
- Do not flatten hierarchy by using the same type size/weight for all text.
- Do not add decorative effects that reduce readability or accessibility.
- Do not mix unrelated visual metaphors in the same interface.

## Motion

Durations and easings for this system. Use these for every transition, animation delay and easing; don't invent others.

| Token | Value |
| --- | --- |
| `--motion-fast` | `170ms` |
| `--motion-base` | `280ms` |
| `--ease-standard` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--motion-instant` | `90ms` |
| `--motion-slow` | `560ms` |
| `--motion-scene` | `1120ms` |
| `--ease-enter` | `cubic-bezier(0.34, 1.12, 0.64, 1)` |
| `--ease-exit` | `cubic-bezier(0.7, 0, 0.84, 0)` |
| `--ease-spring` | a `linear()` spring |
| `--motion-stagger` | `80ms` |
| `--motion-distance` | `16px` |

## Charts

Chart colours derived from this system's accent, background and status colours. Use the series colours in order, the up and down colours for change only, and never show meaning by colour alone.

| Token | Value |
| --- | --- |
| `--chart-1` | `#a06a3b` |
| `--chart-2` | `#198696` |
| `--chart-3` | `#71803d` |
| `--chart-4` | `#6375af` |
| `--chart-5` | `#a56075` |
| `--chart-6` | `#38896a` |
| `--chart-seq-1` | `#e8dbce` |
| `--chart-seq-2` | `#d7bea9` |
| `--chart-seq-3` | `#c5a184` |
| `--chart-seq-4` | `#b38660` |
| `--chart-seq-5` | `#a06a3b` |
| `--chart-pos` | `#3f8f5f` |
| `--chart-neg` | `#b84a4a` |
| `--chart-grid` | `#eee7dc` |
| `--chart-axis` | `#746d63` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
