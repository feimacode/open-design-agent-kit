## ADDED Requirements

### Requirement: Design Systems Tree View
The system SHALL provide a Design Systems tree view in the Open Design activity-bar container. It SHALL list every design system returned by the content index (built-in and custom), grouped by category, with custom (`user:*`) design systems grouped under a "Custom" category shown first. The currently active design system SHALL be visibly marked, and custom design systems without a `tokens.css` SHALL be visibly marked as such. Clicking a design system item SHALL open its read-only preview and SHALL NOT change the active design system or write to the workspace.

#### Scenario: Design systems grouped by category
- **WHEN** the Design Systems tree view is expanded
- **THEN** its top-level nodes SHALL be categories, and expanding a category SHALL list the design systems in it sorted by name

#### Scenario: Custom design systems grouped first
- **WHEN** the workspace contains at least one custom design system
- **THEN** a "Custom" category SHALL appear as the first top-level node and contain those design systems

#### Scenario: Active design system is marked
- **WHEN** a design system is the active design system
- **THEN** its tree item SHALL show a distinct icon and an "active" description, and no other item SHALL

#### Scenario: Custom design system without tokens is marked
- **WHEN** a custom design system's folder contains `DESIGN.md` but no `tokens.css`
- **THEN** its tree item SHALL indicate that it has no tokens

#### Scenario: Clicking an item opens the preview without side effects
- **WHEN** a user clicks a design system in the tree view
- **THEN** the Design System Preview panel SHALL open for it, the active design system SHALL remain unchanged, and no file SHALL be written

### Requirement: Design Systems Tree View Actions and Refresh
Each design system item SHALL offer inline actions: Use in chat, Set as active (hidden when already active), and Preview. Custom design system items SHALL additionally offer Generate tokens.css. The view title SHALL offer Import design system and Refresh. The tree SHALL refresh without a reload when a custom design system's `DESIGN.md` or `tokens.css` is created, changed or deleted under the configured output directory, and when the active design system changes from any surface.

#### Scenario: Set as active from the tree
- **WHEN** a user invokes Set as active on a design system item
- **THEN** that design system SHALL become the active design system through the same mechanism the Browse Design Systems command uses, and the tree SHALL mark it active

#### Scenario: Use in chat from the tree
- **WHEN** a user invokes Use in chat on a design system item
- **THEN** Copilot Chat SHALL open with a prefilled, unsent, editable message naming that design system's id

#### Scenario: Newly imported design system appears
- **WHEN** a custom design system's `DESIGN.md` is written into the output directory's `design-systems` folder
- **THEN** the tree view SHALL show it without the user manually refreshing

#### Scenario: Tokens written later clear the marker
- **WHEN** a `tokens.css` is written into a custom design system's folder that previously had none
- **THEN** the tree view SHALL stop marking that design system as having no tokens, without a manual refresh

#### Scenario: Active design system changed elsewhere
- **WHEN** the active design system is changed via the status bar, the Browse Design Systems command, or the `set_active_design_system` tool
- **THEN** the tree view SHALL update its active marker

### Requirement: Design System Token Resolution
Previews SHALL be rendered from a single resolved token set per design system, computed with this per-token precedence:
1. the extension's local token override for that design system, if any
2. the design system's `tokens.css`
3. values derived from its `DESIGN.md`, for identity colours and fonts only
4. the token contract's default values
5. for tokens the contract defines as aliases, their sibling token's value

Built-in and custom design systems SHALL use the same resolution and rendering. A resolved set for a design system without a `tokens.css` SHALL be flagged as approximated.

#### Scenario: tokens.css wins over DESIGN.md
- **WHEN** a design system's `tokens.css` declares `--accent` and its `DESIGN.md` names a different primary colour
- **THEN** the resolved `--accent` SHALL be the `tokens.css` value

#### Scenario: Local override wins over tokens.css
- **WHEN** a built-in design system has a local token override declaring `--accent`
- **THEN** the resolved `--accent` SHALL be the override's value, and the vendored `tokens.css` SHALL be left unmodified

