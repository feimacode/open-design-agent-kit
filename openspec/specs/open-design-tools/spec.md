# open-design-tools

## Purpose

Lets VS Code Copilot Chat browse OpenDesign's bundled design skills, design templates, design systems, and remixable example artifacts, compose a generation brief for one of them, and register a workspace file as a recognized OpenDesign artifact — all in-process via native `languageModelTools`, with no daemon process and no MCP server involved. The model already selected in Copilot Chat performs the actual generation using its own native file-editing tools. A curated subset of skills/templates is also reachable as zero-ambiguity `/` slash commands. A single active design system persists per workspace, visible in the status bar, so it doesn't need to be re-specified on every request. A live preview editor lets a user view, comment on, and directly (WYSIWYG) edit HTML artifacts; a chat tool, a QuickPick command, an Explorer tree view, and a grid webview all let a user remix a vendored example into a real starting file, sharing identical remix logic.
## Requirements
### Requirement: Skill and Design System Discovery
The system SHALL expose the vendored skill, design-template, and design system catalogs as `languageModelTools` (`list_open_design_skills`, `list_open_design_design_systems`) that return id/name/description for each entry, optionally filtered by a free-text query matched against name, description, and (for skills/design-templates) triggers and tags. Skills and design-templates SHALL be merged into a single catalog exposed by `list_open_design_skills`, each entry tagged with a `source` of `skill` or `design-template`; either may be passed as `skillId` to `prepare_open_design_brief`. Each entry's display name SHALL prefer an upstream `en_name` field over the raw `name` field when present, since `name` is frequently a machine slug rather than a human-readable title.

Each skill/design-template's returned `id` SHALL be namespaced as `od:<mode>:<dirId>`, where `mode` is derived from the entry's `od.mode` frontmatter field, normalized against a fixed vocabulary (`prototype`, `deck`, `design-system`, `image`, `video`, `template`, `utility`, `audio`), falling back to `other` when absent or unrecognized. `list_open_design_skills` SHALL support an exact `mode` filter in addition to free-text `query`. Tools accepting a `skillId` (`prepare_open_design_brief`) SHALL accept both the namespaced form and a bare directory id.

#### Scenario: Listing without a query
- **WHEN** `list_open_design_skills` is invoked with no `query`
- **THEN** every vendored skill and design-template SHALL be returned, each with a `source` field and a namespaced `id`

#### Scenario: Human-readable display name
- **WHEN** an entry's frontmatter has an `en_name` distinct from its machine `name`/directory slug
- **THEN** the returned `name` SHALL be the `en_name` value

#### Scenario: Filtering by query
- **WHEN** `list_open_design_skills` is invoked with a `query` that matches a subset of skills' name/description/triggers
- **THEN** only the matching subset SHALL be returned

#### Scenario: Mode-namespaced id
- **WHEN** an entry's `od.mode` frontmatter field is `deck`
- **THEN** its returned `id` SHALL be `od:deck:<dirId>`

#### Scenario: Unknown or missing mode
- **WHEN** an entry has no `od.mode` field, or an unrecognized value
- **THEN** its returned `id` SHALL use `other` as the mode segment

#### Scenario: Filtering by exact mode
- **WHEN** `list_open_design_skills` is invoked with a `mode` matching one of the fixed vocabulary values
- **THEN** only entries with that mode SHALL be returned

#### Scenario: skillId lookup accepts both id forms
- **WHEN** `prepare_open_design_brief` is invoked with a `skillId` that is either the full namespaced form or a bare directory id matching a vendored entry
- **THEN** the corresponding skill or design-template SHALL be resolved in both cases

### Requirement: Brief Preparation Without File Writes
The system SHALL expose `prepare_open_design_brief`, which composes generation instructions from a chosen skill, an optional design system, universal craft rules, the caller's brief, and a best-effort signal of whether the workspace already contains a real application, and returns those instructions plus a suggested workspace-relative entry path. This tool SHALL NOT write any files.

#### Scenario: Valid skill, no design system
- **WHEN** `prepare_open_design_brief` is invoked with a valid `skillId` and a `brief`, and no `designSystemId`
- **THEN** the returned instructions SHALL include the skill's workflow body and the brief, and SHALL NOT reference a design system section

