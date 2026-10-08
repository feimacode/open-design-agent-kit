# dev-doc-templates Specification

## Purpose
Engineering documents grounded in the repository (RFC, ADR, postmortem, PR explainer, changelog page), document templates ported from html-anything with recorded provenance, and a batch flow that turns a folder of Markdown documents into one designed page per file and refreshes only the changed ones.
## Requirements

### Requirement: Engineering Document Skills
The catalog SHALL include local skills `rfc`, `adr`, `postmortem`, `pr-explainer` and `changelog-page`, each with a rendered example and a workflow that tells the agent to gather facts from git (and `gh` when available) or user-named files before writing, to include a Sources section, and to register the files and refs it read as the artifact's `sources`.

#### Scenario: PR explainer for the current branch
- **WHEN** the user asks for a PR explainer of the current branch
- **THEN** the brief SHALL direct the agent to read the branch's commits and diff before writing, and the registered artifact SHALL list what it read in `sources`

#### Scenario: Postmortem without incident notes
- **WHEN** the user asks for a postmortem but gives no timeline or notes
- **THEN** the brief SHALL direct the agent to ask for the incident facts rather than invent them

### Requirement: Ported Document Templates
The catalog SHALL include `exec-briefing-memo`, `experiment-readout`, `competitive-teardown`, `info-funnel` and `article-sketchnote-editorial`, ported from html-anything with their Apache-2.0 notice, a provenance header naming the source path and commit, and an entry in the upstream-ports record.

#### Scenario: Provenance recorded
- **WHEN** the content sync check runs
- **THEN** each ported skill SHALL have a provenance header and be listed in the ports record, or the check SHALL fail

### Requirement: Batch Markdown to HTML
Every host SHALL provide an `open-design-docs` prompt or skill that renders each Markdown file in a user-named folder or glob as its own artifact with one chosen template, registers all of them in one collection with each artifact's `sources` set to its file, asks before processing more than 20 files, and on a re-run only regenerates artifacts whose source file changed.

#### Scenario: ADR folder
- **WHEN** the user runs the docs prompt on `docs/adr/*.md` with 12 files
- **THEN** 12 artifacts SHALL be created in one collection, each listing its ADR file as its source

#### Scenario: Re-run after editing one ADR
- **WHEN** one ADR file changed and the prompt runs again on the same folder
- **THEN** only that ADR's artifact SHALL be regenerated
