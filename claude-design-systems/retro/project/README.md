> Throwback design with vintage-inspired typography, high-contrast retro palettes, and nostalgic visual elements.

## 1. Visual Theme & Atmosphere

Throwback design with vintage-inspired typography, high-contrast retro palettes, and nostalgic visual elements.

- **Visual style:** high-contrast, retro
- **Color stance:** primary, neutral, success, warning, danger
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#d24b1f` — Token from style foundations.
- **Secondary:** `#8B5CF6` — Token from style foundations.
- **Success:** `#3d8f4f` — Token from style foundations.
- **Warning:** `#f2a93b` — Token from style foundations.
- **Danger:** `#b83a2f` — Token from style foundations.
- **Surface:** `#fffaf0` — Token from style foundations.
- **Text:** `#2a1810` — Token from style foundations.
- **Neutral:** `#fffaf0` — Derived from the surface token for official format compatibility.

- Favor Primary (#d24b1f) for CTA emphasis.
- Use Surface (#fffaf0) for large backgrounds and cards.
- Keep body copy on Text (#2a1810) for legibility.

## 3. Typography

- **Scale:** desktop-first expressive scale
- **Families:** primary=Macondo, display=Macondo, mono=JetBrains Mono
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

- Buttons: primary action uses `#d24b1f`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#d24b1f) as the interaction signal.
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
| `--chart-1` | `#d24b1f` |
| `--chart-2` | `#009d90` |
| `--chart-3` | `#9d7b00` |
| `--chart-4` | `#0082e1` |
| `--chart-5` | `#bd4ba4` |
| `--chart-6` | `#2a9724` |
| `--chart-seq-1` | `#fad4ad` |
| `--chart-seq-2` | `#f3b38c` |
| `--chart-seq-3` | `#ea926a` |
| `--chart-seq-4` | `#df7048` |
| `--chart-seq-5` | `#d24b1f` |
| `--chart-pos` | `#3d8f4f` |
| `--chart-neg` | `#b83a2f` |
| `--chart-grid` | `#efd0ab` |
| `--chart-axis` | `#8a6652` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