#### Scenario: Valid skill and design system
- **WHEN** `prepare_open_design_brief` is invoked with a valid `skillId` and a valid `designSystemId`
- **THEN** the returned instructions SHALL include both the skill's workflow body and the design system's token content, with the design system marked authoritative for visual tokens

#### Scenario: Unknown skillId
- **WHEN** `prepare_open_design_brief` is invoked with a `skillId` that does not exist in the vendored catalog
- **THEN** the tool SHALL return an error message naming the problem and pointing the caller back to `list_open_design_skills`, rather than silently proceeding

#### Scenario: Existing-app detection nudges without changing where the artifact is written
- **WHEN** the open workspace's `package.json` lists a recognized application framework
- **THEN** the returned instructions SHALL include a note naming the detected framework(s) and encouraging the model to check the app's real existing conventions, while still directing the artifact to be written as a standalone file at the usual suggested entry path

#### Scenario: No workspace or no recognizable framework degrades silently
- **WHEN** no workspace folder is open, or the workspace's `package.json` is absent, unparseable, or lists no recognized framework
- **THEN** `prepare_open_design_brief` SHALL behave exactly as it did before this detection existed, with no error and no existing-app section in the returned instructions

### Requirement: Artifact Registration Requires an Existing Entry File
The system SHALL expose `register_open_design_artifact`, which validates and writes an artifact manifest sidecar (`<entry>.artifact.json`) next to an already-written entry file. It SHALL reject registration when the entry file does not yet exist in the workspace.

#### Scenario: Entry file already written
- **WHEN** `register_open_design_artifact` is invoked with an `entryPath` that exists in the workspace, plus a valid `kind` and `title`
- **THEN** a manifest sidecar SHALL be written at `<entryPath>.artifact.json` containing the validated manifest

#### Scenario: Entry file missing
- **WHEN** `register_open_design_artifact` is invoked with an `entryPath` that does not exist in the workspace
- **THEN** the tool SHALL return an error instructing the caller to write the file first, and SHALL NOT write a manifest

### Requirement: Artifact Readback
The system SHALL expose `get_open_design_artifact`, returning the manifest (if present), entry file content, and supporting file list for a given workspace-relative entry path.

#### Scenario: Registered artifact
- **WHEN** `get_open_design_artifact` is invoked with an `entryPath` that has both an entry file and a manifest sidecar
- **THEN** the manifest, entry content, and supporting file list SHALL all be returned

#### Scenario: Entry file not found
- **WHEN** `get_open_design_artifact` is invoked with an `entryPath` that does not exist
- **THEN** the tool SHALL return a clear "not found" result rather than throwing

### Requirement: No Daemon or MCP Dependency
The system SHALL perform all of the above without spawning open-design's daemon process and without an MCP transport. All skill/design-system content SHALL be vendored into the extension at build time, not fetched live from a daemon or an open-design checkout at runtime. When a vendored skill's text instructs the model to use the Open Design daemon (e.g. `$OD_BIN`, `od media`, "OD daemon"), `prepare_open_design_brief` SHALL append after the skill text either a skill-specific host override that gives a daemon-free equivalent or, if none exists, a notice that the daemon-backed step is unavailable in this host and the model should tell the user rather than improvise. Vendored skill files SHALL NOT be edited to achieve this.

#### Scenario: Extension used with no open-design checkout present
- **WHEN** the extension is installed and activated on a machine with no open-design checkout and no `od` daemon running
- **THEN** all five tools SHALL function normally, sourcing content from the extension's own bundled `assets/open-design/` directory

#### Scenario: Skill with a daemon-free override
- **WHEN** `prepare_open_design_brief` is called for a skill that references the daemon and has a registered host override (e.g. `hyperframes`)
- **THEN** the returned instructions SHALL include the override, headed as taking precedence over the skill text above it

#### Scenario: Skill with no override
- **WHEN** `prepare_open_design_brief` is called for a skill that references the daemon and has no host override (e.g. `image-poster`)
- **THEN** the returned instructions SHALL include a notice that the daemon-backed step isn't available in this host

#### Scenario: Vendored content untouched
- **WHEN** content sync parity is checked after this change
- **THEN** every vendored upstream SKILL.md SHALL still match upstream byte for byte

