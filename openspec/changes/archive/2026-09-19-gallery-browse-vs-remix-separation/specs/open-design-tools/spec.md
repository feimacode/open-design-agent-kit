## MODIFIED Requirements

### Requirement: Native Tree and Grid Browsing of Remixable Examples
The system SHALL provide a tree view, in its own standalone activity-bar container (not nested inside another view container), listing remixable examples grouped by category, and a grid view (a searchable, filterable card layout with a live thumbnail per card) as an alternative visual browsing surface, alongside the existing QuickPick command and chat tool. In both the tree view and the grid view, browsing/viewing an example (a click) SHALL be strictly read-only — it SHALL NOT write anything to the workspace; remixing SHALL always require a separate, explicit action (an inline/context-menu Remix action in the tree, a dedicated Remix button in the grid and in the read-only preview panel). The QuickPick command SHALL retain its existing behavior of remixing immediately on selection. All remix actions, from any entry point, SHALL use identical underlying logic. Grid thumbnails SHALL be fetched lazily (only once a card is visible) and delivered as in-memory content rather than through a resource-URL fetch.

#### Scenario: Tree view groups examples by category
- **WHEN** the OpenDesign Gallery tree view is expanded
- **THEN** its top-level nodes SHALL be categories, and expanding a category SHALL list the remixable examples within it

#### Scenario: The tree view is reachable from its own activity-bar icon
- **WHEN** the extension is installed
- **THEN** a dedicated activity-bar icon SHALL open the Gallery tree view, without requiring the Explorer view to be open first

#### Scenario: Clicking a tree item previews without writing to the workspace
- **WHEN** a user clicks an example in the tree view
- **THEN** a read-only preview SHALL open, and no file SHALL be written to the workspace

#### Scenario: Remixing from the tree view requires the explicit Remix action
- **WHEN** a user invokes Remix from a tree item's inline action or context menu
- **THEN** that example SHALL be remixed using the same logic as the QuickPick command and chat tool, and its preview SHALL open

#### Scenario: Grid view supports search and category filtering
- **WHEN** a user types in the grid view's search box or selects a category filter chip
- **THEN** only matching example cards SHALL remain visible

#### Scenario: Clicking a grid card previews without writing to the workspace
- **WHEN** a user clicks a card in the grid view, other than its Remix button
- **THEN** a read-only preview SHALL open, and no file SHALL be written to the workspace

#### Scenario: Remixing from the grid view requires the explicit Remix button
- **WHEN** a user selects the Remix button on a card in the grid view
- **THEN** that example SHALL be remixed using the same logic as the other entry points, and its preview SHALL open

#### Scenario: The read-only preview panel offers an explicit remix action
- **WHEN** the read-only preview panel is open for an example
- **THEN** it SHALL offer a button that, when clicked, remixes that example; opening or viewing the panel itself SHALL NOT write to the workspace

#### Scenario: Grid thumbnails load lazily and in-memory
- **WHEN** a card in the grid view scrolls into view for the first time
- **THEN** the system SHALL fetch that example's rendered content and display it as a live thumbnail, without fetching content for cards not yet visible, and without loading the thumbnail content through a resource-URL request

#### Scenario: QuickPick selection still remixes directly
- **WHEN** a user selects an example from the `OpenDesign: Browse Gallery` QuickPick
- **THEN** that example SHALL be remixed immediately, without an intermediate preview step
