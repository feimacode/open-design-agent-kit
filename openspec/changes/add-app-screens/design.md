## Context

`surfaces.json` routes surfaces to catalog ids (skills, design templates, examples); only `ready` surfaces show. Upstream content under `packages/content/assets/` is synced and never hand-edited, so new templates go in `packages/content/local/skills/` and craft in `local/craft/`, wired by `craft-requires.json`. Collections are several artifacts sharing a `collectionId` in their manifests, discovered by `collectionScan.ts`.

## Goals / Non-Goals

**Goals:** a first-class place for app UI; app patterns that come out dense and realistic rather than as landing-page sections; whole flows with their branches in one ask.

**Non-Goals:** a component library of our own (we use the active design system and, with `add-design-from-app`, the app's components); Android and tablet device frames (Next item "platform shells"; until then the Android answer gets a frameless 412 px screen and a note, not an iPhone); working back-end logic.

## Decisions

### Move dashboard, keep the rest of Prototype

Prototype stays for web pages. Moving `dashboard` makes the split clear; the `data-report` surface keeps it too. Older prompts that name dashboard still find it through skill triggers.

### Templates are seeds, not galleries

Each pattern template ships one `template.html` with the shell and named slots (`data-od-slot="toolbar"`, `"rows"`, `"empty"`) and a short SKILL.md with the pattern's rules, like `mobile-app` does today. The slots line up with `add-states-board`, so a table template already knows where its empty and loading versions go.

### Flow packs are prompts over collections

A flow pack is a template whose instructions list its screens and branches and ask for one artifact per screen in one collection. No new storage. A sign-in pack makes at most eight screens; the brief question "which branches?" lets the user trim it.

### Density is a brief answer

Compact (controls 32 to 36 px, 13 to 14 px text), medium (40 to 44 px, 14 to 15 px), airy (48 px, 16 px), from OpenPencil's `web-app` skill. The answer goes into the instructions as numbers so the check's tap-target rule can say when compact is too small for touch.

### Store rules are notes on collections

They only make sense across screens (deletion lives in settings, not on the sign-up screen), so they run when the check is given a collection or a screen whose collection has a sign-up or paywall role. They are notes because the design may not ship to a store; the brief answer "ships to App Store or Play" raises them to warnings.

## Risks / Trade-offs

- More templates to keep in sync with the design-system token hooks. Mitigation: they all start from one shared shell CSS, tested by the content check.
- Flow packs make many screens and cost more tokens. Mitigation: the branch question and the eight-screen cap.
