## ADDED Requirements

### Requirement: Exploration Preparation With Assigned Directions
The system SHALL expose `prepare_open_design_exploration` (MCP tool and VS Code `languageModelTool`) taking `skillId`, `brief`, and optional `count` (integer 2–4, default 3), `axis` (`visual` · `structure` · `custom`), `directionIds`, `customDirections` (array of `{ label, brief }`), and `designSystemId`. It SHALL resolve every direction before returning and SHALL return an `explorationId`, a `sharedInstructions` block (skill, design system, craft rules and brief, given once to save tokens), and one entry per direction containing `directionId`, `label`, direction-specific `instructions` and `suggestedEntryPath` (`<outputDir>/<explorationId>/<directionId>.html`). Following `sharedInstructions` and then a direction's `instructions` SHALL be sufficient to generate that direction. It SHALL NOT write any design file.

#### Scenario: Default visual exploration with no active design system
- **WHEN** the tool is invoked with a valid `skillId` and `brief`, no `axis`, and no active design system
- **THEN** it SHALL return 3 directions using the visual axis, assigned in the fixed order `modern-minimal`, `human-approachable`, `tech-utility` (the full default order continues with `editorial-monocle`, `brutalist-experimental`, which upstream reserves for editorial and art briefs)

#### Scenario: Default structural exploration with an active design system
- **WHEN** the tool is invoked with no `axis` while a design system is active
- **THEN** it SHALL use the structural axis, and the shared instructions SHALL include the active design system's body

#### Scenario: Explicit visual axis overrides an active design system
- **WHEN** `axis` is `visual` while a design system is active
- **THEN** the shared instructions SHALL NOT include the design system body, and the result SHALL state that the design system was set aside for this exploration

#### Scenario: Agent-selected schools
- **WHEN** `directionIds` lists known ids from the axis's library (visual schools, or page or deck structures)
- **THEN** exactly those directions SHALL be assigned, in the given order, and the count SHALL equal their number

#### Scenario: Custom axis
- **WHEN** `axis` is `custom` and `customDirections` has 2–4 entries with distinct labels
- **THEN** one direction per entry SHALL be returned, using its label and brief

#### Scenario: Invalid input
- **WHEN** `count` is outside 2–4, a `directionIds` entry is unknown, `customDirections` labels repeat, or `axis` is `custom` without `customDirections`
- **THEN** the tool SHALL return an error that names the problem and lists valid values, and SHALL NOT write a plan

### Requirement: Divergence and Sketch Fidelity in Direction Instructions
Together, the shared and direction-specific instructions SHALL contain the composed skill and craft instructions, the assigned direction's full specification (for visual directions: fonts, palette and posture to bind to `:root`), the labels of every sibling direction with an explicit instruction not to resemble them, and a sketch-fidelity section appropriate to the skill's mode. For pages, sketch fidelity is one screen (above the fold plus one key section). For decks, it is a cover plus two content slides. For other modes, it is one representative view.

#### Scenario: Sibling awareness
- **WHEN** a 3-direction exploration is prepared
- **THEN** each direction's instructions SHALL name the other two directions' labels as directions to differ from

#### Scenario: Deck mode uses narrative structures
- **WHEN** the axis is `structure` and the skill's mode is `deck`
- **THEN** the assigned directions SHALL come from the deck narrative-arc library, not the page-posture library

### Requirement: Exploration Plan File
`prepare_open_design_exploration` SHALL write `<outputDir>/<explorationId>/exploration.json`, recording the exploration id, title, brief, skill id, axis, design system id (if used), each direction's id, label, spec and entry path, and (after choosing) the chosen direction. `explorationId` SHALL be a slug derived from the brief, made unique with a numeric suffix if its directory already exists.

#### Scenario: Plan written on prepare
- **WHEN** an exploration is prepared successfully
- **THEN** `exploration.json` SHALL exist and list every returned direction in order

#### Scenario: Id collision
- **WHEN** `<outputDir>/<slug>/` already exists
- **THEN** the new exploration SHALL use `<slug>-2` (or the next free suffix)

### Requirement: Exploration-Aware Registration
`register_open_design_artifact` SHALL accept optional `explorationId` and `directionId` and persist them in the manifest as bounded-length optional strings. When both are present and the plan file exists, it SHALL regenerate the exploration's `compare.html` after writing the manifest. A failed refresh SHALL be reported in the result and SHALL NOT fail the registration. Registration without these fields SHALL behave exactly as before.

#### Scenario: Registering a direction refreshes the comparison page
- **WHEN** a direction is registered with a valid `explorationId` and `directionId`
- **THEN** the manifest SHALL contain both fields and `compare.html` SHALL show that direction as generated

#### Scenario: Unknown exploration
- **WHEN** `explorationId` doesn't match any plan file
- **THEN** the manifest SHALL still be written, and the result SHALL warn that no comparison page was updated

### Requirement: Static Comparison Page
The system SHALL generate `<outputDir>/<explorationId>/compare.html` as a self-contained page with no scripts and no network requests, using only relative paths. It SHALL show one card per planned direction with its label, axis or school, a short spec summary, and either a live iframe of the entry file (if registered) or a "not generated yet" placeholder. Each card SHALL also link directly to the entry file, and the chosen direction SHALL carry a visible "chosen" marker. The page SHALL NOT be registered as an artifact and SHALL NOT appear in the gallery, collections, or export tools.

