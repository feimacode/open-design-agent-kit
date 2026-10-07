## ADDED Requirements

### Requirement: Campaign Flow
Every host SHALL provide an `open-design-campaign` prompt or skill that walks the agent through: agreeing a copy deck with the user and saving it as a CSV in the campaign folder (with an optional `locale` column); building one fluid master whose changing text uses `data-od-field`; choosing channels; checking every chosen shape with a shape sheet and tuning weak shapes with `adapt_open_design_artifact`; building any landing page or email piece; and exporting with `presets` and `data`.

#### Scenario: Two-locale launch
- **WHEN** the user asks for a launch campaign in English and German for Instagram, LinkedIn and display ads
- **THEN** the flow SHALL produce one CSV with `en` and `de` rows, one fluid master, and exports named per locale and format

### Requirement: Campaign Collection and Sheet
Campaign pieces SHALL be registered into one collection with `screenRole` set to their channel, and the flow SHALL finish by writing `exports/campaign-sheet.png`: every exported shape plus the first screen of each page-type piece, labelled, with a red dot on any piece that has preflight errors.

#### Scenario: Sheet shows a failing banner
- **WHEN** the `banner-mobile` export has an `overflow` error
- **THEN** its tile on the campaign sheet SHALL carry the error dot

### Requirement: Fit Bound Text
An element with `data-od-fit` and bound text SHALL have its font size reduced in 5% steps, down to 70% of its authored size, until its text no longer overflows, before preflight runs. Each element that was shrunk SHALL be reported as an `info` finding with the final percentage; text that still overflows at 70% SHALL be reported as `overflow`, as before.

#### Scenario: Long German headline
- **WHEN** the `de` row's headline overflows at 100% and fits at 85%
- **THEN** the export SHALL render it at 85% and report an info finding naming the element and 85%