### Requirement: Native File Authoring
The system SHALL NOT provide any tool that writes design content (HTML/CSS/JS/etc.) on the caller's behalf. Artifact content SHALL be authored by the calling model using VS Code's own native file-editing tools; the extension's only file-write responsibility is the artifact manifest sidecar.

#### Scenario: Generation flow
- **WHEN** a chat agent follows the documented flow (list skills → optionally list design systems → prepare_open_design_brief → author files → register_open_design_artifact)
- **THEN** the entry and supporting files SHALL be written by the calling model's own tools, and this extension SHALL only have written the `.artifact.json` sidecar

### Requirement: Curated Slash-Command Shortcuts
The system SHALL generate a `chatPromptFiles` entry for each catalog entry that is curated. An entry is curated if it is flagged in upstream frontmatter (a top-level `featured`, a top-level `recommended`, or an `od.default_for` field) or if its id appears in the extension-owned local curation list. Each entry SHALL pin that entry's exact `skillId` and, when available, its curated `example_prompt` as the default input. This generation SHALL be idempotent and re-derived from vendored content and the local curation list on every content sync, not hand-maintained per host.

#### Scenario: A named, curated entry gets its own command
- **WHEN** a catalog entry carries a top-level `featured` or `recommended` key, or `od.default_for`
- **THEN** a `prompts/featured/<id>.prompt.md` file SHALL be generated pinning that exact `skillId`, and its path SHALL be included in `package.json`'s `contributes.chatPromptFiles`

#### Scenario: Locally curated entry gets its own command
- **WHEN** an entry with no upstream curation flag (e.g. `card-twitter`) is listed in the local curation list
- **THEN** a `prompts/featured/card-twitter.prompt.md` file SHALL be generated exactly as for an upstream-curated entry

#### Scenario: Unknown id in the local curation list
- **WHEN** the local curation list names an id that matches no catalog entry
- **THEN** content sync SHALL fail and name the unknown id

#### Scenario: Re-running content sync does not accumulate stale commands
- **WHEN** `npm run sync-content` is run again after upstream content or the local curation list changes which entries are curated
- **THEN** the generated `prompts/featured/` directory and the generated slice of `contributes.chatPromptFiles` SHALL both be fully replaced to match the current curated set, not merged with the previous run's output

### Requirement: Design System Category Filtering and Native Browsing
The system SHALL read each design system's canonical `manifest.json` (name, category, description, `craft.suggested`) when present, falling back to parsing `DESIGN.md`'s heading/blockquote only for legacy entries without one. `list_open_design_design_systems` SHALL support an exact `category` filter in addition to free-text `query` (which SHALL also match against `category`), and SHALL return each result's `category`. The system SHALL additionally provide a native command (`OpenDesign: Browse Design Systems`) that presents all design systems in a category-grouped, fuzzy-searchable picker and, on selection, opens Copilot Chat with a prefilled, editable message naming the chosen design system.

#### Scenario: manifest.json is the canonical source
- **WHEN** a design system folder contains both `DESIGN.md` and `manifest.json`
- **THEN** its returned name, category, and summary SHALL come from `manifest.json`, not from parsing `DESIGN.md`

#### Scenario: Legacy fallback
- **WHEN** a design system folder contains `DESIGN.md` but no `manifest.json`
- **THEN** its name and summary SHALL be derived from `DESIGN.md`'s leading heading and blockquote, and its category SHALL be absent

#### Scenario: Filtering by exact category
- **WHEN** `list_open_design_design_systems` is invoked with a `category` matching an existing category exactly
- **THEN** only design systems in that category SHALL be returned

#### Scenario: Browsing without leaving the keyboard
- **WHEN** the user runs the `OpenDesign: Browse Design Systems` command and selects a design system from the picker
- **THEN** Copilot Chat SHALL open with an editable message naming that design system's id, without the command writing or sending anything on the user's behalf

### Requirement: Craft Rules Follow the Active Design System's Own Suggestions
When composing a generation brief, the system SHALL narrow the applied craft-rule set to the active design system's `craft.suggested` list (from its `manifest.json`) when that list is non-empty. When no design system is active, or the active one has no suggestion list, every vendored craft doc SHALL still be applied, matching prior behavior.

