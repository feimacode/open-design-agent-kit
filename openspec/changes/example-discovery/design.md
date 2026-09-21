## Context

Fully agreed with the user this session (4 options explored, 2 approved: a filter param + a generated reference file). This design just pins down the exact shapes before implementing.

## Goals / Non-Goals

**Goals:**
- Let a model cheaply ask "just the remixable examples" from `list_open_design_skills`.
- Give Claude Code and Codex a skimmable, no-tool-call catalog of all 167 examples via each platform's own documented progressive-disclosure mechanism.

**Non-Goals:**
- Per-example pinned commands/skills (id-collision cost, see proposal.md).
- MCP resources (unverified client support).
- Changing `remix_open_design_example` or `prepare_open_design_brief` themselves — this is discovery-only.

## Decisions

### 1. Filter shape: `source` (exact) + `remixableOnly` (boolean), both optional, both composable with the existing `query`/`mode`
**Decision:** `ContentIndex.listSkills(query?, mode?, source?, remixableOnly?)`. `source` matches exactly against `skill`/`design-template`/`example`. `remixableOnly: true` keeps only entries with a non-empty `exampleArtifactPath` (this is actually the more useful of the two for the stated goal — `source === 'example'` and `remixableOnly` are equivalent today since only examples ever set `exampleArtifactPath`, but keeping them as two independent params is honest about them being conceptually different questions ("what kind of entry is this" vs "can I remix it") that only happen to coincide currently, and doesn't lock in that coincidence as a permanent invariant of the schema).
**Alternatives considered:** a single `remixableOnly` boolean only — rejected, `source` is independently useful for "show me only design-templates" style queries unrelated to remixing, and costs nothing extra to add alongside.

### 2. Reference file: `references/remixable-examples.md`, grouped by `mode`, full pool
**Decision:** `references/remixable-examples.md` (matches Codex's structured `references/` folder expectation; Claude Code's own naming is freeform, so using the same path for both keeps one identical file, not two renamed copies). Content is the full 167-example pool — grouping by `mode` (`prototype`, `deck`, `design-system`, `image`, `video`, `template`, `utility`, `audio`, `other`), not `category`: checked real data before deciding — `mode` is 100% populated (matches the primary organizing facet the rest of this system already uses for `od:<mode>:<name>` ids), `category` is only 59% populated among examples, which would leave a large uncategorized bucket. Each line: `- **<id>** — <display name>: <description>` (using the plain, human-facing `id` exactly as `list_open_design_skills` returns it, so a model can quote it back verbatim as `remix_open_design_example`'s `skillId`).
**Alternatives considered:** curated/featured-only subset — rejected per the earlier exploration: the whole point of this file is covering the long tail a tool round-trip would otherwise be needed for; the curated slice already gets pinned commands via the existing (unchanged) generators.

### 3. Shared generation lives in `packages/content`, alongside `curatedEntries.mjs`
**Decision:** new `packages/content/scripts/remixableExamplesReference.mjs`, exporting a pure `buildRemixableExamplesReference(assetsRoot)` returning the markdown string — read via `ContentIndex`-equivalent logic (reuse the same SKILL.md-parsing shape `curatedEntries.mjs` already has, filtered to `examples/` with a non-empty `example.html`) so it doesn't need `packages/core` as a dependency (matches `curatedEntries.mjs`'s own existing pattern of independent, duplicated-on-purpose parsing rather than importing core — these generator scripts run outside any TS build step). Both `packages/claude-plugin/scripts/generate-claude-skills.mjs` and `packages/codex/scripts/generate-codex-skills.mjs` import it and write the returned string to their respective `skills/open-design/references/remixable-examples.md`, and both append a link to it from the overview `SKILL.md` body (the hand-authored source lives in `packages/claude-plugin/skills/open-design/SKILL.md`; Codex's copy is already a mechanical copy of that file per the existing `generate-codex-skills.mjs`, so adding the link once there is enough for both — verify during implementation that the existing copy step doesn't need special-casing for the new `references/` subdirectory).
**Alternatives considered:** generating it fresh independently in each of the two generator scripts — rejected, duplicates the SKILL.md-parsing logic a third time in this codebase for no reason.

### 4. Drift guard
**Decision:** extend `packages/claude-plugin/scripts/check-skills-sync.mjs` and `packages/codex/scripts/check-codex-skills-sync.mjs` to also recompute and diff `references/remixable-examples.md`'s expected content, rather than adding a fifth standalone guard script — it's checking the same generated-output-vs-source invariant those two scripts already check for everything else under `skills/open-design/`.
**Alternatives considered:** a separate guard script — rejected as unnecessary process proliferation for content that's part of the same skill directory these two scripts already own.

## Risks / Trade-offs

- **[Risk]** `packages/cli`'s existing wholesale mirror (`copy-skill-content.mjs`, `fs.cp(..., { recursive: true })`) should pick up the new `references/` subdirectory automatically since it copies whole directory trees — verify this by actually inspecting its output after regenerating, not by assuming recursive copy covers it.
- **[Trade-off]** A model must actually follow the SKILL.md's link to load the reference file — unlike a tool call, there's no guarantee it does. Accepted: this is exactly the trade-off Claude Code's own docs describe as the intended behavior of progressive disclosure (loaded when relevant, not forced), and the `list_open_design_skills` filter (Decision 1) remains available as the always-reliable fallback path.
