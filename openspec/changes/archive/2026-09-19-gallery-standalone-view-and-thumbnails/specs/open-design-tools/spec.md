## MODIFIED Requirements

### Requirement: Native Tree and Grid Browsing of Remixable Examples
The system SHALL provide a tree view, in its own standalone activity-bar container (not nested inside another view container), listing remixable examples grouped by category, and a grid view (a searchable, filterable card layout with a live thumbnail per card) as an alternative visual browsing surface, alongside the existing QuickPick command and chat tool. All entry points SHALL use identical remix behavior (the same underlying copy-and-register logic). Grid thumbnails SHALL be fetched lazily (only once a card is visible) and delivered as in-memory content rather than through a resource-URL fetch.

#### Scenario: Tree view groups examples by category
- **WHEN** the OpenDesign Gallery tree view is expanded
- **THEN** its top-level nodes SHALL be categories, and expanding a category SHALL list the remixable examples within it

#### Scenario: The tree view is reachable from its own activity-bar icon
- **WHEN** the extension is installed
- **THEN** a dedicated activity-bar icon SHALL open the Gallery tree view, without requiring the Explorer view to be open first

#### Scenario: Remixing from the tree view
- **WHEN** a user clicks an example in the tree view, or invokes Remix from its context menu
- **THEN** that example SHALL be remixed using the same logic as the QuickPick command and chat tool, and its preview SHALL open

#### Scenario: Grid view supports search and category filtering
- **WHEN** a user types in the grid view's search box or selects a category filter chip
- **THEN** only matching example cards SHALL remain visible

#### Scenario: Remixing from the grid view
- **WHEN** a user selects Remix on a card in the grid view
- **THEN** that example SHALL be remixed using the same logic as the other entry points, and its preview SHALL open

#### Scenario: Grid thumbnails load lazily and in-memory
- **WHEN** a card in the grid view scrolls into view for the first time
- **THEN** the system SHALL fetch that example's rendered content and display it as a live thumbnail, without fetching content for cards not yet visible, and without loading the thumbnail content through a resource-URL request