#### Scenario: Partial exploration
- **WHEN** only 2 of 3 directions are registered
- **THEN** `compare.html` SHALL show two iframes and one placeholder

#### Scenario: Opened from the file system
- **WHEN** `compare.html` is opened via `file://` in a desktop browser
- **THEN** the registered directions SHALL render in their cards without a server

### Requirement: Exploration Comparison and Contact Sheet
The system SHALL expose `compare_open_design_exploration` taking `explorationId` and optional `contactSheet` (boolean). It SHALL return the registered and missing direction ids and the `compare.html` path. When `contactSheet` is true, it SHALL render `compare.html` with the installed browser into `<outputDir>/<explorationId>/exports/contact-sheet.png` and return that path. If no browser is available, it SHALL return the other fields plus an explanation, not an error.

#### Scenario: Contact sheet rendered
- **WHEN** invoked with `contactSheet: true`, all directions registered, and a browser installed
- **THEN** a PNG SHALL be written under the exploration's `exports/` folder and its path returned

#### Scenario: No browser
- **WHEN** invoked with `contactSheet: true` and no browser can be found
- **THEN** the result SHALL include the `compare.html` path and a note that the contact sheet was skipped

### Requirement: Choosing a Direction
The system SHALL expose `choose_open_design_direction` taking `explorationId`, `directionId`, `next` (`build-out` · `merge` · `save-design-system`), and optional `notes` and `mergeFrom` (array of `{ directionId, aspect }`). It SHALL record the choice in the plan file, refresh `compare.html`, and return instructions without writing any design file.
- `build-out` SHALL return full-fidelity instructions for the same skill, with the chosen direction locked and its sketch named as the starting point, and `suggestedEntryPath` `<outputDir>/<explorationId>/<directionId>-full.html`.
- `merge` SHALL require `mergeFrom` naming other, registered directions with non-empty aspects, and return the same full-fidelity instructions plus every source file and aspect to take, with `suggestedEntryPath` `<outputDir>/<explorationId>/merged.html`.
- For `build-out` and `merge`, the instructions SHALL say to register the result with `explorationId` but without `directionId`, and the comparison page SHALL list such artifacts as built from the exploration.
- `save-design-system` SHALL return the custom-design-system instructions, seeded with the direction's spec and its sketch file as token evidence.

#### Scenario: Build out the chosen sketch
- **WHEN** `next` is `build-out` for a registered direction
- **THEN** the plan SHALL record it as chosen, `compare.html` SHALL mark it, and the instructions SHALL reference the sketch's path and the direction's spec

#### Scenario: Merge without sources
- **WHEN** `next` is `merge` and `mergeFrom` is missing or names an unknown direction
- **THEN** the tool SHALL return an error and SHALL NOT change the plan

#### Scenario: Unregistered direction
- **WHEN** the chosen `directionId` is planned but not yet registered
- **THEN** the tool SHALL return an error asking for the direction to be generated and registered first

### Requirement: Curated Explore Command and Agent Guidance
The system SHALL ship a host-agnostic `open-design-explore` prompt in the local content overlay, rendered as a VS Code prompt file, an MCP prompt, and Claude Code and Codex skills. It walks the agent through prepare → write and register each direction → compare with a contact sheet → present → choose. The overview skill and the VS Code chat instructions SHALL tell the agent to start an exploration only when the user explicitly asks for options, directions, alternatives or several versions, and to inspect the contact sheet (when it can read images) before presenting it. A local prompt's `model_trigger` frontmatter SHALL be what the generated Claude Code and Codex skill descriptions append, so each prompt's skill triggers on its own kind of request and no other.

#### Scenario: Explicit request
- **WHEN** a user asks "show me three directions for a pricing page"
- **THEN** the guidance SHALL lead the agent to `prepare_open_design_exploration` rather than `prepare_open_design_brief`

#### Scenario: Ordinary request
- **WHEN** a user asks "design a pricing page"
- **THEN** the guidance SHALL lead the agent to the single-artifact flow

### Requirement: Direction Navigation in the VS Code Preview
In VS Code, the artifact preview for a registered direction SHALL show "Direction N of M — <exploration title>" with previous and next controls that follow the plan's direction order and skip unregistered directions. Collection navigation SHALL keep working unchanged.

#### Scenario: Navigating directions
- **WHEN** the preview of direction 1 of a 3-direction exploration is open and all three are registered
- **THEN** the "next" control SHALL open direction 2's preview

### Requirement: Vendored Direction Library Provenance
The visual direction library SHALL be vendored from upstream's `apps/daemon/src/prompts/directions.ts` and recorded in `vendored/SOURCE.md` with the upstream commit, the Apache-2.0 licence, and its MIT `huashu-design` lineage. Any change from the upstream file (for example, dropping the question-form renderer helpers) SHALL be listed in that record. Vendored code is tracked by hand in `SOURCE.md`, not by the content drift check.

#### Scenario: Provenance recorded
- **WHEN** the library is vendored
- **THEN** `vendored/SOURCE.md` SHALL name the upstream path, commit, licence, lineage and every deviation
