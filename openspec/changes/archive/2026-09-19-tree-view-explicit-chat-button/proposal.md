# Tree view: explicit "Use in Chat" inline button

## Why

The user asked for an item button in the tree view to put the selected example's prompt into chat. Clicking a tree item already does exactly this (`openDesign.chatWithExample`, wired in an earlier round), but there was no explicit, visible affordance for it — only Preview and Remix had inline icons on each row. An explicit button makes the action discoverable without relying on the user already knowing that a plain click populates chat, and gives keyboard/screen-reader users a direct target.

## What Changes

- `package.json`'s `view/item/context` menu gains `openDesign.chatWithExample` as a third inline icon on gallery tree items, ordered first (`inline@1`, pushing Preview to `inline@2` and Remix to `inline@3`) since it's the primary action.
- No code change needed — `registerChatWithExampleCommand`'s existing `resolveSkillId()` already accepts a context-menu invocation's tree-node argument shape (from the eleventh round), so wiring the command into this new menu location required only the manifest entry, and `openDesign.chatWithExample` already has its `comment-discussion` icon and command-palette-hidden `when: "false"` entry from that same round.

## Impact

- Modified: `package.json` (`view/item/context`), `README.md` (tree view bullet), `openspec/specs/open-design-tools/spec.md` (new scenario: the inline action does the same as a click).
