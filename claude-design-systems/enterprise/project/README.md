> Clean, high-contrast enterprise design for data-driven workflows with intuitive drag-and-drop patterns and structured layouts.

## 1. Visual Theme & Atmosphere

Clean, high-contrast enterprise design for data-driven workflows with intuitive drag-and-drop patterns and structured layouts.

- **Visual style:** clean, high-contrast, enterprise
- **Color stance:** primary, success, warning, danger
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#1d4ed8` — Token from style foundations.
- **Secondary:** `#FF5F03` — Token from style foundations.
- **Success:** `#15803d` — Token from style foundations.
- **Warning:** `#b45309` — Token from style foundations.
- **Danger:** `#b91c1c` — Token from style foundations.
- **Surface:** `#ffffff` — Token from style foundations.
- **Text:** `#0f172a` — Token from style foundations.
- **Neutral:** `#ffffff` — Derived from the surface token for official format compatibility.

- Favor Primary (#1d4ed8) for CTA emphasis.
- Use Surface (#ffffff) for large backgrounds and cards.
- Keep body copy on Text (#0f172a) for legibility.

## 3. Typography

- **Scale:** desktop-first expressive scale
- **Families:** primary=Ubuntu, display=Oswald, mono=Ubuntu Mono
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

- Buttons: primary action uses `#1d4ed8`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#1d4ed8) as the interaction signal.
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
| `--motion-base` | `230ms` |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--motion-instant` | `80ms` |
| `--motion-slow` | `460ms` |
| `--motion-scene` | `920ms` |
| `--ease-enter` | `cubic-bezier(0.34, 1.12, 0.64, 1)` |
| `--ease-exit` | `cubic-bezier(0.7, 0, 0.84, 0)` |
| `--ease-spring` | a `linear()` spring |
| `--motion-stagger` | `70ms` |
| `--motion-distance` | `16px` |

## Charts

Chart colours derived from this system's accent, background and status colours. Use the series colours in order, the up and down colours for change only, and never show meaning by colour alone.

| Token | Value |
| --- | --- |
| `--chart-1` | `#1d4ed8` |
| `--chart-2` | `#ae2900` |
| `--chart-3` | `#93239d` |
| `--chart-4` | `#616800` |
| `--chart-5` | `#007a94` |
| `--chart-6` | `#b40047` |
| `--chart-seq-1` | `#cadaf8` |
| `--chart-seq-2` | `#9cb9f3` |
| `--chart-seq-3` | `#7198ec` |
| `--chart-seq-4` | `#4675e3` |
| `--chart-seq-5` | `#1d4ed8` |
| `--chart-pos` | `#15803d` |
| `--chart-neg` | `#b91c1c` |
| `--chart-grid` | `#edf1f6` |
| `--chart-axis` | `#64748b` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
