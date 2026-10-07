## Why

Developers are the audience that already has the agent, and they write a lot of documents: RFCs, ADRs, postmortems, PR descriptions, release notes. These go to people who read them in a browser, not in a terminal. The "HTML, not Markdown, for what humans read" argument fits this audience exactly, and the agent can read the git history and the code that these documents describe. Today the catalog has a few engineering surfaces (`pm-spec`, `eng-runbook`, `release-notes-one-pager`, `weekly-update`, `meeting-notes`) but none of the core decision and incident documents. html-anything has five strong document templates we don't have: `exec-briefing-memo`, `experiment-readout`, `competitive-teardown`, `info-funnel` and `article-sketchnote-editorial`.

## What Changes

- **New local skills for engineering documents.** Each has a real example rendered from this repo's own history, and each is styled by the active design system.
  - **`rfc`:** problem, goals and non-goals, a proposal with alternatives, risks, rollout, open questions, and a status banner.
  - **`adr`:** context, decision, consequences, status, and links to the ADRs it supersedes or is superseded by.
  - **`postmortem`:** a summary with impact numbers, a timeline, root cause with contributing factors, what went well and badly, and action items with owners.
  - **`pr-explainer`:** what changed and why, a before/after section with screenshots taken by the visual check, a risk and test plan, and a file-by-file tour.
  - **`changelog-page`:** a multi-release changelog grouped by version, drawn from tags and commits.
- **Five ported templates from html-anything** (Apache-2.0), each with a provenance header and an entry in the upstream-ports record: `exec-briefing-memo`, `experiment-readout`, `competitive-teardown`, `info-funnel`, `article-sketchnote-editorial`.
- **Grounding from git.** The skills tell the agent to collect facts itself before writing: the commit range, the diff, PR metadata via `gh` when it's available, and incident notes the user points to. Every claim must come from those sources, and the files read are recorded as the artifact's `sources`. There's no new git tool; the agent already has a terminal or file tools.
- **Batch Markdown → HTML.** A host prompt, `/open-design-docs`, renders a folder of existing Markdown documents (for example `docs/adr/*.md`) one artifact per file. Every file gets the same template, the set is grouped as one collection, and each artifact links its source file. Re-running it updates the artifacts whose sources changed (using `stale-sources` when add-codebase-diagrams has landed; otherwise by comparing the file to the registered source).
- **The Document surface** lists the new skills.

## Capabilities

### New Capabilities
- `dev-doc-templates`: the five engineering skills, the five ported templates, git-grounded writing, and batch Markdown → HTML.

### Modified Capabilities
<!-- None. -->

## Impact

- `packages/content/local/skills/` (10 new skills with examples), the content overlay, surface entries.
- `packages/content/local/prompts/docs.md`, regenerated on every host.
- `docs/contributing/upstream-ports.md` and a new `SOURCE.md` note for the html-anything ports.
- No code changes in core beyond what other changes provide. No new dependencies.
