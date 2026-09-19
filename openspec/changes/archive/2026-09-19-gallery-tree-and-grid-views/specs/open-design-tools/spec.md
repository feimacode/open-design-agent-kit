## ADDED Requirements

### Requirement: Native Tree and Grid Browsing of Remixable Examples
The system SHALL provide a tree view (in the Explorer sidebar) listing remixable examples grouped by category, and a grid view (a searchable, filterable card layout) as an alternative visual browsing surface, alongside the existing QuickPick command and chat tool. All entry points SHALL use identical remix behavior (the same underlying copy-and-register logic).

#### Scenario: Tree view groups examples by category
- **WHEN** the OpenDesign Gallery tree view is expanded
- **THEN** its top-level nodes SHALL be categories, and expanding a category SHALL list the remixable examples within it

#### Scenario: Remixing from the tree view
- **WHEN** a user clicks an example in the tree view, or invokes Remix from its context menu
- **THEN** that example SHALL be remixed using the same logic as the QuickPick command and chat tool, and its preview SHALL open

#### Scenario: Grid view supports search and category filtering
- **WHEN** a user types in the grid view's search box or selects a category filter chip
- **THEN** only matching example cards SHALL remain visible

#### Scenario: Remixing from the grid view
- **WHEN** a user selects Remix on a card in the grid view
- **THEN** that example SHALL be remixed using the same logic as the other entry points, and its preview SHALL open
