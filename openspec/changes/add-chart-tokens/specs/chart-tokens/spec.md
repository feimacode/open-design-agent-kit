## ADDED Requirements

### Requirement: Derived Chart Vocabulary

Resolving a design system's tokens SHALL append `--chart-1` to `--chart-6`, `--chart-seq-1` to `--chart-seq-5`, `--chart-pos`, `--chart-neg`, `--chart-grid` and `--chart-axis`. `--chart-1` SHALL derive from `--accent`; `--chart-pos` and `--chart-neg` from `--success` and `--danger`; `--chart-grid` and `--chart-axis` from `--border-soft` and `--muted`. A name the system already declares SHALL keep its declared value. The vendored token files and schema SHALL NOT be changed.

#### Scenario: Bundled system with no chart tokens
- **WHEN** the tokens of a bundled system with no `--chart-*` names are resolved
- **THEN** the result SHALL include all 15 chart names, and its `tokens.css` SHALL be unchanged on disk

#### Scenario: System declares a series colour
- **WHEN** a system's `tokens.css` declares `--chart-2: #0a7`
- **THEN** the resolved `--chart-2` SHALL be `#0a7`

### Requirement: Readable And Distinct Series

Each derived categorical, positive and negative colour SHALL have at least 3:1 contrast against `--bg`, and adjacent categorical colours SHALL differ by at least a fixed OKLab distance. When a system has dark values, the vocabulary SHALL be derived for light and dark separately, each against its own background.

#### Scenario: Pale accent
- **WHEN** a system's accent has 2:1 contrast on its background
- **THEN** the derived `--chart-1` SHALL be the accent's hue with lightness adjusted to reach 3:1

#### Scenario: Every bundled system
- **WHEN** the chart vocabulary is derived for all bundled systems
- **THEN** every derived series colour SHALL meet 3:1 on `--bg` and the adjacent-distance rule

### Requirement: Chart Colours In The Brief

When the chosen skill draws charts, `prepare_open_design_brief` SHALL include a Chart colours section listing the vocabulary with its values and the rules: use series colours in order, use `--chart-pos` and `--chart-neg` only for change, and never show meaning by colour alone. Briefs for skills without charts SHALL NOT include it.

#### Scenario: Poster brief
- **WHEN** a brief is prepared for a poster skill
- **THEN** it SHALL contain no Chart colours section

### Requirement: Chart Colours Travel

`export_open_design_design_system`, the Claude Design build of each system and the design-system preview page SHALL include the chart vocabulary.

#### Scenario: Export a custom system
- **WHEN** a custom system is exported
- **THEN** the exported tokens SHALL contain the derived chart names and values
