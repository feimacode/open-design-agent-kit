## ADDED Requirements

### Requirement: Unmeasured Tokens Are Not Estimated

Instructions for writing a design system from an extraction, on every route (local, hosted, sources, or a page the agent read itself), SHALL tell the agent to leave a token nobody measured to the token contract's fallback, and SHALL allow only values that were measured, derived from measured values, or stated by the user or a source. DESIGN.md SHALL include a "Not measured" line naming each fallback token and its default.

#### Scenario: Status colours absent from the site
- **WHEN** the draft lists `--success`, `--warning` and `--danger` as unmeasured
- **THEN** tokens.css leaves them out, and DESIGN.md names them under "Not measured" with the defaults they take

### Requirement: Invented Values Flagged In The Review

When a design system is saved with an extraction's evidence, the review's check SHALL report an info finding `brand-unmeasured` for each token the draft listed as unmeasured that tokens.css sets to a literal value. A value using `var()`, `color-mix()` or `calc()`, or one taken from a stated source, SHALL NOT raise it.

#### Scenario: Guessed radius
- **WHEN** the draft lists `--radius-lg` as unmeasured and tokens.css sets `--radius-lg: 24px`
- **THEN** the check reports `brand-unmeasured` naming `--radius-lg` and suggesting removing it or confirming it

#### Scenario: Derived hover
- **WHEN** `--accent-hover` is unmeasured and set to `color-mix(in oklch, var(--accent), black 12%)`
- **THEN** no finding is raised

### Requirement: Hosted Results Give Links

On the hosted server, the results of `create_open_design_design_system` and `export_open_design_design_system` SHALL carry no server file paths in their user-facing fields. They SHALL give the review and brand pages as viewer links and the Claude Design export as a download link, with a `next` line telling the agent to share links and never paths.

#### Scenario: Saved on the hosted server
- **WHEN** a design system is saved in a hosted project
- **THEN** the result has a review link the user can open, and no path starting with the server's data folder
