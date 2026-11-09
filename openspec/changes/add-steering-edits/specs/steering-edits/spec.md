## ADDED Requirements

### Requirement: Steering Verbs

The system SHALL define seven steering verbs: `bolder`, `quieter`, `denser`, `roomier`, `distill`, `polish` and `harden`. Each verb SHALL have a written definition in the content overlay (what to change, what to keep, what not to do) and a measurable expected direction inside its scope. Only the chosen verb's definition SHALL be included in an edit's instructions.

#### Scenario: Unknown verb
- **WHEN** `prepare_open_design_edit` is called with the verb `louder`
- **THEN** it SHALL fail with an error that lists the seven verbs

#### Scenario: Definition bound to the design system
- **WHEN** a `denser` edit is prepared on a design whose design system has a spacing scale
- **THEN** the instructions SHALL include the verb's definition and the spacing scale, and SHALL require new spacing values to come from that scale

### Requirement: Edit Scope

An edit SHALL apply to exactly one element and its contents, given as a `data-od-id`, a preview comment id, a CSS selector, a named region (`header`, `hero`, `main`, `footer`), or a section identified by its heading text. A scope that matches no element or more than one SHALL fail with a list of candidates. The whole page SHALL be accepted as a scope only for `polish` and `harden`. When the scope element has no `data-od-id`, the tool SHALL add one to the design, and SHALL make no other change to it.

#### Scenario: Section by heading
- **WHEN** an edit is prepared with scope `{ heading: "Pricing" }` and one section's heading reads "Pricing"
- **THEN** that section SHALL be the scope, and it SHALL carry a `data-od-id` afterwards

#### Scenario: Ambiguous selector
- **WHEN** the scope is the selector `.card` and the page has three cards
- **THEN** the tool SHALL fail and list the three candidates with their text

#### Scenario: Page scope for bolder
- **WHEN** a `bolder` edit is prepared with scope `page`
- **THEN** the tool SHALL fail and suggest exploring directions instead

### Requirement: Prepare an Edit

The system SHALL expose `prepare_open_design_edit` in every host (MCP tool and VS Code `languageModelTool`), taking a registered HTML artifact's `entryPath`, `verb`, `scope` and optional `notes`. It SHALL save a snapshot of the design under `<entry dir>/.edits/<editId>/` and return an `editId` and instructions: the verb's definition, the scope's current HTML, the relevant design-system tokens, and the scope rules (change only inside the scope; keep every `data-od-*` attribute; keep the copy unless the verb's definition allows otherwise; add CSS only in rules that match inside the scope). The instructions SHALL say to call `check_open_design_artifact` with the `editId` afterwards. The tool SHALL NOT write design content.

#### Scenario: Prepared edit
- **WHEN** a `quieter` edit is prepared on the hero of a registered landing page
- **THEN** the result SHALL contain an `editId`, the snapshot SHALL exist, and the instructions SHALL contain the hero's HTML and the `quieter` definition

#### Scenario: Unregistered design
- **WHEN** the entry has no manifest
- **THEN** the tool SHALL fail with a message saying to register the design first

### Requirement: Undo an Edit

`prepare_open_design_edit` with `undo: <editId>` SHALL restore that edit's snapshot over the design, unless a later edit was made to the design since, in which case it SHALL refuse and name the later edit. The undo SHALL be recorded in the edit log.

#### Scenario: Undo the last edit
- **WHEN** the last edit made the hero bolder and the user asks to undo it
- **THEN** the design SHALL equal the snapshot taken before that edit

#### Scenario: Undo blocked by a later edit
- **WHEN** edit A was followed by edit B and the user asks to undo A
- **THEN** the tool SHALL refuse and say that B must be undone first

### Requirement: Edit Log

The manifest SHALL keep the last 20 edits of a design in `metadata.edits`, each with its id, verb, scope, time and the guard's result once checked. The critic's input SHALL include the log, and snapshots older than the last 20 edits SHALL be removed.

#### Scenario: Log after a checked edit
- **WHEN** a `denser` edit on the orders table is checked with no findings
- **THEN** `metadata.edits` SHALL end with that edit, its scope and a clean result

### Requirement: Verbs in the Preview

The comment panel in the VS Code, browser and Claude Desktop previews SHALL offer the seven verbs as buttons for the selected element. Choosing one SHALL create a comment with that `verb` and the element as its anchor, and send it to chat at once; the gathered instruction SHALL ask for a scoped edit with that verb through `prepare_open_design_edit`.

#### Scenario: Bolder from the preview
- **WHEN** the user selects the pricing section in the preview and clicks "Bolder"
- **THEN** a comment with `verb: "bolder"` anchored to that section SHALL be saved and sent, and the message SHALL name the verb and the scope

### Requirement: Edit Skill

The system SHALL ship an `open-design-edit` skill (VS Code prompt file, MCP prompt, and Claude Code and Codex skill) that maps everyday wording to a verb and a scope, asks only when the scope can't be found, prepares the edit, makes it, checks it with the `editId`, fixes any guard error, and shows the before and after image. The overview skill SHALL send changes to an existing design through it.

#### Scenario: Everyday wording
- **WHEN** the user says "the pricing table feels cramped" about a registered dashboard
- **THEN** the guidance SHALL lead to a `roomier` edit scoped to the pricing table

#### Scenario: New direction instead of an edit
- **WHEN** the user asks to make the whole page bolder
- **THEN** the guidance SHALL offer an exploration of directions instead of a page-wide edit
