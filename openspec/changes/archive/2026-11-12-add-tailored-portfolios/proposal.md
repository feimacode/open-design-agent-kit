## Why

The general portfolio site is rarely what gets sent. Each application, pitch and review gets its own cut (portfolio study, 2026-11-07):

- **A job application** wants the 3 to 5 projects closest to the role, often a PDF attached beside the link.
- **A client pitch** wants only work from the client's industry or problem, results in their terms, and often a concept for their own site, sent as a PDF or link before a call.
- **A school or programme application** goes through SlideRoom or similar, with limits per file (SlideRoom: images under 5 MB, PDF under 10 MB, a title per item) and per school (piece or page counts).
- **A promotion packet** is internal and confidential, judged on impact against the level's criteria.

Each needs different projects, order, privacy and limits. Without support, designers copy the site by hand and edit it, which is where the wrong project or an NDA screen slips in. This change adds tailored versions built from the work library (add-work-library) and enforces privacy where it matters: at export and publish.

## What Changes

- **Targets.** A target is one situation: `portfolio/targets/<slug>.json` with a kind (`job`, `client`, `school`, `promotion`, `general`), a name (company, client or school), notes (the job ad, client brief or level criteria the designer pastes), the projects picked and their order, a privacy ceiling, the outputs wanted (site, PDF, deck, image set), a cover note, and limits.
- **New MCP tool `save_open_design_portfolio_target`.** Validates a target, fills default limits for its kind, and returns a suggested project order: projects whose tags and decisions match words in the notes first. The agent and designer decide; the tool only suggests.
- **Outputs per target.** The portfolio recipes (add-portfolio-site-and-deck) accept `target`:
  - **Site variant:** published at its own path, unlisted by default (noindex, not linked from the general site).
  - **PDF:** one page per section at A4, Letter or 16:9, compressed to the target's size limit by lowering image quality, never by dropping pages.
  - **Deck:** the interview deck with the target's projects.
  - **Image set** (schools): one file per piece, titled, each under the image limit, with the piece count checked.
- **Kind-specific parts.**
  - Client: an optional "For you" section linking a redesign concept and before/after page of the client's own site (add-redesign-from-url, add-before-after).
  - Promotion: a criteria map that lists each pasted criterion with the projects and outcomes that show it, and leaves a criterion empty rather than stretching evidence. Promotion outputs export only; they can't be published to a public host.
  - Job: the cover note at the top of the PDF and site variant, from the designer's words.
- **Privacy at export and publish.** Each target has a ceiling: `public`, `unlisted` or `internal`. Export and publish SHALL refuse an output that contains a project or asset above its ceiling, naming each item. The ceiling also limits the publish providers offered: `internal` allows file export only; `unlisted` allows a Claude artifact (private until shared) or a host where the designer adds a password.

## Capabilities

### New Capabilities
- `portfolio-targets`: target files, the save tool, outputs per target, size and count limits, and the kind-specific parts.
- `portfolio-privacy`: the privacy ceiling, refusal at export and publish, and the provider rule.

### Modified Capabilities
None in the main specs. Export and publish gain a refusal driven by portfolio privacy; their existing requirements are unchanged.

## Impact

- `packages/core/src/portfolio/targets.ts` (schema, default limits per kind, suggested order), `privacy.ts` (ceiling check shared by export and publish).
- `exportArtifact.ts`: PDF size budget by image quality; image-set export for schools. Publish instructions: privacy check and the provider rule.
- MCP and VS Code: `save_open_design_portfolio_target`; recipe briefs accept `target`.
- Docs `guides/portfolio.md` (tailored versions, privacy), `reference/tools.md`, CHANGELOG; eval briefs: a job target from a pasted ad and a school target with a 10 MB PDF limit.
- Depends on add-work-library and add-portfolio-site-and-deck.
