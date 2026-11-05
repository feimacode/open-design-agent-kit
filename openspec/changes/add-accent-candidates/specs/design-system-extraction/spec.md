## ADDED Requirements

### Requirement: Accent Ranked By Evidence

The extraction SHALL choose `--accent` by ranking colours, not single buttons. A colour's score SHALL combine: the area and fold position of its largest filled control; the number of controls and links that use it; its OKLCH chroma; a vote when a declared custom property named for brand, primary or accent has that value; and a vote when it matches the logo's dominant non-neutral colour. A colour SHALL be eligible only when at least one filled control or one such declaration backs it.

#### Scenario: Dark sign-in button
- **WHEN** the largest button above the fold is a near-black "Sign in", and three green buttons and the declared `--brand` are `#3ecf8e`
- **THEN** `--accent` is `#3ecf8e`

#### Scenario: Near-black is not colourful
- **WHEN** a button is `#002533`
- **THEN** its chroma counts as near zero in the ranking

### Requirement: Accent Confidence And Candidates

The draft's source for `--accent` SHALL include a `choiceConfidence` between 0 and 1 (named so as not to clash with the existing `confidence` level of a source) and up to four `candidates`, each with its colour, score, chroma, control count, any declaring property name and a crop. The design-system skill SHALL ask the user to choose among the candidates when confidence is below 0.5.

#### Scenario: Close call
- **WHEN** the top two colours score within 10% of each other
- **THEN** `choiceConfidence` is below 0.5, and the agent shows both colours with their crops and asks which is the brand's

#### Scenario: Clear winner
- **WHEN** one colour backs every filled control and the declared `--primary`
- **THEN** `choiceConfidence` is above 0.8 and the agent does not ask
