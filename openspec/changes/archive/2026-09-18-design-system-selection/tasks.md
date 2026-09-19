# Tasks: design-system-selection

## 1. Explore

- [x] Discover `design-systems/<id>/manifest.json` as the canonical, previously-unread metadata source
- [x] Confirm 152/152 vendored design systems have both `DESIGN.md` and `manifest.json` in the current sync
- [x] Establish the real category taxonomy (~22 categories) as a structural difference from skills' curation-signal shape
- [x] Confirm `workbench.action.chat.open` supports `{ query, isPartialQuery: true }` (stable, built-in command)
- [x] Confirm `registerChatVariableResolver` is still a proposed API — defer rather than build on it

## 2. Implement

- [x] `scripts/sync-open-design-content.mjs`: copy `manifest.json` alongside `DESIGN.md` (best-effort, not required)
- [x] `ContentIndex`: read `manifest.json` (name/category/description/craft.suggested) as canonical, fall back to heading/blockquote parsing when absent
- [x] `ContentIndex.listDesignSystems`: add exact `category` param, match `category` in free-text `query` too, sort by category then name
- [x] `ContentIndex.listDesignSystemCategories`: new method, distinct sorted categories
- [x] `composeInstructions.ts`: new pure `selectCraftSections(all, suggestedIds)` helper
- [x] `prepareBriefTool.ts`: wire `selectCraftSections` using the active design system's `craftSuggested`
- [x] `listDesignSystemsTool.ts` + `package.json` inputSchema/modelDescription: add `category` param
- [x] New `src/extension/commands/browseDesignSystemsCommand.ts`, wired in `extension.ts`, `contributes.commands` entry added
- [x] `instructions/open-design.instructions.md`, `README.md`: document category filtering and the browse command

## 3. Verify

- [x] `npm run sync-content` — manifest.json now present per design system on disk
- [x] Unit tests: manifest.json-based loading, legacy fallback, category filter/sort, `listDesignSystemCategories`, `selectCraftSections` (all/empty/narrowed) — 29 passing total
- [x] `tsc --noEmit`, `eslint`, `esbuild` all clean
- [ ] **Not performed**: manual verification of the "Browse Design Systems" command and `workbench.action.chat.open` handoff in a live Extension Development Host — same documented gap as the two prior changes in this repo.
