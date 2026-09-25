# Local content overlay

Extension-owned content layered on top of the vendored upstream catalog.
Upstream files under `assets/open-design/` are never hand-edited. Everything
the extension adds lives here instead:

- `skills/<id>/SKILL.md`: extension-authored skills, in the same frontmatter
  shape as upstream skills. They are copied into `assets/open-design/skills/`
  by `scripts/apply-local-overlay.mjs`, which `npm run sync` runs
  automatically after the upstream copy. An id that collides with an upstream
  skill or design template fails the sync.
- `prompts/<name>.md`: hand-written, host-agnostic prompts (frontmatter
  `name` and `description`, then the body). Copied into
  `assets/open-design/prompts/`, then rendered per host (VS Code prompt file,
  MCP prompt, Claude Code and Codex skills).
- `curated.json`: extra entry ids that get a curated slash command even
  though upstream frontmatter doesn't flag them. Read by
  `scripts/curatedEntries.mjs`. An unknown id fails generation.

Run `npm run apply-overlay --workspace=@feimacode/open-design-agent-kit-content`
to re-apply the overlay without re-cloning upstream.
