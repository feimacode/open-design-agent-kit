## Context

Local skills live in `packages/content/local/skills/<id>/` and are copied into the assets by the overlay, with collision checks. `read_open_design_source` and the deck-from-source flow already establish the "facts come only from the sources" discipline, including a number check (`sourceNumberCheck.ts`). html-anything's templates follow the same SKILL.md convention with extra frontmatter (`mode`, `scenario`, `surface`).

## Goals / Non-Goals

**Goals:** documents engineers want to send around, grounded in the repo, consistent with the design system; a batch path for existing Markdown documents.

**Non-Goals:**
- Writing into `docs/` by default. Artifacts stay in the output directory; the user can move them, and placing them next to their sources can come later.
- A static-site generator.
- Pushing PR descriptions to GitHub. The agent can do that with `gh` if the user asks.

## Decisions

### D1. Local skills, not host overrides
These are new surfaces, not changes to vendored ones, so they belong in `local/skills` like `social-youtube-thumbnail`.

### D2. Port html-anything templates with provenance
Copy the SKILL.md and the example, keep the Apache-2.0 notice, and add a header naming the source repo, path and commit. Adapt the frontmatter to our `od:` shape (`mode`, `scenario`, `example_prompt`, design-system requirements). Record the divergences in `SOURCE.md`, following the upstream-ports rules.

### D3. Grounding via the agent's own tools
Each skill's workflow lists the commands to run (`git log --oneline <range>`, `git diff --stat`, `gh pr view --json title,body,files`) and requires a "Sources" footer. The registered `sources` make later drift visible. *Alternative:* a `read_git_history` tool. It's redundant with the agent's terminal and is host-specific.

### D4. Batch is a prompt over existing tools
For each file: `read_open_design_source`, then `prepare_open_design_brief` with the chosen skill and the shared `collectionId`, then write and register (with `sources`). The prompt caps one run at 20 files and asks before doing more.

## Risks / Trade-offs

- [Postmortems and RFCs can contain sensitive content] → artifacts stay local. The instructions already require explicit consent before anything is published.
- [Ported templates drift from html-anything] → the provenance header and `SOURCE.md` make comparison possible; no automatic sync.

## Migration Plan

Additive content.

## Open Questions

- Should RFC and ADR artifacts carry a machine-readable status (`data-od-status`) so a future index page can list them? Proposed: yes, cheap.