#### Scenario: Missing tokens are filled
- **WHEN** a `tokens.css` omits a token that has a contract default value
- **THEN** the resolved set SHALL contain that token with the contract default value

#### Scenario: No tokens.css is approximated
- **WHEN** a custom design system has only a `DESIGN.md`
- **THEN** its identity tokens SHALL be derived from `DESIGN.md` where possible, the remaining tokens SHALL be filled from contract defaults, and the result SHALL be flagged as approximated

### Requirement: Design System Preview Panel
The system SHALL provide a read-only Design System Preview webview panel for any design system. The panel SHALL show:
- a header with the design system's name, summary or category, and whether it is active
- two tabs, Visualize (default) and Showcase
- a collapsible side panel, open by default, that switches between the design system's `DESIGN.md` and its `tokens.css`; the `tokens.css` option is shown only when the file exists

Opening a preview for another design system SHALL reuse the same panel. The preview SHALL NOT write to the workspace, contact a daemon or MCP server, or make network requests. An open preview SHALL re-render when the previewed design system's `DESIGN.md` or `tokens.css` changes on disk.

#### Scenario: Opening a preview
- **WHEN** a user opens the preview for a design system
- **THEN** the panel SHALL show that design system's header, the Visualize tab selected, and its `DESIGN.md` in the side panel

#### Scenario: Viewing tokens source
- **WHEN** the user switches the side panel to tokens.css for a design system that has one
- **THEN** the panel SHALL show that design system's `tokens.css` text

#### Scenario: Switching design systems reuses the panel
- **WHEN** a preview panel is already open and the user previews a different design system
- **THEN** the existing panel SHALL be revealed and re-targeted to the new design system instead of opening a second panel

#### Scenario: Collapsing the side panel
- **WHEN** the user toggles the side panel closed
- **THEN** the tab content SHALL expand to fill the panel width, and toggling again SHALL restore the side panel

#### Scenario: Live update while tokens are written
- **WHEN** a preview is open for a custom design system and its `tokens.css` is created or changed
- **THEN** the preview SHALL re-render from the new tokens without the user reopening it

#### Scenario: Preview has no side effects
- **WHEN** a user opens a preview and switches between all tabs and side-panel views
- **THEN** no file SHALL be written to the workspace and the active design system SHALL remain unchanged

### Requirement: Visualize Tab
The Visualize tab SHALL render, from the resolved tokens and the `DESIGN.md`, an identity module (name, tagline or category, description), typography specimens for the display, body and mono families, a colour palette (swatch, value and role for each resolved colour token, plus any additional named colours in `DESIGN.md`), voice, imagery and layout guidance, and a component kit rendered from the resolved tokens with a Light/Dark toggle. Modules for which no data exists SHALL be omitted rather than shown empty.

#### Scenario: Palette from tokens
- **WHEN** a design system's resolved tokens include `--bg`, `--fg` and `--accent`
- **THEN** the palette SHALL show a swatch for each, with its value and role

#### Scenario: Missing module omitted
- **WHEN** a design system's `DESIGN.md` has no voice section
- **THEN** the Visualize tab SHALL NOT show a voice module or a placeholder for it

#### Scenario: Component kit dark mode
- **WHEN** the user switches the component kit's toggle to Dark
- **THEN** the kit SHALL re-render in its dark variant using the same accent token

#### Scenario: Built-in and custom rendered alike
- **WHEN** a custom design system has a `tokens.css` declaring the same tokens as a built-in design system
- **THEN** both SHALL produce the same component kit and palette output, apart from name, identity text and any content derived from their `DESIGN.md` files

### Requirement: Showcase Tab
The Showcase tab SHALL render a product page (navigation, hero, feature and pricing sections and similar) styled by the design system's resolved tokens, for built-in and custom design systems alike.

#### Scenario: Showcase uses resolved tokens
- **WHEN** the user opens the Showcase tab for a design system whose `tokens.css` declares `--accent`
- **THEN** the product page's accent colour SHALL be that resolved `--accent` value, not a colour guessed from `DESIGN.md` prose

