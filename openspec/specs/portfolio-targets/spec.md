# portfolio-targets Specification

## Purpose
Save tailored versions of a portfolio for one job, client, school or promotion, with their projects, order, limits and kind-specific sections.
## Requirements
### Requirement: Targets

The kit SHALL store each tailored version as a target under `portfolio/targets/` with a kind (`job`, `client`, `school`, `promotion`, `general`), a name, notes, picked projects in order, a privacy ceiling, wanted outputs, a cover note and limits. `save_open_design_portfolio_target` SHALL validate a target, fill default limits for its kind, and return a suggested project order with the words each project matched.

#### Scenario: Job ad pasted
- **WHEN** the designer pastes a job ad that mentions "design systems" and "B2B"
- **THEN** projects tagged with those words come first in the suggested order, with the matched words shown

### Requirement: Outputs Per Target

The portfolio recipes SHALL accept a target and produce its wanted outputs from its projects in its order: an unlisted site variant at its own path, a PDF within the size limit, the interview deck, and for schools an image set of titled files within the image limit and piece count.

#### Scenario: PDF over the limit
- **WHEN** a PDF is 14 MB at full quality and the limit is 10 MB
- **THEN** export lowers image quality until it is under 10 MB and keeps every page

#### Scenario: Limit can't be met
- **WHEN** the PDF is still over the limit at the lowest quality
- **THEN** export fails and names the heaviest pages

### Requirement: Kind-Specific Sections

A client target MAY add a "For you" section linking a redesign concept and before/after page of the client's site. A promotion target SHALL add a criteria map that lists every pasted criterion with the projects and outcomes that show it, and SHALL keep criteria without evidence visible and empty.

#### Scenario: Unmet criterion
- **WHEN** no project shows the criterion "leads cross-team initiatives"
- **THEN** the criteria map lists it with no evidence
