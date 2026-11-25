> Dynamic, vibrant style with thick borders, geometric shapes, high-contrast colors, and expressive typography conveying motion and vitality.

## 1. Visual Theme & Atmosphere

Dynamic, vibrant style with thick borders, geometric shapes, high-contrast colors, and expressive typography conveying motion and vitality.

- **Visual style:** bold, geometric, vibrant, thick-bordered
- **Color stance:** primary, secondary, neutral
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#ff6b00` — Token from style foundations.
- **Secondary:** `#F59E0B` — Token from style foundations.
- **Success:** `#2e9d57` — Token from style foundations.
- **Warning:** `#ffb020` — Token from style foundations.
- **Danger:** `#e5484d` — Token from style foundations.
- **Background:** `#fff8d7` — Token from style foundations.
- **Surface:** `#ffffff` — Token from style foundations.
- **Text:** `#1d1836` — Token from style foundations.
- **Neutral:** `#ffffff` — Derived from the surface token for official format compatibility.

- Favor Primary (#ff6b00) for CTA emphasis.
- Use Surface (#ffffff) for large backgrounds and cards.
- Keep body copy on Text (#1d1836) for legibility.

## 3. Typography

- **Scale:** 12/14/16/18/24/36/54/76
- **Families:** primary=Limelight, display=Limelight, mono=JetBrains Mono
- **Weights:** 400
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

- Buttons: primary action uses `#ff6b00`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#ff6b00) as the interaction signal.
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
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |
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
| `--chart-1` | `#f15e00` |
| `--chart-2` | `#009ca0` |
| `--chart-3` | `#a09000` |
| `--chart-4` | `#2591f1` |
| `--chart-5` | `#e354ae` |
| `--chart-6` | `#00a63b` |
| `--chart-seq-1` | `#ffdbb4` |
| `--chart-seq-2` | `#ffbe91` |
| `--chart-seq-3` | `#fda06d` |
| `--chart-seq-4` | `#f88145` |
| `--chart-seq-5` | `#f15e00` |
| `--chart-pos` | `#2e9d57` |
| `--chart-neg` | `#e5484d` |
| `--chart-grid` | `#f5eccd` |
| `--chart-axis` | `#73698b` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
