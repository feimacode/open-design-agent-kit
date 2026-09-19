# Design: active design system

## Where state lives: a VS Code setting, not extension-internal storage

Considered `context.workspaceState` (extension-internal key/value store) against a real `openDesign.activeDesignSystemId` configuration property. Chose the setting: it's inspectable and hand-editable directly in `settings.json` without any extension UI, it extends the existing `openDesign.outputDirectory` precedent already in this codebase, and any tool implementation reads it with a one-line `vscode.workspace.getConfiguration('openDesign').get(...)` call — no custom serialization or storage plumbing to build or maintain. Consistent with this project's running preference for native platform mechanisms over bespoke machinery.

Target for `config.update()`: `ConfigurationTarget.Workspace` when a workspace folder is open, `Global` otherwise — so each workspace naturally gets its own active design system, but the extension still works with no workspace open (falls back to a user-level default).

## Why sticky-on-generation (confirmed with the user)

Two options were on the table: (a) generating with an explicit `designSystemId` also sets it as active, or (b) active only ever changes through the deliberate set/clear command or tool, and `designSystemId` on `prepare_open_design_brief` is always a one-off override. The user chose (a). Rationale discussed: it matches how a person actually works through a session — pick a look once, keep producing in that style until told otherwise — rather than requiring the same selection to be repeated on every request. The cost is a small surprise risk (a one-off "make me one Airbnb-styled component to compare" would also flip the active setting), judged acceptable since changing it back is one click (status bar → picker) or one sentence to the model.

## Rejected: per-entity chat symbols/tools for each design system

Raised mid-implementation: would registering each design system as an individually `#`-mentionable "symbol" be better than a picker? No, for a sharper reason than the earlier slash-command rejections (`expand-skill-catalog-and-curated-prompts/design.md`, `design-system-selection/design.md`): `canBeReferencedInPrompt`/`toolReferenceName` gives one `#name` per registered **tool**, not per entity a tool's results contain — there's no stable API for "one tool, N referenceable sub-entities" (the still-proposed `registerChatVariableResolver` is exactly that, and already ruled out for being unstable). Faking it with ~152 separate one-design-system-each tools would be worse than the rejected slash-command approach: every registered `languageModelTool`'s schema is included in the model's available-tools context on **every** chat turn, not opt-in per message the way a slash command or `#` reference is — so 152 extra tool definitions would inflate every single turn's context regardless of whether OpenDesign is even relevant that turn. The status-bar + persistent-setting approach delivers the same "easy to select, easy to see" outcome with a single piece of state and a single command, without this scaling cost.

## Status bar item, not a tree view or webview

A `vscode.window.createStatusBarItem` was the minimal, always-visible answer to "knowing what's already selected" — one line of persistent UI, native to the editor chrome, no custom panel to build or maintain. It re-renders reactively via `vscode.workspace.onDidChangeConfiguration`, so it stays correct whether the setting changes through the picker, the tool, or a hand-edit to `settings.json`.
