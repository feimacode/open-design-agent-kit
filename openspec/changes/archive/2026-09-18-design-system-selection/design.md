# Design: design-system selection

## Why not slash commands for design systems

Unlike skills/design-templates (where a `featured`/`recommended`/`od.default_for` signal exists on ~23 of 277 entries), no equivalent curation signal exists across the 152 design systems — they're all equally "real" named brands, none more canonical than another. Generating slash commands for all 152 would flood the `/` autocomplete more severely than the rejected all-skills option (`add-open-design-tools/design.md`), with no principled way to shrink the set. Rejected outright.

## Why a QuickPick command instead

Design systems are a flat, large, named-entity list — exactly the shape VS Code's own `showQuickPick` already handles well (the Command Palette itself fuzzy-searches thousands of entries this way). Grouping by the real `category` taxonomy (via `QuickPickItemKind.Separator` items) gives structured browsing without requiring per-category tooling. Handing the selection to `workbench.action.chat.open` with `isPartialQuery: true` keeps the user in control — the message is prefilled but editable, they still write their own brief before submitting.

This is a different channel than chat-native discovery (a command palette entry / could be bound to a keyboard shortcut or a view button, not something typed inline in the chat box), which is an honest trade: it's the best *stable* mechanism available today, not the most chat-native one possible in principle.

## Why not a custom `#design-system` chat variable

`vscode.chat.registerChatVariableResolver` would be the ideal in-chat-native answer — type `#design-system` and get inline fuzzy completion the way `#file:` does for files, no context-switch to the command palette. Checked against current VS Code API status and confirmed still a **proposed** API, not stable. Consistent with this project's decisions elsewhere (see `add-open-design-tools/design.md`, `expand-skill-catalog-and-curated-prompts/design.md`) to stick to confirmed-stable, non-proposed contribution points, this was deferred rather than built on. Revisit if/when it ships stable.

## manifest.json over DESIGN.md parsing

`design-systems/README.md` upstream documents `manifest.json` as the canonical machine-readable shape (`id`/`name`/`category`/`description`, plus file path references and a `craft.suggested` list), with legacy DESIGN.md-only folders as a documented fallback the daemon still supports. The extension's own heading/blockquote regex parser was reproducing, badly, information already available structured — switched to reading `manifest.json` first, falling back to the regex parser only when a folder lacks one (a small minority, if any, in the current sync — 152/152 folders with a `DESIGN.md` also had a `manifest.json` as of this sync's source commit).

## craft.suggested narrowing

Each design system's `manifest.json` names which craft docs it recommends (`craft.suggested`, e.g. Starbucks: `["color", "accessibility-baseline"]` out of the full ~11-doc catalog) and which it's exempt from (`craft.exemptions`, not used here — out of scope for this change). `prepare_open_design_brief` previously ignored this and always included every craft doc. Now: when a design system is active and its `craft.suggested` is non-empty, only those craft docs are included; otherwise (no design system, or a legacy one with an empty/absent list) every craft doc is still included — preserving prior behavior as the fallback rather than silently dropping guidance for systems with no explicit suggestion.
