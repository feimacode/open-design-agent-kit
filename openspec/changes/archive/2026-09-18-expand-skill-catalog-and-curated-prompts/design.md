# Design: catalog expansion + selection UX

## Why not one slash command (or one chat participant) per skill

At 277 total entries (163 skills + 114 design-templates), both "generate a `chatPromptFile` for every entry" and "register a chat participant per entry" were considered and rejected:

- **All 277 as slash commands**: `contributes.chatPromptFiles` would need ~277 statically-declared entries. Every user would see all 277 in the `/` autocomplete on every chat message, for every skill regardless of whether they've ever used OpenDesign for that kind of artifact. Pure UX flooding, no offsetting benefit over the existing semantic-match flow for the long tail.
- **A participant per skill, or sub-commands under one `@open-design` participant**: VS Code's custom chat *modes* aren't even extension-contributable (`microsoft/vscode#251580`). A chat *participant*'s `/sub-commands` are, like prompt files, a statically-declared package.json array — so this hits the identical 277-entry scaling wall, while also reintroducing the `@mention` friction and bespoke-conversation-loop cost the project already decided against in `add-open-design-tools/design.md`. It buys nothing over a curated prompt-file subset for solving the actual problem (selection ambiguity for a specific, nameable entry), at strictly higher cost.

Worth being explicit about a cross-agent-portability question raised in the same discussion: every mechanism available here — `languageModelTools`, `chatInstructions`, `chatPromptFiles`, chat participants — is VS Code/Copilot Chat API surface. None of them run inside Claude Code CLI, Codex CLI, or similar. That was already true the moment this project chose "drive this from VS Code chat" as its premise (see `add-open-design-tools/design.md`); it isn't specific to the participant-vs-tools choice. If true cross-agent portability matters later, the actually-portable artifact is the raw `SKILL.md` files themselves — open-design's own `docs/skills-protocol.md` states they're already Claude-Code-Skills-format-compatible, so dropping vendored files into a project's `.claude/skills/` would work for Claude Code with no VS Code extension involved at all. That's a separate distribution question, orthogonal to anything this extension's contribution points decide.

## Curation signal for the "featured" subset

Upstream frontmatter carries three inconsistent curation signals, not one clean field:

- A top-level `featured: N` integer rank (0–1 scale style values also exist nested under `od.featured` for a handful of entries — a different, seemingly separate signal from a different curation pass; not used here since it's inconsistent in scale and mostly redundant with the top-level one).
- A top-level `recommended: N` integer rank, present on a subset that mostly (not entirely) overlaps with `featured`.
- `od.default_for: <kind>` — marks a design-template as the canonical default for an artifact kind. Only one entry in the current sync carries this (`design-templates/guizang-ppt`, `default_for: deck`) — and it's exactly the entry that prompted this whole investigation, so it was important this signal wasn't missed.

Rule adopted: an entry is "featured" if *any* of `featured`, `recommended`, or `od.default_for` is present in its frontmatter, regardless of the specific value. This is a presence check, not a threshold — the values aren't on comparable scales across signals, so thresholding would be arbitrary. Union across skills + design-templates currently yields 23 entries, which is a defensible size for a `/` autocomplete list.

## Display name and matching improvements

`name` in upstream frontmatter is frequently a machine slug identical to the directory id (e.g. `magazine-web-ppt` for the guizang-ppt template) — the actual human-facing title lives in `en_name`. `ContentIndex` now prefers `en_name`, falling back to `name`, falling back to the directory id. `tags` (present on many entries, especially design-templates and newer skills) is merged into the same matching haystack as `triggers` so query-based filtering and the model's own semantic matching both see the fuller signal set.
