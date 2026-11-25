> Soft, rounded 3D-like shapes mimicking malleable clay with playful, puffy elements and colorful surfaces.

## 1. Visual Theme & Atmosphere

Soft, rounded 3D-like shapes mimicking malleable clay with playful, puffy elements and colorful surfaces.

- **Visual style:** modern, high-contrast, playful
- **Color stance:** primary, neutral, success, warning, danger
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#b46a46` — Token from style foundations.
- **Secondary:** `#FFFFFF` — Token from style foundations.
- **Success:** `#4d8f5a` — Token from style foundations.
- **Warning:** `#c88735` — Token from style foundations.
- **Danger:** `#b84c4c` — Token from style foundations.
- **Surface:** `#fff8f1` — Token from style foundations.
- **Text:** `#2b211c` — Token from style foundations.
- **Neutral:** `#fff8f1` — Derived from the surface token for official format compatibility.

- Favor Primary (#b46a46) for CTA emphasis.
- Use Surface (#fff8f1) for large backgrounds and cards.
- Keep body copy on Text (#2b211c) for legibility.

## 3. Typography

- **Scale:** desktop-first expressive scale
- **Families:** primary=Montserrat, display=Poppins, mono=JetBrains Mono
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

- Buttons: primary action uses `#b46a46`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#b46a46) as the interaction signal.
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
| `--chart-1` | `#b46a46` |
| `--chart-2` | `#009395` |
| `--chart-3` | `#89832d` |
| `--chart-4` | `#5382bf` |
| `--chart-5` | `#ad648d` |
| `--chart-6` | `#4a925e` |
| `--chart-seq-1` | `#ebd3c5` |
| `--chart-seq-2` | `#deb8a5` |
| `--chart-seq-3` | `#d19e85` |
| `--chart-seq-4` | `#c38466` |
| `--chart-seq-5` | `#b46a46` |
| `--chart-pos` | `#4d8f5a` |
| `--chart-neg` | `#b84c4c` |
| `--chart-grid` | `#eaded4` |
| `--chart-axis` | `#78695f` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
