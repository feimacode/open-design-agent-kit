## ADDED Requirements

### Requirement: Motion Tokens From Observed Animations

Before disabling animations for measuring, the extraction SHALL record the animations that actually run on the first page during load, hover and focus of the primary control and the first card, and scrolling. It SHALL draft `--motion-fast` from hover and focus durations, `--motion-base` from other observed state changes and `--ease-standard` from the most common observed easing. It SHALL use declared transitions only when no animation was observed, and the token's source SHALL say which was used.

#### Scenario: Blanket transition, nothing moves
- **WHEN** every element declares `transition: all 150ms` but only the primary button animates on hover, over 200ms with `ease-out`
- **THEN** `--motion-fast` is `200ms`, `--ease-standard` is `ease-out`, and the source says observed

#### Scenario: Script-driven motion
- **WHEN** cards are animated by a JavaScript library with no CSS transitions declared
- **THEN** their observed duration and easing are used
