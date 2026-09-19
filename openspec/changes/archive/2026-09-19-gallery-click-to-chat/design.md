# Design: click-to-chat

## Why chat-prefill instead of the read-only preview, as the default click

The prior round's reasoning ("browsing shouldn't write files") is still correct, but the read-only preview panel was this extension's own invention for satisfying that constraint, not a port of what upstream actually does. Upstream's real Gallery click behavior — shown in the user's screenshot — is itself already non-destructive: prefilling the chat composer writes nothing and generates nothing until the user reviews and sends. So the fix isn't "add a write guard," it's "match the actual upstream interaction," which happens to also be non-destructive by construction. `workbench.action.chat.open` with `isPartialQuery: true` was already in use for this exact purpose (`browseDesignSystemsCommand.ts`), so this is a rewire onto an existing, proven mechanism rather than new infrastructure.

## Why Preview and Remix both stay, as explicit secondary actions

Upstream's screenshot only shows the chat-prefill behavior for a plain click — it doesn't rule out a preview affordance existing elsewhere in its UI, and this extension's users have already been using the read-only preview (shipped last round) and may still want a quick visual look without leaving the gallery. Removing it would be a regression with no upstream evidence requiring it. Keeping both Preview and Remix as small, explicit, `stopPropagation()`-guarded actions (tree: two inline context-menu icons; grid: a button + a text-link in a `.og-actions` row) preserves everything the prior round built while changing only what the *unqualified click* does.

## Query construction

`chatWithExample()` builds: `` `Use the OpenDesign skill "${skillId}" (${skill.name}).${brief}` `` where `brief` is `skill.examplePrompt` if present. This deliberately names the skill id explicitly (not just its display name) so the model can go straight to `remix_open_design_example`/`prepare_open_design_brief` with an unambiguous id, rather than having to re-resolve a name back to an id — the same id-in-the-prefilled-query pattern `browseDesignSystemsCommand.ts` already uses for design systems.

## `resolveSkillId` duplication, again

`chatWithExample.ts` needed the same small `resolveSkillId(arg)` helper already duplicated in `remixAndOpen.ts` and `previewExampleCommand.ts` (accepts either a plain string, from a tree item's own bound `command.arguments`, or a `{ kind: 'example', entry: { id } }`-shaped tree node, from a `view/item/context` menu invocation where VS Code passes the tree element itself). Extracting a shared helper was considered and rejected again, consistent with the prior rounds' choice — it's a five-line function, and three near-identical copies are cheaper to read than a shared module plus an import three call sites now depend on, for something this small and unlikely to diverge in a way that would need synchronized fixing.

## QuickPick left alone, flagged not changed

The QuickPick's immediate-remix-on-select behavior technically also diverges from what the screenshot shows (upstream's card click there is chat-prefill, not remix). This round deliberately does not touch the QuickPick: it was already a documented, deliberate asymmetry from the prior round for being the "fast/confirm" path, and this round's user request was specifically about the click behavior shown in the screenshot (card clicks), not a general request to re-align every entry point with upstream. Worth surfacing back to the user as an open question, not silently resolved either way.
