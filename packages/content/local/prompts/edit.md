---
name: open-design-edit
description: Steer one part of an existing design in one direction — bolder, quieter, denser, roomier, simpler, more polished or sturdier — and change nothing else, with a check that proves only that part changed and a before and after to show
argument_hint: what to change and where (e.g. "make the pricing section bolder", "the table feels cramped")
placeholder: Which part should change, and how?
model_trigger: use whenever the user wants one part of an existing Open Design design changed in a direction rather than redesigned ("make the hero pop", "tone down the footer", "the table feels cramped", "simplify this section", "clean up the pricing cards", "what if the names are really long?", "make it bolder"), or clicked a verb in the preview, even if they don't mention Open Design; not for a new design or a whole new direction
---

Steer one part of a design: one verb, one part, nothing else changes.

Request: {{brief}}

{{voice}}

## 1. Find the design, the verb and the part

The design is the one the user is looking at or just made; if there are several, use the most recent one they talked about. Map their words to one verb:

| They say | Verb |
|---|---|
| make it pop, more punch, stand out, more confident | `bolder` |
| tone it down, too loud, calmer, softer, less shouty | `quieter` |
| tighten it up, fit more in, too much space, compact | `denser` |
| feels cramped, give it room, breathe, too tight | `roomier` |
| simplify, too busy, cut the clutter, less is more | `distill` |
| clean it up, feels unfinished, tidy, sharpen | `polish` |
| long names, empty or error states, edge cases, make it robust | `harden` |

The part is what they pointed at: a section by its heading ("the pricing section" → `{ "heading": "Pricing" }`), a region (`header`, `hero`, `main`, `footer`), or the comment they made in the preview (`{ "commentId": "c-…" }`). Use the whole page (`{ "region": "page" }`) only for `polish` and `harden`.

Ask one short question only when you can't tell the part. When the request is for a whole new look ("make the whole page bolder", "a completely different style"), don't edit: offer to explore directions with `open-design-explore`. When the change isn't a direction at all ("change the price to $19", "add a FAQ"), make it as an ordinary edit.

When the request names two verbs ("bolder and roomier"), do them as two edits, one after the other.

## 2. Prepare

Call `prepare_open_design_edit` with `entryPath`, `verb`, `scope`, and the user's own words as `notes`. If it says the scope matches nothing or several parts, pick from the candidates it lists, or ask the user which one.

## 3. Edit

Follow the instructions it returns: change only the marked part, keep its `data-od-id`, and put CSS in rules scoped to it. Don't re-register the design unless the instructions say to (a comment to resolve).

## 4. Check

Call `check_open_design_artifact` with the `editId`.

- `edit-out-of-scope`: something outside the part changed. Undo that change, usually by scoping a CSS rule to the part, and check again.
- `edit-regression`: the edit made something worse (a tap target too small, contrast too low). Fix it inside the part and check again.
- `edit-no-effect`: nothing measurable moved. Look at the before and after; if it really looks the same, go one step further, once.

At most two fix rounds; tell the user about anything left.

## 5. Show it

Show the before and after image the check attached, and say in one sentence what changed ("The pricing heading is now 44 px and the Team plan has a solid blue button; nothing else moved."). Offer, in one line: steer it again (the same verb again means more), try another verb, or undo it (`prepare_open_design_edit` with `undo` and the editId).
