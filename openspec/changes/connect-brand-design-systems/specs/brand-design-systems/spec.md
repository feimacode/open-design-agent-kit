## ADDED Requirements

### Requirement: Own Brand Naming

The custom design system instructions SHALL use the heading `# <Name> Design System` when the system is the person's own brand and `# Design System Inspired by <Name>` when it is a reference, taking the kind from `brand.json` or a `kind` input on `create_open_design_design_system`.

#### Scenario: Own brand heading
- **WHEN** the person saves their own brand "Acme" from an extraction
- **THEN** DESIGN.md starts with `# Acme Design System` and the system's display name does not contain "Inspired by"

### Requirement: Own Brand Recommendation

The recommender SHALL rank user design systems whose `brand.json` kind is `own` first unless the profile names another brand or lists the system under `avoid`, SHALL read their moods, industries and surfaces from `brand.json`, and `prepare_open_design_brief` SHALL add a note when an own-brand system exists and is not active.

#### Scenario: Poster for your brand
- **WHEN** the workspace has an own-brand system `user:acme` and the agent asks for recommendations for "a launch poster" with no brand named
- **THEN** `user:acme` is the first recommendation

#### Scenario: Another look named
- **WHEN** the profile's `likeBrands` names Linear
- **THEN** Linear's system ranks above `user:acme`

### Requirement: Brand Findings

When the active design system is an own brand, the check SHALL report `brand-off-palette` when a painted colour covering more than 1% of the page is more than ΔE 6 from every colour token and its tints, and `brand-font` when body or heading text uses a family outside the system's font stacks. Both SHALL be warnings that `data-od-allow` suppresses.

#### Scenario: Off-palette band
- **WHEN** a page on `user:acme` has a full-width teal band and Acme's tokens have no colour near teal
- **THEN** the check warns `brand-off-palette` naming the band and the nearest token

### Requirement: Brand Marks and Taste Exemption

When the active design system is an own brand, the check SHALL skip the `slop-glow` indigo rule when that indigo is the system's own `--accent`, and SHALL add a `brand-mark-missing` note for posters, social posts and decks that show no logo when the brand has one.

#### Scenario: Poster without the logo
- **WHEN** a poster on an own-brand system with a logo shows no logo
- **THEN** the check adds a `brand-mark-missing` note

#### Scenario: Indigo brand
- **WHEN** the active own-brand system's `--accent` is `#6366f1`
- **THEN** the check does not report `slop-glow` for the accent being a Tailwind indigo

### Requirement: Critic Brand Input

For an own-brand system, the critic's input SHALL include the brand's reference screenshot, component specs and voice facts, and its `fit` score SHALL be judged against them.

#### Scenario: Off-voice headline
- **WHEN** the brand's voice facts say sentence case and no exclamation marks, and the design's headline is "AMAZING DEALS!!!"
- **THEN** the critic's fit note names the voice mismatch

### Requirement: Showcase Review With Fidelity Findings

The extraction review page SHALL render the draft with the design system showcase renderer and the measured component specs beside the site screenshot, and checking a page marked `data-od-brand-review` SHALL report `brand-fidelity` findings where the showcase's measured accent, text colours, fonts, radii or button height differ from the evidence, giving both values.

#### Scenario: Rounder buttons on the site
- **WHEN** the site's primary button radius is 999 px and the showcase's is 8 px
- **THEN** the check reports `brand-fidelity` for button radius with 999 px and 8 px

### Requirement: Design System Export Tool

The kit SHALL provide `export_open_design_design_system`, which writes a design system in Claude Design's `project/` format into the output folder, including the brand's logo and icons under `project/assets/` for own brands and a fonts note, plus a registered `brand.html` page, and returns the files written; it SHALL be offered locally and on the hosted gateway and SHALL NOT need a repository checkout.

#### Scenario: Export from the Claude plugin
- **WHEN** a Claude Code user with the plugin installed asks to put `user:acme` into Claude Design
- **THEN** the tool writes `project/design-system.json`, `project/tokens.json`, `project/README.md`, `project/assets/logo.svg` and `brand.html`, and the agent can publish them with its Artifact tool

### Requirement: Project DESIGN.md Offer

When saving an own-brand system, the extraction skill SHALL offer to write the project-root DESIGN.md through `set_active_design_system` with `writeProjectDesignMd`, saying that other design tools in the project read it.

#### Scenario: Offer at save
- **WHEN** the person saves their own brand and the project has no root DESIGN.md
- **THEN** the agent offers to write it and names the tools that read it

### Requirement: Brand Refresh Diff

`extract_open_design_design_system` SHALL accept `compareTo` naming a user design system, extract from the URLs recorded in its `brand.json`, and return the tokens, fonts, component specs and marks added, changed or removed, without changing the design system.

#### Scenario: Site changed its accent
- **WHEN** the site's primary button changed from `#0b5fff` to `#0047e0` since `user:acme` was saved
- **THEN** the diff lists `--accent` as changed from `#0b5fff` to `#0047e0`, and `user:acme`'s files are unchanged