#### Scenario: Design system with a suggested craft list
- **WHEN** `prepare_open_design_brief` is invoked with a `designSystemId` whose `craft.suggested` names a non-empty subset of the craft catalog
- **THEN** only that subset SHALL be included in the composed instructions

#### Scenario: No design system, or one without a suggestion list
- **WHEN** `prepare_open_design_brief` is invoked with no `designSystemId`, or one whose `craft.suggested` is empty or absent
- **THEN** every vendored craft doc SHALL be included, as before this change

### Requirement: Persistent, Sticky Active Design System
The system SHALL persist a single active design system id per workspace as the `openDesign.activeDesignSystemId` setting. `prepare_open_design_brief` SHALL treat `designSystemId` as optional, falling back to the active setting when omitted, and SHALL update the active setting to match whenever an explicit `designSystemId` is given. A stale active id that no longer resolves to a known design system SHALL be treated as no active design system, without producing an error. `list_open_design_design_systems` SHALL mark the currently active entry with `active: true`. `prepare_open_design_brief`'s response SHALL include the resolved `designSystemId` and `designSystemName` actually used, if any.

#### Scenario: Falling back to the active design system
- **WHEN** `prepare_open_design_brief` is invoked with no `designSystemId`, and an active design system is set
- **THEN** that active design system SHALL be used, and its id/name SHALL be reflected in the response

#### Scenario: Explicit selection becomes the new active one
- **WHEN** `prepare_open_design_brief` is invoked with an explicit, valid `designSystemId`
- **THEN** that id SHALL become the new active design system for subsequent requests in the same workspace

#### Scenario: Stale active id degrades gracefully
- **WHEN** the active setting names a design system id that no longer exists in the vendored catalog
- **THEN** `prepare_open_design_brief` SHALL proceed as if no design system were active, rather than returning an error

#### Scenario: Active flag in listings
- **WHEN** `list_open_design_design_systems` is invoked while a design system is active
- **THEN** that entry's result SHALL include `active: true`, and all others SHALL include `active: false`

### Requirement: Direct Active Design System Management
The system SHALL provide a `set_active_design_system` tool to set or clear the active design system without requiring an artifact generation, a native command (`OpenDesign: Browse Design Systems`) that sets the active design system on pick from a category-grouped, fuzzy-searchable list, and a persistent status bar item showing the current active design system (or its absence) that opens the same picker on click.

#### Scenario: Setting via tool
- **WHEN** `set_active_design_system` is invoked with a valid `designSystemId`
- **THEN** it SHALL become the active design system, confirmed in the tool's response

#### Scenario: Clearing via tool
- **WHEN** `set_active_design_system` is invoked with no `designSystemId` (or an empty string)
- **THEN** the active design system SHALL be cleared

#### Scenario: Status bar reflects current state
- **WHEN** the active design system changes, by any means (tool, command, or a direct settings edit)
- **THEN** the status bar item SHALL update to show the new active design system's name, or "No design system" when cleared

### Requirement: Custom Design Systems (Model-Authored)
The system SHALL let a user define a design system beyond the bundled catalog, written as a workspace-local `DESIGN.md` file under the OpenDesign output directory, using the same file shape and selection mechanism as the bundled ones. It SHALL be accompanied by a workspace-local `tokens.css` that follows the same token contract as the bundled design systems' `tokens.css`. A `create_open_design_design_system` tool SHALL compose instructions for authoring both files (given a name, a brief, and an optional reference website URL) without writing any file itself — the calling model authors the content with its own file-editing tools, matching every other content-producing tool in this system. The `tokens.css` instructions SHALL list the contract's required token names with their descriptions, generated from the same vendored token schema the preview resolves against. They SHALL state that optional tokens may be omitted and will fall back to contract defaults, and SHALL require the `tokens.css` colour and font values to be consistent with the `DESIGN.md`. When given an optional `existingDesignSystemId` naming an existing custom design system, the tool SHALL instead compose instructions to author only that design system's `tokens.css`, including its current `DESIGN.md` as the source of truth. When a reference URL is given, the tool SHALL attempt a best-effort extraction of candidate colors, fonts, and a favicon/logo image from that page and its same-origin linked stylesheets, presented to the model as a starting point rather than authoritative data; a failed or blocked fetch SHALL degrade to an empty extraction result rather than failing the tool call. Once written, a custom design system SHALL be immediately selectable — via `list_open_design_design_systems`, `set_active_design_system`, `prepare_open_design_brief`, and the `OpenDesign: Browse Design Systems` picker — with no separate registration step, and SHALL be distinguishable from bundled design systems by a `source` field. A custom design system SHALL remain selectable when its `tokens.css` is missing.

