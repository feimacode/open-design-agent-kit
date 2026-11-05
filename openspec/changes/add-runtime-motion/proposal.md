## Why

The extraction drafts `--motion-fast`, `--motion-base` and `--ease-standard` from declared `transition-duration` and `transition-timing-function` values, counted across elements. Declarations are a weak signal for motion:

- Frameworks and resets declare transitions on everything. Tailwind's `transition` utility puts `150ms cubic-bezier(0.4, 0, 0.2, 1)` on any element that has it, whether or not anything changes.
- What a visitor actually sees move is never measured. That includes the button that lifts on hover, cards that fade up as they scroll in with a stagger, and the hero that animates on load. JavaScript libraries (Framer Motion, GSAP) declare no CSS transitions at all.
- The scroll pass sets `animation` and `transition` to none so reveal effects measure in their final state. That is right for colours and spacing, but it means motion is never observed.

design-extract's `--motion-runtime` drives the page through load, hover, focus and scroll, and reads `document.getAnimations()`. That captures what actually animates: real durations, the properties animated, stagger between siblings, and scroll recipes (reveal, parallax, pinning). Motion is part of a brand's feel, and a design system that says "150ms ease" when the site's cards rise 24px over 600ms with an 80ms stagger has lost it.

## What Changes

- **Observe motion before freezing it.** On the first page, before animations are disabled for measuring, the extraction records `document.getAnimations()` in three windows: the first 2 seconds after load; hovering and focusing the primary control and the first card (with real pointer moves, not forced states); and the scroll steps. For each animation it keeps the target's role (button, card, hero, section), the trigger, the animated properties with their start and end values, the duration, delay and easing. The total budget is 4 seconds, inside the page timeout.
- **Tokens from what moved.** `--motion-fast` comes from the hover and focus durations, and `--motion-base` from other state changes. `--ease-standard` comes from the most common easing among observed animations. Declarations are used only when nothing was observed, and the source says which was used.
- **A motion entry in the brand kit.** `brandKit.motion` records:
  - `hover`: what moves on hover, for example "button: translateY(-2px), shadow grows, 150ms";
  - `entrance`: how sections and cards enter on scroll, as kind (fade, rise, scale, none), distance, duration and stagger between siblings;
  - `load`: whether the hero animates on load;
  - `library`: the motion library, when one is detected from globals or attributes;
  - `reducedMotion`: whether the page honours `prefers-reduced-motion`, found by re-running the load window with it emulated.
  `brand.json` keeps it, and DESIGN.md gains a Motion section written from it.
- **Measured, not guessed.** Nothing is recorded for a trigger that produced no animations. A page with no motion says so.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `design-system-extraction`: motion tokens from observed animations.
- `brand-kit`: a `motion` entry with hover, entrance, load, library and reduced-motion facts.

## Impact

- `packages/core/src/generation/siteExtraction.ts`: observation windows before the freeze, real pointer hover and focus, reduced-motion re-run.
- `packages/core/src/generation/brandKitCapture.ts` and `brandKit.ts`: the `motion` entry and its `brand.json` shape.
- `packages/core/src/generation/evidenceToTokens.ts`: motion tokens from observations, with source.
- `customDesignSystemInstructions.ts` DESIGN.md template: a Motion section. The critic's brand input gains the motion facts.
- Fixtures: hover lift on a button, staggered fade-up cards with an IntersectionObserver, a reduced-motion media query, a page with only Tailwind's blanket `transition`.
- Docs: `docs/reference/brand-json.md`, tools reference.
