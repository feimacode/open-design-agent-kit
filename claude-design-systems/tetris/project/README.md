> Classic block-game inspired design with playful colors, bold display fonts, and compact, high-energy layouts.

## 1. Visual Theme & Atmosphere

Classic block-game inspired design with playful colors, bold display fonts, and compact, high-energy layouts.

- **Visual style:** high-contrast, playful, premium
- **Color stance:** primary, secondary, success, warning, danger, info
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#00f0f0` — Token from style foundations.
- **Secondary:** `#7107E7` — Token from style foundations.
- **Success:** `#00f000` — Token from style foundations.
- **Warning:** `#f0f000` — Token from style foundations.
- **Danger:** `#f00000` — Token from style foundations.
- **Surface:** `#10162a` — Token from style foundations.
- **Text:** `#f8fafc` — Token from style foundations.
- **Neutral:** `#10162a` — Derived from the surface token for official format compatibility.

- Favor Primary (#00f0f0) for CTA emphasis.
- Use Surface (#10162a) for large backgrounds and cards.
- Keep body copy on Text (#f8fafc) for legibility.

## 3. Typography

- **Scale:** desktop-first expressive scale
- **Families:** primary=Bangers, display=Bangers, mono=JetBrains Mono
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

- Buttons: primary action uses `#00f0f0`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#00f0f0) as the interaction signal.
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
| `--motion-fast` | `80ms` |
| `--motion-base` | `140ms` |
| `--ease-standard` | `steps(2, end)` |
| `--motion-instant` | `40ms` |
| `--motion-slow` | `280ms` |
| `--motion-scene` | `560ms` |
| `--ease-enter` | `cubic-bezier(0.34, 1.12, 0.64, 1)` |
| `--ease-exit` | `cubic-bezier(0.7, 0, 0.84, 0)` |
| `--ease-spring` | a `linear()` spring |
| `--motion-stagger` | `40ms` |
| `--motion-distance` | `16px` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
