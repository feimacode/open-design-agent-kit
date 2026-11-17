> High-end dark aesthetic with bold headings, monochromatic palette, and premium feel for luxury brand experiences.

## 1. Visual Theme & Atmosphere

High-end dark aesthetic with bold headings, monochromatic palette, and premium feel for luxury brand experiences.

- **Visual style:** modern, bold, big headings
- **Color stance:** primary
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#c6a15b` — Token from style foundations.
- **Secondary:** `#FAFAFA` — Token from style foundations.
- **Success:** `#5fa36a` — Token from style foundations.
- **Warning:** `#d8a94f` — Token from style foundations.
- **Danger:** `#d85a52` — Token from style foundations.
- **Surface:** `#151310` — Token from style foundations.
- **Text:** `#fff8ea` — Token from style foundations.
- **Neutral:** `#151310` — Derived from the surface token for official format compatibility.

- Favor Primary (#c6a15b) for CTA emphasis.
- Use Surface (#151310) for large backgrounds and cards.
- Keep body copy on Text (#fff8ea) for legibility.

## 3. Typography

- **Scale:** desktop-first expressive scale
- **Families:** primary=Avenir Next, display=Didot, mono=SF Mono
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

- Buttons: primary action uses `#c6a15b`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#c6a15b) as the interaction signal.
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
| `--motion-base` | `300ms` |
| `--ease-standard` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--motion-instant` | `90ms` |
| `--motion-slow` | `600ms` |
| `--motion-scene` | `1200ms` |
| `--ease-enter` | `cubic-bezier(0.34, 1.12, 0.64, 1)` |
| `--ease-exit` | `cubic-bezier(0.7, 0, 0.84, 0)` |
| `--ease-spring` | a `linear()` spring |
| `--motion-stagger` | `90ms` |
| `--motion-distance` | `16px` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
