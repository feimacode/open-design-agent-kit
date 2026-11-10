## Why

Designers don't keep one portfolio. They keep one body of work and cut it again for each situation: a job application, the portfolio interview, a post asking peers for a review, a client pitch, a marketplace profile, Dribbble and Behance posts, a school application and a promotion packet (portfolio study, 2026-11-07: https://claude.ai/artifact/9Ym9GayAcR2Rmz4V1xXjXT). Each situation has a different reader, format and set of rules, but the same facts: the role, the team, the dates, the decisions and the results.

Today the kit treats every design as new work from a brief. That causes three problems for portfolios:

- **The work can't get in.** `write_open_design_file` takes one base64 image of up to 5 MiB at a time, with no resizing, compression or alt text. `pull_open_design_figma_frame` rebuilds a Figma frame as code instead of bringing it in as a picture. Live products can't be captured, even though the site audit already captures live pages.
- **Facts drift.** The role, dates and results get retyped into every brief, so the site, the PDF and the posts can disagree, and the agent may fill gaps with invented numbers.
- **Privacy is all or nothing.** Some work is under NDA or internal only. Nothing records which projects or images may appear where.

This change adds the foundation the other portfolio changes build on: add-portfolio-site-and-deck, add-tailored-portfolios and add-portfolio-share-and-review.

## What Changes

- **A work library in the designs folder.** `portfolio/library.json` holds the owner (name, role, location, contact links, short bio) and the project list. Each project has `portfolio/projects/<slug>/project.json` and an `assets/` folder. A project records its title, company or client, role, team, dates, platforms, problem, constraints, key decisions (the choice, the options rejected, why, the trade-off), outcomes (each with a value and a source: measured, estimated or qualitative), links (live, prototype, write-up) and tags.
- **Privacy levels.** Every project and asset has a level: `public`, `unlisted` or `internal`. An asset may be stricter than its project, never looser. Assets can carry redaction boxes that blur parts of an image wherever it is used.
- **New MCP tool `import_open_design_work`.** Brings assets into a project from:
  - files in the workspace (images, MP4, PDF pages);
  - Figma frames, as pictures, through the user's Figma connector or token;
  - live URLs, captured at desktop and phone sizes, full page or first screen;
  - designs made with the kit, captured from their entry path.
  Every image is stripped of EXIF and location data, resized to at most 2800 px wide, and stored as WebP at 800, 1400 and 2800 px wide with a PNG or JPEG original kept for print. Each asset needs alt text: the agent drafts it, and it stays marked as a draft until the designer confirms it.
- **New MCP tools `save_open_design_project` and `get_open_design_library`.** Save validates a project against the schema and returns the fields still missing. Get returns the library, with each project's completeness and privacy.
- **No invented facts.** Briefs that use the library tell the agent to ask for missing facts with the questions picker, and never to make up an outcome, a metric, a team member or a client name. An outcome without a source is shown as qualitative.
- **Your own style.** The library can name a design system as its style. The portfolio recipes offer to build one from the designer's current site, their Figma or Canva files, or screenshots of their own work, using the existing extraction tools, so a portfolio looks like its owner and not like the kit's defaults.

## Capabilities

### New Capabilities
- `work-library`: the library files and schema, privacy levels and redaction, importing assets, the tools that save and read it, the no-invented-facts rule and the library's style.

### Modified Capabilities
None. Extraction, live capture and the Figma integration keep their requirements; this change calls them.

## Impact

- New `packages/core/src/portfolio/` (`library.ts` schema and read/write, `importWork.ts`, `imageVariants.ts`, `redaction.ts`), using `export/livePage.ts` for captures and the Figma integration for frame pictures.
- MCP `session.ts`/`tools.ts`: three tools; annotations; `write_open_design_file` refuses paths under `portfolio/` (the tools own them). VS Code tool parity.
- Hosted gateway: library kept per project; live URL capture hidden (the hosted server doesn't fetch websites); Figma import only through the user's Figma connector.
- Skills: overview skill names the library; a `work-library` craft note for briefs.
- Docs `guides/portfolio.md` (library section), `reference/tools.md`, CHANGELOG. Unit tests for schema, privacy inheritance, image variants and EXIF stripping; an eval fixture library with three projects.