#### Scenario: Creating a custom design system writes no files by itself
- **WHEN** `create_open_design_design_system` is invoked with a name and brief
- **THEN** it SHALL return instructions for authoring a `DESIGN.md` file and a `tokens.css` file in the same design-system folder, and SHALL NOT write any file to the workspace

#### Scenario: Token instructions follow the contract
- **WHEN** `create_open_design_design_system` returns instructions
- **THEN** they SHALL name every required token from the vendored token contract, including `--bg`, `--surface`, `--fg`, `--muted`, `--border`, `--accent`, `--font-display` and `--font-body`

#### Scenario: Tokens-only instructions for an existing custom system
- **WHEN** `create_open_design_design_system` is invoked with `existingDesignSystemId` naming an existing custom design system
- **THEN** it SHALL return instructions to author only that design system's `tokens.css`, SHALL include that design system's current `DESIGN.md` content, and SHALL NOT instruct changes to the `DESIGN.md`

#### Scenario: Tokens-only mode rejects a non-custom id
- **WHEN** `create_open_design_design_system` is invoked with an `existingDesignSystemId` that is not an existing custom design system
- **THEN** it SHALL return an error message naming the id, and SHALL NOT return authoring instructions

#### Scenario: A reference URL seeds extracted evidence, degrading gracefully on failure
- **WHEN** `create_open_design_design_system` is invoked with a `sourceUrl` that cannot be fetched or contains no usable evidence
- **THEN** the tool SHALL still return usable instructions, with an empty or partial evidence set rather than an error

#### Scenario: A newly-written custom design system is immediately selectable
- **WHEN** a `DESIGN.md` file is written under the OpenDesign output directory's `design-systems/` subdirectory
- **THEN** it SHALL appear in `list_open_design_design_systems` and the `OpenDesign: Browse Design Systems` picker on the very next call, without an extension reload, tagged with `source` distinguishing it from bundled design systems, whether or not a `tokens.css` has been written yet

### Requirement: Custom Design Systems (Deterministic Import)
The system SHALL provide an `OpenDesign: Import Design System` command that imports an existing design system from a file on disk, pasted content, or a GitHub repository, writing the resulting `DESIGN.md` deterministically — with no model or chat step involved — so an organization's actual design system is never paraphrased. Content that already matches the `DESIGN.md` shape (a `#` heading as its first non-blank line) SHALL be written verbatim; other content SHALL have candidate colors and fonts extracted (the same mechanism as the model-authored path's URL extraction) and wrapped in the required shape, with the original source content always preserved verbatim in the result so nothing found automatically is the only record of it. The import SHALL also write a `tokens.css` next to the `DESIGN.md`, but only from token declarations it can take verbatim:
- from source CSS that declares custom properties whose names belong to the token contract, copying those declarations unchanged
- from a GitHub repository's root `tokens.css` alongside its `DESIGN.md`, used unchanged

The import SHALL NOT assign extracted colors or fonts to token roles by inference, and SHALL write no `tokens.css` when no verbatim token declarations exist. A GitHub source SHALL support both a direct file URL and a bare repository URL; for a bare repository URL, the system SHALL check for a `DESIGN.md` first and use it alone if present (plus a root `tokens.css` if one exists), otherwise probe a fixed set of common design-token file locations. The command SHALL be reachable from the Command Palette and from a leading entry in the `OpenDesign: Browse Design Systems` picker.

#### Scenario: Already-shaped content is imported verbatim
- **WHEN** the imported source content's first non-blank line is a `#` heading
- **THEN** the written `DESIGN.md` SHALL be identical to that source content, with no synthesis or wrapping applied

#### Scenario: Raw token content is wrapped with extraction and the source preserved
- **WHEN** the imported source content does not already match the `DESIGN.md` shape
- **THEN** the written `DESIGN.md` SHALL include any colors/fonts found by extraction, and SHALL also include the original source content verbatim in a dedicated reference section

