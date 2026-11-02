## ADDED Requirements

### Requirement: App Screens Surface

The bundled catalog SHALL include a ready `app-screens` surface whose entries are the app pattern templates, the flow packs and the app-fit skills (`login-flow`, `paywall-upgrade-cro`, `shadcn-ui`, `platform-design`, `apple-hig`, `kanban-board`, `dashboard`), with questions for the task, the platform and the data density, and a "Build an app" goal routing to `app-screens`, `mobile` and `wireframe`.

#### Scenario: Listing the surface
- **WHEN** the agent lists skills for the `app-screens` surface
- **THEN** the result includes `app-table`, `flow-sign-in` and `dashboard`, and three questions with options and defaults

#### Scenario: Prototype is web pages
- **WHEN** the agent lists the `prototype` surface
- **THEN** `dashboard` is not among its entries

### Requirement: Pattern Templates

Each app pattern template SHALL ship a seed page with the app shell, design-system token hooks and named slots for its content and its empty, loading and error versions, and SHALL require the `product-ui`, `state-coverage` and `action-states` craft docs.

#### Scenario: Table template
- **WHEN** a brief is prepared with `app-table`
- **THEN** the instructions include the product UI craft, and the seed has slots named `rows`, `empty` and `loading`

### Requirement: Flow Packs

A flow pack SHALL instruct the agent to make one artifact per screen in one collection, list the pack's screens and branches, cap the pack at eight screens, and let the user drop branches through a brief question.

#### Scenario: Sign-in flow
- **WHEN** the user asks for "a sign-in flow for my app" and accepts the defaults
- **THEN** the agent makes screens for sign in, sign up, reset, verify and an error state, all sharing one `collectionId`

### Requirement: Density in the Instructions

When the brief answers the density question, the instructions SHALL state the control height, text size and padding for that density as numbers.

#### Scenario: Compact table
- **WHEN** the density answer is "compact"
- **THEN** the instructions say controls are 32 to 36 px high and body text is 13 to 14 px

### Requirement: Store-Rules Findings

When a checked mobile design belongs to a collection that has a sign-up or paywall screen, the check SHALL report `store-rules` notes for a missing reachable account deletion, a paywall without restore or terms links, and a permission screen without a reason; the notes SHALL be warnings when the brief says the app ships to the App Store or Play.

#### Scenario: No account deletion
- **WHEN** a mobile collection has a sign-up screen and no screen with a delete-account action
- **THEN** the check reports a `store-rules` note naming account deletion

#### Scenario: Not a store app
- **WHEN** the brief does not say the app ships to a store
- **THEN** store-rules findings are notes, never warnings
