> Monospace-driven, matrix-inspired design with high-contrast elements, compact density, and a hacker-chic aesthetic.

## 1. Visual Theme & Atmosphere

Monospace-driven, matrix-inspired design with high-contrast elements, compact density, and a hacker-chic aesthetic.

- **Visual style:** minimal, clean, high-contrast, playful, matrix
- **Color stance:** primary, secondary, success, warning, danger, info
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#111111` — Token from style foundations.
- **Secondary:** `#00A6F4` — Token from style foundations.
- **Success:** `#168a46` — Token from style foundations.
- **Warning:** `#b7791f` — Token from style foundations.
- **Danger:** `#c53030` — Token from style foundations.
- **Surface:** `#f7f7f7` — Token from style foundations.
- **Text:** `#111111` — Token from style foundations.
- **Neutral:** `#f7f7f7` — Derived from the surface token for official format compatibility.

- Favor Primary (#111111) for CTA emphasis.
- Use Surface (#f7f7f7) for large backgrounds and cards.
- Keep body copy on Text (#111111) for legibility.

## 3. Typography

- **Scale:** desktop-first expressive scale
- **Families:** primary=IBM Plex Mono, display=IBM Plex Mono, mono=IBM Plex Mono
- **Weights:** 100, 200, 300, 400, 500, 600, 700, 800, 900
- Headings should carry the style personality; body text should optimize scanability and contrast.

## 4. Spacing & Grid

- **Spacing scale:** compact density mode
- Keep vertical rhythm consistent across sections and components.
- Align columns and modules to a predictable grid; avoid ad-hoc offsets.

## 5. Layout & Composition

- Prefer clear content blocks with consistent internal padding.
- Keep hierarchy obvious: headline → support text → primary action.
- Use whitespace to separate concerns before adding borders or shadows.

## 6. Components

- Buttons: primary action uses `#111111`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#111111) as the interaction signal.
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
| `--motion-fast` | `100ms` |
| `--motion-base` | `180ms` |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--motion-instant` | `50ms` |
| `--motion-slow` | `360ms` |
| `--motion-scene` | `720ms` |
| `--ease-enter` | `cubic-bezier(0.34, 1.12, 0.64, 1)` |
| `--ease-exit` | `cubic-bezier(0.7, 0, 0.84, 0)` |
| `--ease-spring` | a `linear()` spring |
| `--motion-stagger` | `50ms` |
| `--motion-distance` | `16px` |

## Charts

Chart colours derived from this system's accent, background and status colours. Use the series colours in order, the up and down colours for change only, and never show meaning by colour alone.

| Token | Value |
| --- | --- |
| `--chart-1` | `#111111` |
| `--chart-2` | `#9d6044` |
| `--chart-3` | `#856196` |
| `--chart-4` | `#797430` |
| `--chart-5` | `#138282` |
| `--chart-6` | `#9c5a6f` |
| `--chart-seq-1` | `#c9c9c9` |
| `--chart-seq-2` | `#959595` |
| `--chart-seq-3` | `#656565` |
| `--chart-seq-4` | `#383838` |
| `--chart-seq-5` | `#111111` |
| `--chart-pos` | `#168a46` |
| `--chart-neg` | `#c53030` |
| `--chart-grid` | `#eeeeee` |
| `--chart-axis` | `#707070` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
