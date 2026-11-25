> Retro arcade-inspired design with pixel fonts, dotted borders, playful high-contrast colors, and 8-bit game aesthetics.

## 1. Visual Theme & Atmosphere

Retro arcade-inspired design with pixel fonts, dotted borders, playful high-contrast colors, and 8-bit game aesthetics.

- **Visual style:** high-contrast, playful, dotted borders
- **Color stance:** primary, secondary, success, warning, danger, info, surface/subtle layers
- **Design intent:** Keep outputs recognizable to this style family while preserving usability and readability.

## 2. Color

- **Primary:** `#ffcc00` — Token from style foundations.
- **Secondary:** `#F4B9B0` — Token from style foundations.
- **Success:** `#00ff66` — Token from style foundations.
- **Warning:** `#ff9900` — Token from style foundations.
- **Danger:** `#ff3b3b` — Token from style foundations.
- **Surface:** `#101014` — Token from style foundations.
- **Text:** `#fff7d6` — Token from style foundations.
- **Neutral:** `#101014` — Derived from the surface token for official format compatibility.

- Favor Primary (#ffcc00) for CTA emphasis.
- Use Surface (#101014) for large backgrounds and cards.
- Keep body copy on Text (#fff7d6) for legibility.

## 3. Typography

- **Scale:** desktop-first expressive scale
- **Families:** primary=Press Start 2P, display=Press Start 2P, mono=Space Mono
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

- Buttons: primary action uses `#ffcc00`; secondary actions stay neutral.
- Inputs: strong focus-visible states, clear labels, and predictable error messaging.
- Cards/sections: use consistent radii, spacing, and elevation strategy across the page.

## 7. Motion & Interaction

- Use subtle transitions that emphasize Primary (#ffcc00) as the interaction signal.
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
| `--motion-fast` | `90ms` |
| `--motion-base` | `160ms` |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--motion-instant` | `50ms` |
| `--motion-slow` | `320ms` |
| `--motion-scene` | `640ms` |
| `--ease-enter` | `cubic-bezier(0.34, 1.12, 0.64, 1)` |
| `--ease-exit` | `cubic-bezier(0.7, 0, 0.84, 0)` |
| `--ease-spring` | a `linear()` spring |
| `--motion-stagger` | `50ms` |
| `--motion-distance` | `16px` |

## Charts

Chart colours derived from this system's accent, background and status colours. Use the series colours in order, the up and down colours for change only, and never show meaning by colour alone.

| Token | Value |
| --- | --- |
| `--chart-1` | `#ffcc00` |
| `--chart-2` | `#14c3ff` |
| `--chart-3` | `#4ed679` |
| `--chart-4` | `#ca9aff` |
| `--chart-5` | `#ff8670` |
| `--chart-6` | `#00d8db` |
| `--chart-seq-1` | `#2c2410` |
| `--chart-seq-2` | `#5a4a18` |
| `--chart-seq-3` | `#8e731b` |
| `--chart-seq-4` | `#c59e17` |
| `--chart-seq-5` | `#ffcc00` |
| `--chart-pos` | `#00ff66` |
| `--chart-neg` | `#ff3b3b` |
| `--chart-grid` | `#17218a` |
| `--chart-axis` | `#b9a85d` |

## Not synced from Open Design

- Written as literal colours computed from color-mix(): --accent-hover, --accent-active. They won't follow later edits to the colours they mix.
- Motion tokens are not Claude tokens (there is no motion family); they are listed under Motion above as guidance.
- Fonts are named by family only (hosted faces); no font files were copied.
- No components or assets: Open Design design systems carry tokens and guidance only.