### Requirement: Approximated Preview Notice and Token Generation
When a preview's tokens are flagged as approximated, the panel SHALL show a notice saying the preview is approximated from `DESIGN.md`, with a Generate tokens.css action. Generate tokens.css, from the notice or the tree view, SHALL open Copilot Chat with a prefilled, unsent message asking for a `tokens.css` to be authored for that design system. It SHALL NOT write any file itself.

#### Scenario: Notice shown for a custom system without tokens
- **WHEN** a user previews a custom design system that has no `tokens.css`
- **THEN** the approximated notice with a Generate tokens.css action SHALL be shown

#### Scenario: Generate tokens.css prefills chat only
- **WHEN** the user invokes Generate tokens.css
- **THEN** Copilot Chat SHALL open with an unsent, editable message for that design system, and no file SHALL be written by the action itself

#### Scenario: Notice disappears once tokens exist
- **WHEN** a `tokens.css` is written for the previewed design system
- **THEN** the notice SHALL no longer be shown after the preview re-renders

### Requirement: Preview Content Is Isolated
All tab content, including the embedded component kit, SHALL be displayed in sandboxed frames that do not execute scripts. The side panel SHALL HTML-escape all `DESIGN.md` and `tokens.css` text before display.

#### Scenario: Script in DESIGN.md is not executed
- **WHEN** a custom design system's `DESIGN.md` or `tokens.css` contains a `<script>` tag or inline event-handler markup
- **THEN** it SHALL be shown as escaped text in the side panel and SHALL NOT execute in any tab

### Requirement: Preview Panel Actions
The preview panel header SHALL offer Set as active (hidden when the previewed design system is already active) and Use in chat, behaving identically to the tree view's actions. The header's active indicator SHALL update when the active design system changes from any surface while the panel is open.

#### Scenario: Set as active from the preview
- **WHEN** a user clicks Set as active in the preview header
- **THEN** that design system SHALL become active, the header SHALL show it as active, and the tree view SHALL update its marker

### Requirement: Preview Design System Command
The system SHALL provide an `OpenDesign: Preview Design System` command. When invoked without an argument, it SHALL present all design systems in the same category-grouped, searchable picker as Browse Design Systems and open the preview for the selection, without changing the active design system.

#### Scenario: Preview via command palette
- **WHEN** a user runs `OpenDesign: Preview Design System` and picks a design system
- **THEN** the preview panel SHALL open for it and the active design system SHALL remain unchanged

### Requirement: Token Content Vendoring and Overrides
The content sync SHALL vendor each design system's `tokens.css` when present upstream, in addition to `DESIGN.md` and `manifest.json`. It SHALL NOT vendor pre-rendered kit HTML or other design-system package files. The content overlay SHALL support an additive per-design-system token override that is applied on top of the vendored `tokens.css` during resolution without modifying or replacing it. The overlay SHALL fail if an override targets a design system that does not exist upstream. The content drift check SHALL cover vendored `tokens.css` files, and SHALL report any override token whose value equals the upstream value.

#### Scenario: tokens.css vendored
- **WHEN** the content sync runs against an upstream checkout whose design system folder contains `tokens.css`
- **THEN** that file SHALL be present at the same relative path in the vendored design-systems tree, and `system/kit.html`, `components.html` and `design-tokens.json` SHALL NOT be

#### Scenario: Override for an unknown design system fails
- **WHEN** the overlay contains a token override for a design system id that does not exist in the vendored tree
- **THEN** applying the overlay SHALL fail with an error naming that id

#### Scenario: Placeholder accents corrected
- **WHEN** the preview renders the built-in Application design system, whose upstream `tokens.css` accent is the placeholder `#2563eb` and whose `DESIGN.md` states primary `#9333EA`
- **THEN** the resolved `--accent` SHALL be `#9333EA` via its local override

#### Scenario: Stale override reported
- **WHEN** upstream's `tokens.css` for a design system now declares the same value as the local override for that token
- **THEN** the drift check SHALL report the override as removable