#### Scenario: A GitHub repository URL with a DESIGN.md present uses it directly
- **WHEN** a bare GitHub repository URL is given and a `DESIGN.md` file exists at its root
- **THEN** that file SHALL be used as the sole `DESIGN.md` source, without probing or concatenating other candidate token files

#### Scenario: Contract tokens in source CSS are written verbatim
- **WHEN** the imported source is CSS declaring `--accent: #ff385c;` and `--bg: #ffffff;` among other custom properties
- **THEN** the written `tokens.css` SHALL contain exactly those contract-named declarations with their original values, and SHALL NOT contain declarations for non-contract property names

#### Scenario: Sibling tokens.css from a GitHub repository
- **WHEN** a bare GitHub repository URL is given and both `DESIGN.md` and `tokens.css` exist at its root
- **THEN** the written `tokens.css` SHALL be identical to the repository's `tokens.css`

#### Scenario: No verbatim tokens means no tokens.css
- **WHEN** the imported source contains colors and fonts but no contract-named custom property declarations, and no sibling `tokens.css` exists
- **THEN** no `tokens.css` SHALL be written, and the imported design system SHALL still be selectable

### Requirement: Live Artifact Preview Editor
The system SHALL provide a custom editor for HTML files (registered as an optional, non-default editor so it never replaces the built-in HTML editor) that renders a live, sandboxed preview of the file's current content, updating automatically when the underlying document changes. Registering an artifact via `register_open_design_artifact` SHALL automatically open this preview for HTML entries.

#### Scenario: Registering an HTML artifact opens its preview
- **WHEN** `register_open_design_artifact` succeeds for an entry ending in `.html`
- **THEN** the artifact preview editor SHALL open automatically for that file

