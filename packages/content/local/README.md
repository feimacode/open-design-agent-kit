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
  `name` and `description`, optional `argument_hint`, `placeholder` and
  `model_trigger`, then the body). `model_trigger` says when the model should
  reach for the prompt's skill on its own; it is appended to the generated
  Claude Code and Codex skill descriptions. Copied into
  `assets/open-design/prompts/`, then rendered per host (VS Code prompt file,
  MCP prompt, Claude Code and Codex skills).
- `design-systems/<id>/` is one of two shapes, disambiguated by its own file
  set — never both, never a partial set of either:
  - **Override** (`tokens.override.css` only): additive token fixes for an
    *existing* upstream design system. It is a `:root { … }` block copied
    beside the vendored `tokens.css`, which is never modified. Core's
    `resolveDesignSystemTokens()` applies it on top. The id must exist
    upstream, and the directory must contain only this file, or the sync
    fails. The content drift check reports an override that upstream has
    since made redundant. Current overrides fix 8 systems whose upstream
    `tokens.css` still has the placeholder accent `#2563eb`, contradicting
    their own DESIGN.md `**Primary:**` colour: `application`, `bento`,
    `contemporary`, `corporate`, `flat`, `perspective`, `professional`,
    `simple`.
  - **New package** (`DESIGN.md` + `manifest.json` + `tokens.css`, all three
    required): a wholly new, extension-authored design system with no
    upstream counterpart — the mirror image of the override case, and of
    `skills/`: the id must **not** already exist upstream, or the sync
    fails. Same v1 manifest shape as every bundled entry (see
    `design-systems/README.md` upstream, or any bundled `manifest.json` for
    the shape). Copied wholesale into `assets/open-design/design-systems/`
    the same way `skills/<id>/` is.
- `curated.json`: extra entry ids that get a curated slash command even
  though upstream frontmatter doesn't flag them. Read by
  `scripts/curatedEntries.mjs`. An unknown id fails generation.

## Porting a design system from bergside/awesome-design-skills (typeui.sh)

The 16 entries currently under `design-systems/` credited to typeui.sh
(`basic`, `codex`, `fiction`, `geometric`, `immersive`, `impeccable`,
`matrix`, `power`, `pulse`, `riso`, `roku`, `sega`, `sketch`, `square`,
`stitch`, `terracotta`) were each hand-authored against that registry's
`DESIGN.md` prose *and* its `registry-examples/<slug>-marketing.png`
screenshot — not mechanically converted, because typeui's own structured
color fields are genuinely unreliable (its `primary` field is sometimes the
real accent and sometimes just near-black identity ink; body-font fields
are sometimes simply wrong versus the rendered screenshot; `--muted`/
`--border` and the whole type-scale/layout token tier have no typeui
equivalent at all). See `scripts/typeuiExtraction.mjs`'s header comment for
the full list of what's reliable versus what needs a human/agent look.

To port another one (or re-check what's newly worth porting):

```
# See what typeui has that isn't already a richer upstream entry or already ported:
npm run extract-typeui --workspace=@feimacode/open-design-agent-kit-content -- --list-candidates

# Generate a review scaffold for one candidate slug:
npm run extract-typeui --workspace=@feimacode/open-design-agent-kit-content -- <slug>
```

This writes `scripts/.typeui-scaffold/<slug>/` (gitignored) with a
`manifest.json`/`tokens.css`/`DESIGN.md` scaffold plus a `NOTES.md` review
checklist — every field either came from a reliable typeui field or is a
flagged `TODO` placeholder. **This is a starting point, not final
content.** Resolve every item in `NOTES.md` (checking the source prose and
the marketing screenshot), then move the three real files into
`design-systems/<slug>/` here, delete `NOTES.md`, and continue with
`npm run apply-overlay` as above.

Run `npm run apply-overlay --workspace=@feimacode/open-design-agent-kit-content`
to re-apply the overlay without re-cloning upstream. This only refreshes
`packages/content/assets/open-design/` — also run
`node packages/vscode/scripts/copy-content-assets.mjs` (or the full `npm run
sync-content` from the repo root) before committing, so the mirrored copy
under `packages/vscode/assets/open-design/` doesn't drift; `check-content-mirror.mjs`'s
own drift check only compares sync timestamps, so it won't by itself catch a
stale mirror left over from a standalone `apply-overlay` run.
