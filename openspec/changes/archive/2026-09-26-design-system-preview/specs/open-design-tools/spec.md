## MODIFIED Requirements

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
