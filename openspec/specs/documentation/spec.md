# documentation Specification

## Purpose
Keep the project's help complete and findable: a plain-Markdown `docs/` tree organized by audience (getting started, task guides, reference, troubleshooting, automation, contributing), READMEs that link into it instead of duplicating it, a lint-time check that fails when code gains undocumented tools, settings, variables, commands or flags or when links break, and entry points to the docs from inside every host.
## Requirements
### Requirement: Structured Documentation Tree
The repository SHALL contain a `docs/` tree of plain Markdown, English only, readable on GitHub without a build step, organized as:
- `docs/README.md` (index by audience);
- `getting-started/` (`vscode`, `claude-code`, `codex`, `cli`);
- `guides/` (`generate-a-design`, `design-systems`, `remix-and-gallery`, `social-posts`, `youtube-video`, `export-images`, `export-decks`, `preview-comments-edit`, `figma`, `promote-to-app-code`);
- `reference/` (`tools`, `prompts-and-commands`, `cli`, `settings-and-env`, `artifact-manifest`);
- `troubleshooting.md`;
- `automation/social-pipeline.md`;
- `contributing/` (`architecture`, `content-sync`, `adding-a-skill-or-prompt`, `upstream-ports`, `releasing`).

Every page SHALL start with a single `#` title and be linked from `docs/README.md`.

#### Scenario: Every page is reachable from the index
- **WHEN** the docs tree is checked
- **THEN** every `docs/**/*.md` page except `docs/README.md` and redirect stubs (pages starting "This page moved to …") SHALL be linked, directly or through a section README, from `docs/README.md`, and `npm run lint` SHALL fail naming any page that isn't

#### Scenario: Old Codex link keeps working
- **WHEN** someone follows an existing link to `docs/codex.md`
- **THEN** the page SHALL point them to `docs/getting-started/codex.md`

### Requirement: Host-Neutral Task Guides
Each guide SHALL describe one task once, with per-host differences given as labelled callouts ("In VS Code", "In Claude Code / Codex", "From the CLI") rather than separate per-host pages. Each guide SHALL state its prerequisites, the steps, and the files it produces with their paths, and SHALL link to the relevant troubleshooting entries and reference entries.

#### Scenario: Deck export guide covers all hosts
- **WHEN** a reader opens `guides/export-decks.md`
- **THEN** it SHALL explain PPTX and PDF export, `slides`, `deck`, and page PDFs, give the VS Code, Claude Code / Codex and CLI invocations as callouts, and link to `reference/tools.md#export_open_design_artifact` and the relevant troubleshooting entries

### Requirement: Single Source of Truth Between READMEs and Docs
Tool arguments, VS Code settings, environment variables, CLI flags and command lists SHALL be documented in full only under `docs/reference/`. The root and package READMEs SHALL be landing pages (pitch, install, quick start, screenshots, tool names only) that link into `docs/`. READMEs published to the VS Code Marketplace or npm SHALL use absolute GitHub URLs for links into `docs/`.

#### Scenario: Settings table lives in one place
- **WHEN** the VS Code README is read after this change
- **THEN** it SHALL link to `reference/settings-and-env.md` rather than repeating the settings table

#### Scenario: Marketplace README links work off-GitHub
- **WHEN** `packages/vscode/README.md` is rendered on the Marketplace
- **THEN** every link into the docs SHALL be an absolute `https://github.com/feimacode/open-design-agent-kit/blob/main/docs/...` URL

### Requirement: Reference Completeness Check
`npm run lint` SHALL run a docs check that fails, listing every problem, when:
- any language-model or MCP tool lacks a `### <tool name>` section in `reference/tools.md`, or any of its input properties is not mentioned in that section;
- any `openDesign.*` setting or any `OPEN_DESIGN_*` environment variable referenced in package source (excluding tests) lacks a heading in `reference/settings-and-env.md`;
- any VS Code command id is missing from `reference/prompts-and-commands.md`;
- any CLI command lacks a `### <command>` section in `reference/cli.md`, or any of its options is not mentioned in that section.

#### Scenario: New tool without docs
- **WHEN** a developer adds a tool to `languageModelTools` and runs `npm run lint` without documenting it
- **THEN** lint SHALL fail, naming the tool and the expected `### <name>` heading in `reference/tools.md`

#### Scenario: New CLI flag without docs
- **WHEN** a developer adds `.option('--foo <x>')` to the `export` command without documenting it
- **THEN** lint SHALL fail, naming `--foo` and the `### export` section of `reference/cli.md`

### Requirement: Link Integrity Check
The docs check SHALL verify that every relative Markdown link in `docs/**/*.md`, `README.md` and `packages/*/README.md` resolves to an existing file, that any `#fragment` matches a heading slug in the target (GitHub slug rules), and that absolute links to this repository's `blob/main/` paths point to files that exist locally.

#### Scenario: Broken anchor
- **WHEN** a guide links to `../troubleshooting.md#no-browser-found` but no heading with that slug exists
- **THEN** lint SHALL fail, naming the source file, the link and the missing anchor

### Requirement: In-Product Help Entry Points
Each host SHALL lead users to the docs from where they already are:
- the VS Code extension SHALL contribute a "Get started with Open Design" walkthrough whose steps run the relevant commands or chat prompts and link to the matching guides, and an "Open Design: Open Docs" command that opens `docs/README.md` in the browser;
- the overview `open-design` skill, as shipped for Claude Code, Codex and the CLI's `init`, SHALL end with a Help section linking to the docs index, troubleshooting, and the social-post and export guides;
- the CLI's `--help` output SHALL end with the CLI reference URL.

#### Scenario: VS Code walkthrough
- **WHEN** a user opens Welcome → Walkthroughs in VS Code with the extension installed
- **THEN** "Get started with Open Design" SHALL be listed, and its steps SHALL cover generating a design, the gallery, design systems, social posts and export, each linking to its guide

#### Scenario: Open Docs command
- **WHEN** the user runs "Open Design: Open Docs"
- **THEN** the docs index SHALL open in the external browser

#### Scenario: CLI help
- **WHEN** a user runs `npx @feimacode/open-design-agent-kit --help`
- **THEN** the output SHALL end with the URL of `docs/reference/cli.md`

