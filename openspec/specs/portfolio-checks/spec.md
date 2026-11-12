# portfolio-checks Specification

## Purpose
Check portfolio designs for what a reviewer notices first: the first screen, case-study length and summary, alt text, page weight, live links, internal work and deck timing.
## Requirements
### Requirement: Portfolio Check Group

`check_open_design_artifact` SHALL run a `portfolio` check group on designs registered with portfolio brief inputs, and only on those.

#### Scenario: Ordinary landing page
- **WHEN** a landing page made without portfolio inputs is checked
- **THEN** no portfolio findings are reported

### Requirement: First Screen

The home page's first screen at 390 x 844 and at desktop size SHALL show the designer's name, role, a contact link and the top of the first project card.

#### Scenario: Contact below the fold on phones
- **WHEN** the contact link is only reachable after scrolling on a phone
- **THEN** the check reports a first-screen finding at phone size

### Requirement: Case Study and Image Checks

The check SHALL report a case study whose body is outside the recipe's length range or that lacks a summary with role and outcome, images without confirmed alt text, pages over the weight budget, live product links that don't resolve (local server only), and any `internal` project or asset in the site.

#### Scenario: Internal asset
- **WHEN** a case study page shows an asset marked `internal`
- **THEN** the check reports an error naming the asset

### Requirement: Deck Timing

For interview decks, the check SHALL add up the minute budgets of non-backup slides and report a finding when the sum is more than 10% away from the chosen length.

#### Scenario: Too long
- **WHEN** a 45-minute deck's budgets add up to 58 minutes
- **THEN** the check reports that the talk runs 13 minutes over
