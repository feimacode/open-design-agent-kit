---
name: open-design-new
description: Start a new design by picking what to make (prototype, mobile app, slides, document, wireframe, animation, résumé, research, data report, poster, social post, diagram), then build it with the right recipe
argument_hint: what to make, optionally followed by the brief (e.g. "a wireframe of onboarding for a budgeting app")
placeholder: What do you want to make, and what is it for?
---

Start a new design with Open Design.

Request: {{brief}}

## 1. Pick the surface

Call `list_open_design_skills` with `surface: "list"` to get the kinds of thing Open Design can make (each with an id, label and description).

- If the request starts with or clearly names one of them (by id or label, e.g. "wireframe", "diagram", "a poster"), use that surface.
- If it names none, or is empty, show the user the surfaces as a short list (label and description) and ask which one. Stop until they answer.

## 2. Ask what's missing

Call `list_open_design_skills` with `surface` set to the chosen id. The result has the surface's `questions` and its `entries`.

Ask only the questions the request doesn't already answer, all at once, in one short message. If the request answers them all, don't ask anything.

## 3. Build it

- If the surface has a `prompt` (for example `open-design-poster` or `open-design-social-post`), follow that flow from its first step with the user's request as the brief. In Copilot Chat it's the `/` command of the same name; in Claude Code and Codex it's the skill of the same name.
- Otherwise pick the entry that best fits the request. Entries come in curated order: the recipe first, then its remixable example when there is one. To start from a rendered example (an entry with an `exampleArtifactPath`), call `remix_open_design_example`; otherwise call `prepare_open_design_brief` with its id and the brief, and follow the general Open Design flow: write the files, register the artifact, then check it with `check_open_design_artifact` before saying it's done.

Never pick an entry marked `stub: true`.
