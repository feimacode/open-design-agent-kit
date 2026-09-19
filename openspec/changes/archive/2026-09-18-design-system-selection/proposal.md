# Design system selection: manifest.json, category filtering, browse command

## Why

Reviewing design-system selection UX surfaced that `ContentIndex` had been regex-parsing each `DESIGN.md`'s leading heading and blockquote to get a name/summary — fragile, and missing a much cleaner canonical source: every design system directory actually ships a `manifest.json` (`id`/`name`/`category`/`description`, plus a `craft.suggested` list and token/component file references) alongside `DESIGN.md`. `prepare_open_design_brief` was also blanket-applying all ~11 craft docs to every generation regardless of the active design system's own `craft.suggested` recommendation.

Separately, design systems are structurally unlike skills for selection purposes: 152 flat, equally-valid named brands with a real ~22-category taxonomy but no `featured`/`recommended`-style curation signal. The `add-open-design-tools`/`expand-skill-catalog-and-curated-prompts` slash-command approach doesn't transfer — 152 slash commands would flood the `/` autocomplete worse than skills did, with no signal available to shrink the set. A different, complementary mechanism was needed for confident large-flat-list picking: VS Code's own `showQuickPick` (the same mechanism the Command Palette itself uses for thousands of entries) combined with `workbench.action.chat.open`'s `{ query, isPartialQuery: true }` to hand a selection into an editable chat message — both stable, non-proposed APIs. A custom `#design-system` chat-variable with inline completion (the closest in-chat-native analog) was considered and deferred: `registerChatVariableResolver` is confirmed still a proposed API.

## What Changes

- `ContentIndex` reads `manifest.json` (`name`, `category`, `description`, `craft.suggested`) as the canonical source per design system, falling back to the DESIGN.md heading/blockquote parser only for the small number of legacy folders that ship `DESIGN.md` without a `manifest.json`.
- `list_open_design_design_systems` gains an exact `category` filter parameter (alongside the existing free-text `query`, which now also matches against `category`), and returns each result's `category`.
- `prepare_open_design_brief` now narrows the applied craft-rule set to the active design system's `craft.suggested` list when non-empty, instead of unconditionally applying all vendored craft docs; behavior when no design system is active, or a legacy one with no suggestion list, is unchanged (all craft docs still apply).
- New command `openDesign.browseDesignSystems` ("OpenDesign: Browse Design Systems"): a category-grouped, fuzzy-searchable `QuickPick` over all vendored design systems; selecting one opens Copilot Chat via `workbench.action.chat.open` with a prefilled, still-editable message naming that design system.
- `scripts/sync-open-design-content.mjs` now also copies each `manifest.json` (best-effort — not required, to keep legacy DESIGN.md-only folders working).

## Capabilities

### Modified: `open-design-tools`

Design system discovery now uses each entry's canonical `manifest.json` metadata, supports category-based filtering, and offers a native command-palette browsing path alongside the existing tool-based discovery; craft-rule application respects each design system's own suggestions rather than applying everything unconditionally.

## Impact

- `assets/open-design/design-systems/<id>/manifest.json` is now vendored alongside `DESIGN.md` where upstream provides one (152 of 152 in the current sync).
- New file: `src/extension/commands/browseDesignSystemsCommand.ts`; new `contributes.commands` entry in `package.json`.
- No breaking change to the `prepare_open_design_brief` tool's input/output contract — the craft-narrowing is an internal quality improvement, not a schema change.
