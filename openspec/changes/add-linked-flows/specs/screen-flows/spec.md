## ADDED Requirements

### Requirement: Flow Plan

`prepare_open_design_brief` SHALL accept an optional `flow` with at most 20 screens (id, title, role), at most 80 links (from screen, trigger label, to screen) and a shared navigation; the instructions for each screen SHALL include the plan and that screen's outgoing links, and `register_open_design_artifact` SHALL store the plan and the screen's id as `metadata.flow` on the screen's manifest.

#### Scenario: Four-screen flow
- **WHEN** the agent prepares the second screen of a four-screen onboarding flow with a plan
- **THEN** the instructions list all four screens and the second screen's links, and its manifest records the plan after registration

#### Scenario: Plan too large
- **WHEN** a plan has 21 screens
- **THEN** the tool returns an error naming the limit and prepares no brief

### Requirement: Links and Shared Navigation

Screens in a planned flow SHALL link with `href` to the target screen's entry path and `data-od-goto` set to its id, and the shared navigation SHALL be written once to `_shared/nav.html` in the collection and included by each screen with `data-od-include`, resolved in preview, check and export.

#### Scenario: Shared tab bar
- **WHEN** three screens include the shared tab bar
- **THEN** each renders the same items, with only the active item differing

### Requirement: Flow Map

The kit SHALL generate a `flow.html` for a collection showing each screen as a thumbnail and each link as an arrow, from the plan and from links found in the screens, and SHALL mark planned links that were not found.

#### Scenario: Missing link on the map
- **WHEN** the plan links "Continue" on the welcome screen to the goals screen and the welcome screen has no such link
- **THEN** the map draws that arrow as missing

### Requirement: Clickable Prototype

Preview SHALL follow links between screens of a collection in VS Code, the browser preview and the MCP App; exporting a collection as HTML SHALL produce one self-contained file where links switch screens, and publishing a collection SHALL publish every screen and the map so links work at the published URL.

#### Scenario: Clicking through in the MCP App
- **WHEN** the user clicks "Continue" on the welcome screen in the MCP App preview
- **THEN** the preview shows the goals screen

#### Scenario: Publishing a flow
- **WHEN** the user publishes one screen of a three-screen flow to a static host
- **THEN** the site holds all three screens with the shared navigation filled in and the flow map as its index, and every link between screens works at the published URL; published as a Claude artifact, it is the one-file prototype

#### Scenario: One-file prototype
- **WHEN** the user exports a five-screen collection as a single HTML file
- **THEN** the file opens offline and its links move between all five screens

### Requirement: Flow Findings

Checking a collection SHALL report `flow-broken-link` for a link to a missing screen or file, `flow-dead-end` for a screen with no way forward or back that is not marked as an end, `flow-unfilled` for a planned screen that is missing or empty, `flow-nav-drift` for a screen whose navigation differs from the shared one, and `flow-unlinked` for a planned link not found in its screen.

#### Scenario: Unfilled screen
- **WHEN** a plan has a "Saved" screen and no artifact for it was registered
- **THEN** the collection check reports `flow-unfilled` for "Saved"

#### Scenario: Drifted tab label
- **WHEN** one screen inlines its own tab bar labelled "Your Library" where the shared nav says "Library"
- **THEN** the check reports `flow-nav-drift` on that screen
