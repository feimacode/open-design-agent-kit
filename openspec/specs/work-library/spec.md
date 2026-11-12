# work-library Specification

## Purpose
Keep a designer's projects, facts, outcomes and imported work in one library with privacy levels, so every portfolio output is built from facts entered once.
## Requirements
### Requirement: Library Files

The kit SHALL keep a work library under `portfolio/` in the designs folder: `library.json` with the owner and the project list, and one `projects/<slug>/project.json` with an `assets/` folder per project. A project SHALL record its title, role and privacy level, and MAY record company or client, team, dates, platforms, problem, constraints, decisions, outcomes, links and tags. No design SHALL be registered inside `portfolio/`.

#### Scenario: New project
- **WHEN** the agent saves a project with a title, role and privacy level only
- **THEN** the project is stored and the tool returns the fields still missing

#### Scenario: Design inside the library
- **WHEN** the agent registers a design whose entry path is under `portfolio/`
- **THEN** registration is refused with a message naming the reserved folder

### Requirement: Privacy Levels

Every project and asset SHALL have a privacy level of `public`, `unlisted` or `internal`. An asset's level SHALL be the same as or stricter than its project's. Assets MAY carry redaction boxes, which SHALL be applied as a blur wherever the asset is rendered or exported, leaving the stored original unchanged.

#### Scenario: Looser asset
- **WHEN** an asset is saved as `public` in an `internal` project
- **THEN** the save is refused and says the asset can't be looser than its project

#### Scenario: Redacted screen
- **WHEN** an asset has a redaction box over a customer's name
- **THEN** every output that shows the asset shows that area blurred

### Requirement: Import Work

`import_open_design_work` SHALL add assets to a project from workspace files, Figma frames, live URLs and kit designs. It SHALL strip EXIF and location data, keep one original, write WebP variants at 800, 1400 and 2800 px wide (no wider than the original), and draft alt text that stays marked as a draft until the designer confirms it.

#### Scenario: Live product
- **WHEN** the agent imports a live URL
- **THEN** the project gets a desktop and a phone capture with their variants and alt text drafts

#### Scenario: Photo with location
- **WHEN** a JPEG with GPS data is imported
- **THEN** no stored file contains the GPS data

#### Scenario: Small image
- **WHEN** an imported image is 1200 px wide
- **THEN** the tool imports it and warns that it is under 1600 px, the Dribbble minimum

### Requirement: No Invented Facts

Briefs that use the library SHALL tell the agent to ask for missing facts and never to invent outcomes, metrics, team members, clients or dates. Outputs SHALL show measured outcomes as written, estimated outcomes with "about", and qualitative outcomes without a number.

#### Scenario: Missing outcome
- **WHEN** a case study is briefed for a project with no outcomes
- **THEN** the brief tells the agent to ask the designer for the outcome before writing that section

### Requirement: Library Style

The library MAY name a design system as its style, and portfolio briefs SHALL use it when no other style is chosen. The portfolio recipes SHALL offer to build that style from the designer's own site, Figma or Canva files, or screenshots of their work.

#### Scenario: Style from current site
- **WHEN** the designer gives their current portfolio URL and asks for a fresh look in their own style
- **THEN** the agent extracts a design system from that URL and saves it as the library's style
