# design-surfaces Specification

## Purpose
An extension-owned "what can I make" layer over the catalog: a surface catalog mapping kinds of things (wireframe, poster, diagram…) to curated non-stub entries, guarded at build time; a surface filter and stub flag on skill listing; and New design entry points (Gallery tiles and the open-design-new command) on every host.
## Requirements

### Requirement: Surface Catalog
The extension SHALL ship an extension-owned surface catalog (`packages/content/local/surfaces.json`) in which each surface has an `id`, `label`, `description`, `icon`, `status` (`ready` or `planned`), an ordered list of entry ids, an optional `prompt` naming a local prompt that owns the flow, and at most two clarifying `questions`. Only `ready` surfaces SHALL be shown or returned.

#### Scenario: Planned surface hidden
- **WHEN** the Diagram surface has `status: "planned"`
- **THEN** it SHALL NOT appear in the New design grid, the `/open-design-new` list or `surface: "list"` results

### Requirement: Surface Build Guard
The content sync check SHALL fail when a `ready` surface lists an entry id that doesn't exist, lists an entry that is a catalog stub, or names a prompt that doesn't exist, and SHALL name the surface and the offending id.

#### Scenario: Stub entry in a surface
- **WHEN** the Animation surface lists `remotion`, whose SKILL.md is a catalog stub
- **THEN** the check SHALL fail naming `animation` and `remotion`

### Requirement: Surface Filter on Skill Listing
`list_open_design_skills` SHALL accept an optional `surface`. With a surface id it SHALL return only that surface's entries, in catalog order, excluding stubs, plus the surface's `prompt` and `questions`. With `"list"` it SHALL return the ready surfaces (id, label, description, entry count). An unknown surface SHALL return an error listing the valid ids.

#### Scenario: Email surface
- **WHEN** the agent calls `list_open_design_skills` with `surface: "email"`
- **THEN** the result SHALL list the email entries in catalog order, and no entry SHALL be a stub

### Requirement: Stub Flag
Every `list_open_design_skills` result entry SHALL carry `stub: true` when it is a catalog stub (its body advertises an upstream skill and it ships no other file), and `stub` SHALL be absent otherwise.

#### Scenario: Free query hits a stub
- **WHEN** a free-text query matches `threejs`
- **THEN** the `threejs` entry SHALL be returned with `stub: true`

### Requirement: New Design Entry Points
VS Code SHALL show a "New design" grid of ready surfaces at the top of the Gallery; clicking a surface SHALL open chat with `/open-design-new <surface-id>`. Every host SHALL provide an `open-design-new` command or skill that, without an argument, lists the ready surfaces and, with one, asks that surface's questions (when the brief doesn't answer them) and continues with its prompt or its first fitting entry.

#### Scenario: Click a surface in the Gallery
- **WHEN** the user clicks "Wireframe" in the New design grid
- **THEN** chat SHALL open with `/open-design-new wireframe` ready to send

#### Scenario: Claude Code without an argument
- **WHEN** the user runs `/open-design:open-design-new` (Claude Code plugin) with no argument
- **THEN** the agent SHALL list the ready surfaces and ask which one
