# Active design system: persistence, status bar, sticky selection

## Why

The user tested the extension and pushed back on design-system selection: it was too effortful to pick one, and there was no way to know which one (if any) was already in effect for the current work. Every prior mechanism (`list_open_design_design_systems`, `#od-design-systems`, the `design-system-selection` browse command) was a one-shot lookup — nothing persisted, so a design system had to be re-specified or re-derived from conversation history on every single request.

This mirrors a gap against open-design's own product model, which treats the active design system as sticky per-project state (its MCP tools default `project`/`file` args to "whatever's open right now" rather than requiring repetition each call).

A follow-up question — whether to also register each of the ~152 design systems as an individually `#`-mentionable chat symbol/tool — was considered and rejected: there's no stable API for "one tool, N individually-referenceable sub-entities" (that's what the still-proposed `registerChatVariableResolver` would give), and registering 152 separate tiny tools to fake it is worse than the previously-rejected slash-command-flooding options, because every registered `languageModelTool`'s schema is sent to the model as part of its available-tools context on every chat turn — not just when referenced.

## What Changes

- New `openDesign.activeDesignSystemId` workspace setting (extends the existing `openDesign.outputDirectory` setting pattern) holds the currently active design system id, visible/editable directly in `settings.json`.
- `prepare_open_design_brief`'s `designSystemId` is now truly optional: when omitted, it falls back to the active setting; when given explicitly, it also becomes the new active one (confirmed with the user: selection is sticky by design, matching how a person actually works — pick a look once, keep it until changed). A stale/invalid active id is treated as "none" rather than erroring.
- `prepare_open_design_brief`'s response now includes the resolved `designSystemId`/`designSystemName` actually used, so the calling model doesn't have to track it separately across the flow into `register_open_design_artifact`.
- `list_open_design_design_systems` marks the currently active entry with `active: true`.
- New `set_active_design_system` tool (set or clear, no artifact generation required) for when the user wants to pin a look before generating anything.
- A status bar item (right side) always shows the active design system's name (or "No design system"); clicking it reopens the browse picker.
- `OpenDesign: Browse Design Systems` now **sets** the active setting on pick (previously it only prefilled a chat message that was then forgotten), marks the currently active entry with a checkmark in the list, and offers a "Clear active design system" entry at the top when one is set.

## Capabilities

### Modified: `open-design-tools`

Design system selection is now stateful and sticky per workspace, with both a chat-facing (tool `active` flags, optional-with-fallback `designSystemId`) and an always-visible UI-facing (status bar) way to know what's currently in effect.

## Impact

- New file: `src/core/workspace/activeDesignSystem.ts` (get/set/clear/on-change, backed by the new setting).
- New file: `src/tools/setActiveDesignSystemTool.ts`; new file: `src/extension/statusBar/activeDesignSystemStatusBarItem.ts`.
- `prepare_open_design_brief`'s response payload gains two new fields (`designSystemId`, `designSystemName`) — additive, not breaking.
- `list_open_design_design_systems`'s payload gains one new field (`active`) — additive.
