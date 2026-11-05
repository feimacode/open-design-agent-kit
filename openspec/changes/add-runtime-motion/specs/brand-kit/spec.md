## ADDED Requirements

### Requirement: Motion In The Brand Kit

The brand kit SHALL include a `motion` entry with: what changes on hover and focus of the primary control and cards (properties, values and duration); how content enters on scroll (fade, rise, scale or none, with distance, duration and stagger between siblings); whether the hero animates on load; the motion library when detected; and whether the page honours `prefers-reduced-motion`. A trigger with no observed animation SHALL be recorded as none. The DESIGN.md template SHALL describe motion from this entry.

#### Scenario: Staggered reveal
- **WHEN** three cards fade up 24px over 600ms, starting 80ms apart, as they scroll into view
- **THEN** `motion.entrance` records rise, 24px, 600ms and an 80ms stagger

#### Scenario: Reduced motion honoured
- **WHEN** the load animation does not run with `prefers-reduced-motion: reduce` emulated
- **THEN** `motion.reducedMotion` is true
