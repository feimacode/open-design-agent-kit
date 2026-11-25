> Frosted glass effect with translucent layers, subtle blur, and luminous borders for depth and modern elegance.

## 1. Visual Theme & Atmosphere

Frosted glass effect with translucent layers, subtle blur, and luminous borders for depth and modern elegance.

- **Visual style:** clean, high-contrast, bold, enterprise, liquidglass effect, glassmorphism
- **Color stance:** primary, neutral, success, warning, danger, info, surface/subtle layers
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#4f8cff` — Token from style foundations.
- **Secondary:** `#3A344E` — Token from style foundations.
- **Success:** `#22c55e` — Token from style foundations.
- **Warning:** `#f59e0b` — Token from style foundations.
- **Danger:** `#ef4444` — Token from style foundations.
- **Surface:** `rgba(255, 255, 255, 0.74)` — Token from style foundations.
- **Text:** `#102033` — Token from style foundations.
- **Neutral:** `rgba(255, 255, 255, 0.74)` — Derived from the surface token for official format compatibility.

- Favor Primary (#4f8cff) for CTA emphasis.
- Use Surface (rgba(255, 255, 255, 0.74)) for large backgrounds and cards.
- Keep body copy on Text (#102033) for legibility.

## 3. Typography

- **Scale:** mobile-first compact scale
- **Families:** primary=Plus Jakarta Sans, display=Plus Jakarta Sans, mono=JetBrains Mono
- **Weights:** 100, 200, 300, 400, 500, 600, 700, 800, 900
- Headings should carry the style personality; body text should optimize scanability and contrast.

## 4. Spacing & Grid

- **Spacing scale:** comfortable density mode
- Keep vertical rhythm consistent across sections and components.
- Align columns and modules to a predictable grid; avoid ad-hoc offsets.

## 5. Layout & Composition

- Prefer clear content blocks with consistent internal padding.
- Keep hierarchy obvious: headline → support text → primary action.
- Use whitespace to separate concerns before adding borders or shadows.

## 6. Components

- Buttons: primary action uses `#4f8cff`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#4f8cff) as the interaction signal.
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
| `--motion-fast` | `180ms` |
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
| `--chart-1` | `#4986f8` |
| `--chart-2` | `#e46800` |
| `--chart-3` | `#c365d3` |
| `--chart-4` | `#8a8e00` |
| `--chart-5` | `#009cad` |
| `--chart-6` | `#e8567f` |
| `--chart-seq-1` | `#cce1ff` |
| `--chart-seq-2` | `#abcbff` |
| `--chart-seq-3` | `#8bb5fe` |
| `--chart-seq-4` | `#6a9efb` |
| `--chart-seq-5` | `#4986f8` |
| `--chart-pos` | `#009e38` |
| `--chart-neg` | `#ef4444` |
| `--chart-grid` | `#e5e7eb` |
| `--chart-axis` | `#60708a` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