#### Scenario: External changes update the live preview
- **WHEN** the underlying document is edited by any means (the model's own file-editing tools, a manual edit in the preview, or a direct text-editor edit) while the preview is open
- **THEN** the preview SHALL re-render to reflect the new content without requiring the editor to be reopened

### Requirement: Hover and Selection Highlighting in Comment/Edit Modes
While Comment or Edit mode is active, the system SHALL visually highlight the element currently under the pointer, and SHALL show a visually distinct, persistent highlight on the element that was clicked (its comment or edit panel's target) until that panel is closed or another element is selected, along with alignment guide lines extending from that element's edges across the canvas. In View mode, no highlighting SHALL be shown. Highlighting and hit-testing SHALL work uniformly across all elements in the preview, not only elements the artifact's own runtime CSS/JavaScript treats as interactive.

#### Scenario: Hovering an element highlights it before clicking
- **WHEN** a user moves the pointer over an element in the preview while Comment or Edit mode is active
- **THEN** that element SHALL be visually outlined, distinguishing it from the element (if any) that is currently selected

#### Scenario: The selected element stays highlighted while its panel is open
- **WHEN** a user clicks an element in Comment or Edit mode
- **THEN** that element SHALL show a persistent, visually distinct highlight (thicker/stronger than the hover highlight) for as long as its panel remains open, along with dashed alignment guide lines extending from its edges across the canvas

#### Scenario: Every element is selectable, regardless of the artifact's own interactivity styling
- **WHEN** an artifact's own CSS disables pointer interaction on most of the page (e.g. a loading or entrance-animation state)
- **THEN** hovering and clicking in Comment/Edit mode SHALL still work uniformly across all such elements, not only ones the artifact itself treats as interactive

### Requirement: Element-Anchored Comments With Chat Handoff, No Apply Engine
The system SHALL let a user pin a comment to a specific element in the live preview, persisted as a workspace-local sidecar file (`<entry>.comments.json`) rather than any external database. The system SHALL NOT provide any mechanism that applies a comment to the artifact automatically; instead, selected open comments SHALL be gathered into a scoped instruction and handed to a new chat message for the calling model to act on with its own file-editing tools, matching the same mechanism by which any other requested change is made. `get_open_design_artifact` SHALL surface open (unaddressed) comments in its response.

#### Scenario: Adding a comment persists it to the sidecar
- **WHEN** a user pins a comment on an element in the preview's Comment mode
- **THEN** a comment record (including an element/selector anchor and the note text) SHALL be written to `<entry>.comments.json`

#### Scenario: Sending comments to chat does not modify the artifact directly
- **WHEN** a user sends one or more open comments to chat
- **THEN** a new chat message SHALL be prefilled with a scoped instruction naming the targeted elements and their notes, and the artifact file SHALL remain unchanged until the calling model acts on that message with its own tools

#### Scenario: Pending comments are visible to the model
- **WHEN** `get_open_design_artifact` is invoked for an entry with unaddressed comments
- **THEN** its response SHALL include those comments so the model can address them before considering the task complete

### Requirement: Direct WYSIWYG Editing for HTML Artifacts
The system SHALL let a user directly edit an HTML artifact's rendered elements from within the live preview, with changes written back to the underlying file through the standard editor edit/undo mechanism. The edit panel's content fields SHALL adapt to the clicked element's kind (an image gets URL/alt fields, a link gets text/href fields, a container gets its raw HTML, any other element gets a text field), and its style section SHALL cover a curated set of properties spanning typography (font family, size, weight, line height, letter spacing, text align), color (text, background, border), box model (border radius/width/style, independent per-side padding and margin), and opacity. The user SHALL also be able to remove the clicked element. This capability SHALL be limited to HTML artifacts; artifacts rendered via a non-HTML mechanism (e.g. JSX/react-component) SHALL remain preview-only.

#### Scenario: A direct text edit is written back with undo support
- **WHEN** a user edits an element's text in the preview's Edit mode and commits the change
- **THEN** the underlying file SHALL be updated to reflect that change, and undoing in the editor SHALL revert it

#### Scenario: Content fields adapt to the clicked element's kind
- **WHEN** a user clicks an image, a link, a container element, or a plain text element in Edit mode
- **THEN** the panel SHALL show that kind's own relevant content fields (image: URL and alt text; link: text and href; container: raw HTML; other: text) rather than a single one-size-fits-all field

#### Scenario: Edit mode is unavailable for non-HTML artifacts
- **WHEN** the previewed artifact is not an HTML document (e.g. a JSX/react-component artifact)
- **THEN** the preview SHALL still render the artifact, but direct editing SHALL NOT be offered

### Requirement: Promoting a Prototype to Real Application Code
The system SHALL provide a `port_open_design_artifact_to_app` tool that composes instructions for reproducing a finished artifact's design as real, idiomatic code within the workspace's existing application, without writing any file itself — the calling model performs the port with its own file-editing tools, matching every other content-producing tool in this system. The composed instructions SHALL direct the model to ground the port in the application's real conventions — reading either an explicitly given reference component or one found by searching the workspace — rather than copying the artifact's markup or inline styling verbatim, and SHALL explicitly exclude routing/navigation wiring from the task. When no target file path is given, the system SHALL attempt a best-effort suggestion based on the presence of a conventional components directory, without requiring one. The Artifact Preview editor's toolbar SHALL provide a button that invokes this workflow via a prefilled chat message naming the tool and the artifact's entry path.

#### Scenario: The tool writes no files
- **WHEN** `port_open_design_artifact_to_app` is invoked with an `entryPath`
- **THEN** it SHALL return instructions for producing real application code and SHALL NOT write any file to the workspace

#### Scenario: Instructions direct the model to ground the port in a real reference component
- **WHEN** `port_open_design_artifact_to_app` is invoked without an explicit `referenceComponentPath`
- **THEN** the returned instructions SHALL direct the model to find and read a structurally-similar existing component in the workspace before writing new code, rather than assuming or inventing the application's conventions

#### Scenario: Routing and navigation wiring is explicitly out of scope
- **WHEN** `port_open_design_artifact_to_app` is invoked
- **THEN** the returned instructions SHALL explicitly direct the model not to wire the new code into routing or navigation

### Requirement: Gallery Browsing and Remixing of Example Artifacts
The system SHALL vendor a pool of example artifacts (entries with an actual rendered starting file, distinct from skills/design-templates which describe a task or style but ship no rendered output) and expose them through the same unified catalog as skills and design-templates. The system SHALL provide a mechanism to copy a chosen example's rendered artifact into the workspace as a new file, register it, and instruct the calling model to modify that existing file as a targeted change rather than generate new content from scratch.

#### Scenario: An example entry is distinguishable from a task-only skill
- **WHEN** `list_open_design_skills` returns an entry sourced from the examples pool
- **THEN** that entry SHALL include a non-empty reference to its rendered starting artifact, distinguishing it from skills/design-templates that have none

#### Scenario: Remixing copies the file and returns a modification instruction
- **WHEN** an example with a rendered starting artifact is remixed
- **THEN** that artifact's content SHALL be copied into a new file in the workspace, registered as an OpenDesign artifact, and the returned instructions SHALL direct the calling model to modify the existing file rather than regenerate it from scratch

#### Scenario: Remixing an entry with no rendered artifact fails clearly
- **WHEN** remixing is attempted on a skill or design-template with no rendered starting artifact
- **THEN** the system SHALL explain that this entry has nothing to remix and suggest generating from scratch instead

#### Scenario: A native gallery browsing path exists alongside the tool
- **WHEN** a user runs the gallery-browsing command
- **THEN** they SHALL be able to search/select an example from a native picker and have it remixed and previewed without first typing anything in chat

### Requirement: Native Tree and Grid Browsing of Remixable Examples
The system SHALL provide a tree view, in its own standalone activity-bar container (not nested inside another view container), listing remixable examples grouped by category, and a grid view (a searchable, filterable card layout with a live thumbnail per card) as an alternative visual browsing surface, alongside the existing QuickPick command and chat tool. In both the tree view and the grid view, clicking an example SHALL populate a prefilled, still-editable Copilot Chat message about it (via the stable chat-prefill API) rather than remixing or writing anything to the workspace; a read-only preview and remixing SHALL both remain available as separate, explicit actions (inline/context-menu icons in the tree, a Preview link and a Remix button in the grid and the read-only preview panel). The QuickPick command SHALL retain its existing behavior of remixing immediately on selection. All remix actions, from any entry point, SHALL use identical underlying logic. Grid thumbnails SHALL be fetched lazily (only once a card is visible) and delivered as in-memory content rather than through a resource-URL fetch.

#### Scenario: Tree view groups examples by category
- **WHEN** the OpenDesign Gallery tree view is expanded
- **THEN** its top-level nodes SHALL be categories, and expanding a category SHALL list the remixable examples within it

#### Scenario: The tree view is reachable from its own activity-bar icon
- **WHEN** the extension is installed
- **THEN** a dedicated activity-bar icon SHALL open the Gallery tree view, without requiring the Explorer view to be open first

#### Scenario: Clicking a tree item populates chat without writing to the workspace
- **WHEN** a user clicks an example in the tree view
- **THEN** a prefilled, unsent Copilot Chat message naming that example SHALL be opened, and no file SHALL be written to the workspace

#### Scenario: An explicit "Use in Chat" inline action does the same as a click
- **WHEN** a user invokes the tree item's inline "Use in Chat" action (or the equivalent context-menu entry) instead of clicking the item itself
- **THEN** the same prefilled, unsent Copilot Chat message SHALL be opened, giving an explicit, discoverable affordance for the same action

#### Scenario: Previewing from the tree view requires the explicit Preview action
- **WHEN** a user invokes Preview from a tree item's inline action or context menu
- **THEN** a read-only preview SHALL open, and no file SHALL be written to the workspace

#### Scenario: Remixing from the tree view requires the explicit Remix action
- **WHEN** a user invokes Remix from a tree item's inline action or context menu
- **THEN** that example SHALL be remixed using the same logic as the QuickPick command and chat tool, and its preview SHALL open

#### Scenario: Grid view supports search and category filtering
- **WHEN** a user types in the grid view's search box or selects a category filter chip
- **THEN** only matching example cards SHALL remain visible

#### Scenario: Clicking a grid card populates chat without writing to the workspace
- **WHEN** a user clicks a card in the grid view, other than its Preview link or Remix button
- **THEN** a prefilled, unsent Copilot Chat message naming that example SHALL be opened, and no file SHALL be written to the workspace

#### Scenario: Previewing from the grid view requires the explicit Preview link
- **WHEN** a user selects the Preview link on a card in the grid view
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

