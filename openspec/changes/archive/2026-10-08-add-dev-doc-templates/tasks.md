## 1. Engineering skills

- [x] 1.1 `rfc` and `adr` skills (status banner, `data-od-status`, supersedes links) with examples from this repo's openspec history
- [x] 1.2 `postmortem` skill (impact, timeline, causes, actions) with a fictional-but-realistic example clearly labelled as a sample
- [x] 1.3 `pr-explainer` (commit/diff/gh grounding, before/after via the visual check, file tour) and `changelog-page` (tags and commits) with examples from this repo

## 2. Ports

- [x] 2.1 Port the five html-anything templates into `local/skills/` with provenance headers, adapted frontmatter and examples
- [x] 2.2 Record the ports in `docs/contributing/upstream-ports.md` and `SOURCE.md`; add a provenance check to the content sync check

## 3. Flows

- [x] 3.1 `local/prompts/docs.md` (`/open-design-docs`): batch over a folder or glob, a shared collection, `sources`, a 20-file confirmation, regenerate only changed files; regenerate host prompts and skills
- [x] 3.2 Document surface entries; instructions (engineering documents ground in git; never invent incident facts)

## 4. Docs and verification

- [x] 4.1 Guide "Engineering documents"; reference; docs check
- [ ] 4.2 Manual: an RFC from an openspec change, a PR explainer of a branch, and a batch run over a folder of ADRs, in VS Code and Claude Code
