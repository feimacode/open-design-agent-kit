## ADDED Requirements

### Requirement: Style Vector

Every bundled and user design system SHALL have a versioned style vector of measured features read from its `tokens.css`, covering colour, type, space, shape and motion, each normalised over the bundled set. A feature whose token is missing SHALL be null. A distance between two vectors SHALL be the mean absolute difference over the features both have, and SHALL be reported with that count. Vectors of different versions SHALL NOT be compared.

#### Scenario: Missing token
- **WHEN** a system has no `--motion-base`
- **THEN** its motion feature is null and distances to it skip that feature

### Requirement: Recommend Like A System

`recommend_open_design_design_systems` SHALL accept `like`, either a design system id or an extraction's `bundleDir`, and SHALL rank systems by style-vector distance to it, combined with the brief's other signals. The system named in `like` SHALL NOT be recommended to itself.

#### Scenario: Like an extracted reference site
- **WHEN** `like` is the bundle of an extraction of a reference site
- **THEN** the closest bundled systems are returned, each with its distance and the axes where it differs
