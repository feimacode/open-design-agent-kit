# portfolio-interview-deck Specification

## Purpose
Build the deck a designer presents in a portfolio interview, timed for a 30, 45 or 60 minute slot, with presenter notes and backup slides.
## Requirements
### Requirement: Interview Deck

The `portfolio-interview-deck` recipe SHALL build a deck from one or two library projects for a chosen length of 30, 45 or 60 minutes. It SHALL have an intro, current role, for each project its context, problem, artifacts including rejected options, collaboration and impact, a close, and backup slides for likely questions.

#### Scenario: Two projects, 45 minutes
- **WHEN** the designer picks two projects and 45 minutes
- **THEN** the deck covers both projects and ends with backup slides

### Requirement: Notes and Timing

Every non-backup slide SHALL have presenter notes and a minute budget in `data-od-minutes`. Backup slides SHALL be marked `data-od-backup`. The deck SHALL export as editable PowerPoint and as PDF.

#### Scenario: Rehearsal
- **WHEN** the designer opens the deck in presenter mode
- **THEN** each slide shows its notes and minute budget
