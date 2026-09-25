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
- `design-systems/<id>/tokens.override.css`: additive token fixes for an
  upstream design system. It is a `:root { … }` block copied beside the
  vendored `tokens.css`, which is never modified. Core's
  `resolveDesignSystemTokens()` applies it on top. The id must exist upstream,
  and the directory must contain only this file, or the sync fails. The
  content drift check reports an override that upstream has since made
  redundant. Current overrides fix 8 systems whose upstream `tokens.css`
  still has the placeholder accent `#2563eb`, contradicting their own
  DESIGN.md `**Primary:**` colour: `application`, `bento`, `contemporary`,
  `corporate`, `flat`, `perspective`, `professional`, `simple`.
- `curated.json`: extra entry ids that get a curated slash command even
  though upstream frontmatter doesn't flag them. Read by
  `scripts/curatedEntries.mjs`. An unknown id fails generation.

Run `npm run apply-overlay --workspace=@feimacode/open-design-agent-kit-content`
to re-apply the overlay without re-cloning upstream.
