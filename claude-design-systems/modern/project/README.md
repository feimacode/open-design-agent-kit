> Contemporary editorial style with serif typography, minimal palettes, and clean layouts for polished digital products.

## 1. Visual Theme & Atmosphere

Contemporary editorial style with serif typography, minimal palettes, and clean layouts for polished digital products.

- **Visual style:** modern, minimal, clean, editorial
- **Color stance:** primary, secondary
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#4f46e5` — Token from style foundations.
- **Secondary:** `#111111` — Token from style foundations.
- **Success:** `#10b981` — Token from style foundations.
- **Warning:** `#f59e0b` — Token from style foundations.
- **Danger:** `#ef4444` — Token from style foundations.
- **Surface:** `#ffffff` — Token from style foundations.
- **Text:** `#111827` — Token from style foundations.
- **Neutral:** `#ffffff` — Derived from the surface token for official format compatibility.

- Favor Primary (#4f46e5) for CTA emphasis.
- Use Surface (#ffffff) for large backgrounds and cards.
- Keep body copy on Text (#111827) for legibility.

## 3. Typography

- **Scale:** 12/14/16/18/24/36/54/76
- **Families:** primary=IBM Plex Serif, display=IBM Plex Serif, mono=JetBrains Mono
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

- Buttons: primary action uses `#4f46e5`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#4f46e5) as the interaction signal.
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
| `--motion-fast` | `150ms` |
| `--motion-base` | `240ms` |
| `--ease-standard` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--motion-instant` | `80ms` |
| `--motion-slow` | `480ms` |
| `--motion-scene` | `960ms` |
| `--ease-enter` | `cubic-bezier(0.34, 1.12, 0.64, 1)` |
| `--ease-exit` | `cubic-bezier(0.7, 0, 0.84, 0)` |
| `--ease-spring` | a `linear()` spring |
| `--motion-stagger` | `70ms` |
| `--motion-distance` | `16px` |

## Charts

Chart colours derived from this system's accent, background and status colours. Use the series colours in order, the up and down colours for change only, and never show meaning by colour alone.

| Token | Value |
| --- | --- |
| `--chart-1` | `#4f46e5` |
| `--chart-2` | `#ac4100` |
| `--chart-3` | `#a7228f` |
| `--chart-4` | `#477700` |
| `--chart-5` | `#007baf` |
| `--chart-6` | `#be0e2c` |
| `--chart-seq-1` | `#d0d7fb` |
| `--chart-seq-2` | `#abb6f8` |
| `--chart-seq-3` | `#8894f4` |
| `--chart-seq-4` | `#6970ed` |
| `--chart-seq-5` | `#4f46e5` |
| `--chart-pos` | `#009f69` |
| `--chart-neg` | `#ef4444` |
| `--chart-grid` | `#eef1f7` |
| `--chart-axis` | `#6b7280` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
