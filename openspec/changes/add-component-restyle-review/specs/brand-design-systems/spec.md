## ADDED Requirements

### Requirement: Component Replicas In The Review

When a design system was created from an extraction with component specs, its review page SHALL show each captured component's crop beside a replica. The replica SHALL use the component's measured size and label, with every measured property set to the nearest token in the design system's `tokens.css`. A property with no matching token family SHALL use the contract's neutral default and be marked unmapped.

#### Scenario: Replica follows tokens
- **WHEN** the user changes `--radius-sm` in `tokens.css`
- **THEN** the button replicas in `review.html` show the new radius

### Requirement: Component Fidelity Findings

Checking the review page SHALL compute each replica's pixel fidelity against the site's crop. For each component it SHALL report which token family loses the most, by restoring one family at a time to the measured value. A `brand-fidelity` finding SHALL be raised for every component under 90%, naming the family, the site's value and the token value. Unmapped properties SHALL be reported as notes.

#### Scenario: Padding between steps
- **WHEN** the site's primary button pads `14px 28px` and the nearest spacing tokens are `12px` and `24px`
- **THEN** the finding names spacing as the button's main loss, with both values

#### Scenario: Exact tokens
- **WHEN** every measured property of the card equals a token
- **THEN** the card's fidelity is at least 98% and no finding is raised for it
