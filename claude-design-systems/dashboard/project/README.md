> Dark-themed cloud-platform aesthetic with modular grids, glass-like panels, and strong data hierarchy for productivity dashboards.

## 1. Visual Theme & Atmosphere

Dark-themed cloud-platform aesthetic with modular grids, glass-like panels, and strong data hierarchy for productivity dashboards.

- **Visual style:** modern, clean, cloud-platform aesthetic (Heroku/Vercel/GitHub inspired), dark theme, subtle gradients, soft shadows, glass-like panels, rounded components
- **Color stance:** primary, neutral, success, warning, danger
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#0ea5e9` — Token from style foundations.
- **Secondary:** `#0A4A8A` — Token from style foundations.
- **Success:** `#10B981` — Token from style foundations.
- **Warning:** `#F59E0B` — Token from style foundations.
- **Danger:** `#EF4444` — Token from style foundations.
- **Surface:** `#ffffff` — Token from style foundations.
- **Text:** `#111827` — Token from style foundations.
- **Neutral:** `#ffffff` — Derived from the surface token for official format compatibility.

- Favor Primary (#0ea5e9) for CTA emphasis.
- Use Surface (#ffffff) for large backgrounds and cards.
- Keep body copy on Text (#111827) for legibility.

## 3. Typography

- **Scale:** 11/13/15/17/22/30/42/56
- **Families:** primary=IBM Plex Sans, display=IBM Plex Sans, mono=IBM Plex Sans
- **Weights:** 100, 200, 300, 400, 500, 600, 700, 800, 900
- Headings should carry the style personality; body text should optimize scanability and contrast.

## 4. Spacing & Grid

- **Spacing scale:** 8pt baseline grid
- Keep vertical rhythm consistent across sections and components.
- Align columns and modules to a predictable grid; avoid ad-hoc offsets.

## 5. Layout & Composition

- Prefer clear content blocks with consistent internal padding.
- Keep hierarchy obvious: headline → support text → primary action.
- Use whitespace to separate concerns before adding borders or shadows.

## 6. Components

- Buttons: primary action uses `#0ea5e9`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#0ea5e9) as the interaction signal.
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
| `--motion-fast` | `120ms` |
| `--motion-base` | `200ms` |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--motion-instant` | `60ms` |
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
| `--chart-1` | `#0092d5` |
| `--chart-2` | `#e06b60` |
| `--chart-3` | `#9978db` |
| `--chart-4` | `#b38600` |
| `--chart-5` | `#009d81` |
| `--chart-6` | `#cf6bad` |
| `--chart-seq-1` | `#cde3f5` |
| `--chart-seq-2` | `#a6cfee` |
| `--chart-seq-3` | `#7ebbe6` |
| `--chart-seq-4` | `#52a7de` |
| `--chart-seq-5` | `#0092d5` |
| `--chart-pos` | `#009f69` |
| `--chart-neg` | `#ef4444` |
| `--chart-grid` | `#edf3f8` |
| `--chart-axis` | `#5e6e85` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
