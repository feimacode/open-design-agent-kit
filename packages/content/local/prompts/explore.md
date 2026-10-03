---
name: open-design-explore
description: Explore 2–4 deliberately different design directions for one brief, compare them side by side, then build out the one you pick
argument_hint: what to design, and optionally how many directions or what should vary (e.g. "pricing page, 3 directions")
placeholder: What should we explore directions for?
model_trigger: use whenever the user explicitly asks for several options, directions, alternatives or versions of a design to compare ("show me three directions for…", "a few different takes on…"), even if they don't mention Open Design; not for a single, ordinary design request
---

Explore several deliberately different design directions with Open Design, compare them side by side, and take the chosen one forward.

Brief: {{brief}}

## 1. Plan the directions

If the brief is empty, ask the user what to design before doing anything else.

Call `list_open_design_skills` to find the skill that fits what's being designed (a landing page, a deck, a dashboard…). Then call `prepare_open_design_exploration` with that `skillId` and the brief:

- `count`: the number of directions the user asked for (2–4). Default 3.
- If the user named what should vary ("three hero concepts", "different pricing layouts"), pass `axis: "custom"` and `customDirections`, one `{ label, brief }` per direction.
- Otherwise leave `axis` out. The tool picks visual styles when no design system is active, and layout or narrative structures when one is, so the brand is kept.
- Pass `directionIds` only when the brief's tone clearly calls for specific directions, e.g. `editorial-monocle` for a magazine or `brutalist-experimental` for an art or agency site.

If the result says the active design system was set aside, tell the user.

## 2. Generate each direction

For each direction in the result, follow `sharedInstructions` followed by that direction's own `instructions`. Write its file at exactly its `suggestedEntryPath`, then call `register_open_design_artifact` with the `explorationId`, the direction's `directionId`, kind, title and `sourceSkillId`.

These are **sketches**: one screen, or a cover plus two slides for a deck. Divergence matters more than polish. If you can delegate to sub-agents, generate the directions in parallel and give each one `sharedInstructions` plus its own `instructions`.

## 3. Compare

Call `compare_open_design_exploration` with `contactSheet: true`. If you can view images, open the contact sheet and check that the directions look clearly different (layout and hero pattern, not just colour). Regenerate any direction that resembles another, then compare again.

## 4. Present

Give the user the comparison page path (it opens in any browser straight from the file system and shows every direction side by side), and the contact sheet path if one was made. In one line each, say how the directions differ. Ask which one to take forward, and whether to:

- **build it out** at full fidelity,
- **merge** in parts of another direction ("B, with A's hero"), or
- **save it as a design system** for later work.

## 5. Take the choice forward

Call `choose_open_design_direction` with the `explorationId`, the chosen `directionId`, `next` (`build-out`, `merge` with `mergeFrom`, or `save-design-system`) and the user's own adjustments as `notes`. Follow the returned `instructions` and register the result as they say.
