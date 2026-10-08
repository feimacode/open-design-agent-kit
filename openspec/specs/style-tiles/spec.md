# style-tiles Specification

## Purpose
Color and type pairings explored as compact style tiles built on the design-token contract: a style-tile skill, tile-mode explorations that diverge on purpose, a token completeness check, a lossless save of the chosen tile as a design system, and evolving the active system through custom directions.
## Requirements

### Requirement: Style Tile Skill
The catalog SHALL include a local `style-tile` skill (`od:design-system:style-tile`) producing one compact artifact with palette swatches (token role, hex value, and the contrast ratio of each text-on-background pair), a type specimen (display and body faces, a scale from h1 to caption, a paragraph in context), core components (primary and secondary button, input, card, tag) and a radius, spacing and shadow sample. Its `:root` SHALL declare every required identity and structure token of the design-token contract, and the tile SHALL be styled only through those tokens.

#### Scenario: Tile declares the contract
- **WHEN** a style tile is generated
- **THEN** its `:root` SHALL declare `--bg`, `--surface`, `--fg`, `--muted`, `--border`, `--accent`, `--font-display`, `--font-body` and every other required (A1 identity and structure) token of the contract

### Requirement: Token Completeness Check
`check_open_design_artifact` on an artifact made from the style-tile skill SHALL report `token-missing` as an error for each required contract token not declared on `:root`.

#### Scenario: Missing display font
- **WHEN** a tile omits `--font-display`
- **THEN** the check SHALL report `token-missing` naming `--font-display`

### Requirement: Tile-Mode Explorations
`prepare_open_design_exploration` with the style-tile skill SHALL default to the `visual` axis and 4 directions, SHALL accept 2–6 directions (the visual library has five, so six needs custom directions), SHALL require each direction to differ from the others in at least two of accent hue family, neutral temperature, display face classification and radius scale, and the contact sheet SHALL show the tiles side by side.

#### Scenario: Four pairings
- **WHEN** the user asks "show me some color and type options for a fintech brand"
- **THEN** the agent SHALL prepare a style-tile exploration with 4 directions and show their contact sheet

### Requirement: Lossless Save From a Tile
`choose_open_design_direction` with `next: "save-design-system"` on a style-tile direction SHALL extract the tile's `:root` declarations, validate them against the token contract, return them as the exact `tokens.css` content to write, and list any missing required tokens.

#### Scenario: Save the chosen tile
- **WHEN** the user picks tile B and asks to use it as the design system
- **THEN** the returned instructions SHALL contain tile B's token values verbatim as the `tokens.css` body, and the saved system SHALL become active after registration

### Requirement: Evolve the Active Design System
With an active design system, a style-tile exploration on the `custom` axis SHALL start every direction from the active system's tokens, vary only what the user asked for, and mark on each tile which tokens differ from the active system.

#### Scenario: Warmer accent
- **WHEN** the active system is Stripe-like and the user asks for "the same but with a warmer accent"
- **THEN** each tile SHALL keep the active system's other tokens and mark only its changed accent tokens
