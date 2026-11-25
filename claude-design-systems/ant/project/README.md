> Structured, enterprise-focused design system emphasizing clarity, consistency, and efficiency for data-dense web applications.

## 1. Visual Theme & Atmosphere

Structured, enterprise-focused design system emphasizing clarity, consistency, and efficiency for data-dense web applications.

- **Visual style:** data-dense, enterprise
- **Color stance:** primary, neutral, success, warning, danger
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#d32029` — Token from style foundations.
- **Secondary:** `#8B5CF6` — Token from style foundations.
- **Success:** `#22a06b` — Token from style foundations.
- **Warning:** `#faad14` — Token from style foundations.
- **Danger:** `#cf1322` — Token from style foundations.
- **Surface:** `#f7f8fa` — Token from style foundations.
- **Text:** `#1f1f1f` — Token from style foundations.
- **Neutral:** `#f7f8fa` — Derived from the surface token for official format compatibility.

- Favor Primary (#d32029) for CTA emphasis.
- Use Surface (#f7f8fa) for large backgrounds and cards.
- Keep body copy on Text (#1f1f1f) for legibility.

## 3. Typography

- **Scale:** 12/14/16/18/22/32/48/64
- **Families:** primary=Ant Sans, display=Ant Sans, mono=SF Mono
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

- Buttons: primary action uses `#d32029`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#d32029) as the interaction signal.
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
| `--motion-fast` | `140ms` |
| `--motion-base` | `220ms` |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--motion-instant` | `70ms` |
| `--motion-slow` | `440ms` |
| `--motion-scene` | `880ms` |
| `--ease-enter` | `cubic-bezier(0.34, 1.12, 0.64, 1)` |
| `--ease-exit` | `cubic-bezier(0.7, 0, 0.84, 0)` |
| `--ease-spring` | a `linear()` spring |
| `--motion-stagger` | `70ms` |
| `--motion-distance` | `16px` |

## Charts

Chart colours derived from this system's accent, background and status colours. Use the series colours in order, the up and down colours for change only, and never show meaning by colour alone.

| Token | Value |
| --- | --- |
| `--chart-1` | `#d32029` |
| `--chart-2` | `#00956e` |
| `--chart-3` | `#a76400` |
| `--chart-4` | `#007ed6` |
| `--chart-5` | `#ab3bb1` |
| `--chart-6` | `#478800` |
| `--chart-seq-1` | `#fdd8d3` |
| `--chart-seq-2` | `#f7b0a9` |
| `--chart-seq-3` | `#ee887f` |
| `--chart-seq-4` | `#e25c56` |
| `--chart-seq-5` | `#d32029` |
| `--chart-pos` | `#22a06b` |
| `--chart-neg` | `#cf1322` |
| `--chart-grid` | `#eef0f4` |
| `--chart-axis` | `#697386` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
