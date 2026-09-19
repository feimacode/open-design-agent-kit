# Gallery: clicking an example populates chat, matching upstream

## Why

The user pointed out (with a screenshot of open-design's real Gallery UI) that clicking an example card there doesn't preview it or remix it immediately — it populates the chat composer with a pinned skill reference plus a full pre-filled brief, still editable, not yet sent. The previous round (`gallery-browse-vs-remix-separation`) had already moved click-to-browse away from immediate remix and onto a read-only preview panel, which was the right instinct (browsing shouldn't write files) but not actually what upstream does on click — upstream's own "just looking" gesture is chat-prefill, not a silent preview panel.

## What Changes

- New `openDesign.chatWithExample` command (`src/extension/commands/chatWithExample.ts`): given a skill id, builds a query naming the skill and its example prompt/brief, and calls `workbench.action.chat.open({ query, isPartialQuery: true })` — same stable prefill API already used by `OpenDesign: Browse Design Systems`. Nothing is generated or written; the message sits in the composer until the user sends it.
- Tree view: item click is now `openDesign.chatWithExample` (was `openDesign.previewExample`). The read-only preview and Remix are both still available, as two inline context-menu icons (Preview, then Remix) on each item.
- Grid view: clicking a card now posts `open-chat` (was `open-preview`). A `.og-actions` row on each card now holds an explicit "Remix" button and a "Preview" text-link, both `stopPropagation()`-guarded so they don't also trigger the card's own chat-prefill click.
- QuickPick (`OpenDesign: Browse Gallery`) is unchanged — still remixes directly on selection. This asymmetry was already deliberate (see the prior change's `design.md`) and this round doesn't revisit it; flagged to the user as an open question rather than changed unprompted.

## Capabilities

### Modified: `open-design-tools` gallery browsing

The default click action on a gallery tree item or grid card is now "populate a prefilled, unsent Copilot Chat message about this example," not "open a read-only preview." Preview and Remix remain available as explicit secondary actions in both views.

## Impact

- New files: `src/extension/commands/chatWithExample.ts`.
- Modified: `src/extension/views/galleryTreeProvider.ts`, `src/extension/webviews/galleryGridProvider.ts`, `src/webview/gallery/main.ts`, `src/extension/extension.ts`, `package.json` (new command + icon, `view/item/context` gains a second inline entry, `commandPalette` hides the new command).
- `ExamplePreviewProvider` (the read-only preview panel introduced in the prior round) is unchanged in behavior — still reachable via the explicit Preview action in both views — just no longer the default click target.
