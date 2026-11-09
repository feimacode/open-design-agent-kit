# Steer one part of a design

Change one part of a design in one direction, and nothing else. Instead of asking for a redesign, tell the agent to make a section **bolder**, **quieter**, **denser** or **roomier**, to **distill** it, **polish** it or **harden** it. The kit proves afterwards that only that part changed, and shows it before and after.

> Make the pricing section bolder.
>
> The orders table feels cramped.
>
> Tone down the footer.

The agent picks the verb from your words, finds the part, calls `prepare_open_design_edit`, makes the edit, and checks it. You get the part before and after, side by side, at desktop and phone width.

## The verbs

Each verb has a fixed meaning, written down in the kit, so "bolder" means the same thing every time. Every verb stays inside your design system: sizes, spacing and colours come from its tokens.

| Verb | Say | What changes | What stays |
|---|---|---|---|
| **bolder** | make it pop, more punch | Bigger size contrast, one element that clearly leads, a solid main button | The copy, the order, the brand colours |
| **quieter** | tone it down, too loud | Fewer accent colours, softer fills, less decoration | The copy, a readable main action |
| **denser** | tighten it up, fit more in | Tighter spacing and rows, more per row | Every item; tap targets stay big enough |
| **roomier** | it feels cramped, give it room | More space, fewer items per row | Every item and its copy |
| **distill** | simplify, too busy | Filler copy, badges and ornaments taken out | The main action and every fact |
| **polish** | clean it up | Alignment, spacing on the scale, consistent styles, hover and focus states | The content and the look |
| **harden** | what if the name is really long? | Long and missing content, empty, loading and error states | The happy path, exactly |

Asking for the same verb again goes one step further. Two verbs ("bolder and roomier") are two edits, one after the other.

## Which part

Name it the way you'd say it: "the pricing section" (the section with that heading), "the header", "the hero", "the footer". In a preview you can also select the part and click a verb (below). Only **polish** and **harden** can take the whole page; a whole page made bolder is a new direction, so the agent offers to [explore directions](explore-directions.md) instead.

The kit marks the part with a `data-od-id` attribute if it doesn't have one yet. That attribute is the only change it makes to your design itself; the agent makes the edit.

## How the kit proves it

The check (`check_open_design_artifact` with the edit's id) compares the design with a snapshot taken just before the edit:

- **Nothing outside the part changed**: not in the HTML, not in shared CSS, and not on screen at desktop and phone width. A taller part may push the rest down; that's fine. Anything else is `edit-out-of-scope`, with the changed area outlined.
- **The part moved in the asked direction**: for **bolder**, the largest text grew or got heavier, or more of it is in the brand colour; for **denser**, the spacing went down. If nothing moved, you get `edit-no-effect` and the agent goes one step further.
- **Nothing got worse**: a finding the snapshot didn't have (a button too small to tap after **denser**, text too faint after **quieter**) is `edit-regression`.

The agent fixes what the check reports, at most twice, then shows you the before and after.

## Undo

Say "undo that". The agent calls `prepare_open_design_edit` with `undo` and the edit's id, and the design goes back to the snapshot. Edits are undone newest first: an older edit can't be undone while a later one stands. An edit that was prepared and then left without any change, because the agent picked a better part instead, is marked dropped. The design keeps a log of its last 20 edits, and the design critic sees them, so its suggestions don't reverse what you asked for.

## From the preview

In the comment panel of the preview (VS Code, the browser preview, and the inline preview in Claude Desktop Chat), select a part and click one of the verb buttons under the comment box. The request goes to the agent straight away, with that part as the scope:

- **Claude Desktop Chat:** it's sent to Claude.
- **Browser preview:** it's copied; paste it into your agent.
- **VS Code:** chat opens with the request filled in.

> **In VS Code:** reference the tool as `#od-edit`.

## Files

| Path | What |
|---|---|
| `.open-design/.edits/<design>/<editId>/before.html` | The snapshot taken before the edit |
| `.open-design/.edits/<design>/<editId>/before.data.json` | The screen's own sample data at that time, when it has a data file |
| `.open-design/.edits/<design>/<editId>/edit.json` | The verb, the part and when |
| `.open-design/.edits/<design>/<editId>/compare.png` | The part before and after, at desktop and phone width |
| `.open-design/.edits/<design>/<editId>/leak-*.png` | A change outside the part, outlined |

The manifest's `metadata.edits` lists the last 20 edits with their check results. See [`prepare_open_design_edit`](../reference/tools.md#prepare_open_design_edit) for every argument.
