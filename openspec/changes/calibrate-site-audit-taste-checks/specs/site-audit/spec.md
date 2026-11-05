## ADDED Requirements

### Requirement: Taste Findings Calibrated On Hand-Made Sites

The repository SHALL keep a calibration set of hand-made sites and pages built from AI defaults, and a run that reports each taste rule's false-alarm rate on the hand-made set and its hit rate on the AI-default set. On a live site, the audit SHALL report a taste rule as a problem only when that rule's latest false-alarm rate is 5% or less, and SHALL otherwise report it as a note. The audit report SHALL name the calibration date.

#### Scenario: Rule over the bar
- **WHEN** `slop-glow` fired on 4 of 40 hand-made sites in the latest calibration
- **THEN** an audit that finds it reports it as a note that the pattern is common on hand-made sites too, not as one of the top problems

#### Scenario: Rule under the bar
- **WHEN** `uniform-surface` fired on 1 of 40 hand-made sites
- **THEN** the audit may report it as a problem

### Requirement: Template Look Needs Several Tells

The audit SHALL describe a page as looking like a template only when at least two different taste findings were raised on that page. A single taste finding SHALL be titled by what was measured.

#### Scenario: One tell
- **WHEN** a page has only a `slop-glow` finding
- **THEN** the report titles it by the indigo glows and gradients it found and does not call the page a template look
