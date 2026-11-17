> Smooth color transitions and gradient-rich surfaces for modern, playful interfaces with visual depth.

## 1. Visual Theme & Atmosphere

Smooth color transitions and gradient-rich surfaces for modern, playful interfaces with visual depth.

- **Visual style:** modern, playful
- **Color stance:** primary, secondary, neutral, success, warning, danger
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#7c3aed` — Token from style foundations.
- **Secondary:** `#E60076` — Token from style foundations.
- **Success:** `#10b981` — Token from style foundations.
- **Warning:** `#f59e0b` — Token from style foundations.
- **Danger:** `#ef4444` — Token from style foundations.
- **Surface:** `#FFFFFF` — Token from style foundations.
- **Text:** `#191225` — Token from style foundations.
- **Neutral:** `#FFFFFF` — Derived from the surface token for official format compatibility.

- Favor Primary (#7c3aed) for CTA emphasis.
- Use Surface (#FFFFFF) for large backgrounds and cards.
- Keep body copy on Text (#191225) for legibility.

## 3. Typography

- **Scale:** 12/14/16/19/26/40/62/86
- **Families:** primary=Montserrat, display=Space Grotesk, mono=JetBrains Mono
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

- Buttons: primary action uses `#7c3aed`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#7c3aed) as the interaction signal.
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
| `--motion-fast` | `160ms` |
| `--motion-base` | `260ms` |
| `--ease-standard` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--motion-instant` | `80ms` |
| `--motion-slow` | `520ms` |
| `--motion-scene` | `1040ms` |
| `--ease-enter` | `cubic-bezier(0.34, 1.12, 0.64, 1)` |
| `--ease-exit` | `cubic-bezier(0.7, 0, 0.84, 0)` |
| `--ease-spring` | a `linear()` spring |
| `--motion-stagger` | `80ms` |
| `--motion-distance` | `16px` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
