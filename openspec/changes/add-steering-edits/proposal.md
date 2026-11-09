## Why

Once a design exists, every change is a free-text request: "make the hero pop", "this table feels cramped", "tone it down". The agent reads the request its own way and often rewrites much more than was asked. The header that was fine changes too, a colour shifts across the page, and nobody notices until later. There is no shared word for what "bolder" means, no limit on where the change may go, and no proof afterwards that the rest of the page stayed the same.

Impeccable (pbakaus/impeccable, Apache-2.0) made this its core idea: a small set of steering commands ("bolder", "quieter", "distill", "polish", "harden") that a person uses to steer one part of a design, because agents need defined ways for people to steer the result, not just instructions. The kit already has the other two things Impeccable's author says agents need: domain knowledge (craft docs, taste rules, checks, the critic) and context (the brief, the design system, `PRODUCT.md`). The steering is the missing piece.

This is the first "Later" item of the UI design use case study (2026-11-02), gap R8 ("change part of a screen: edit one region, keep the rest, compare before and after"), and pick 3 of the Impeccable study. It applies to every HTML design, not only app screens: a landing page section, a poster headline, a table on a dashboard.

We can go one step past Impeccable, because we have a browser check: after the edit, the kit can prove that nothing outside the scope changed, that the edit actually moved the design in the asked direction, and that it made nothing worse.

## What Changes

- **Seven steering verbs with fixed meanings.** `bolder`, `quieter`, `denser`, `roomier`, `distill`, `polish` and `harden`. Each verb has a written definition (what to change, what to keep, what not to do) bound to the active design system's tokens, and a measurable expected direction (for example, `denser` means smaller gaps and padding on the token scale, more items in the first viewport, and tap targets still at least 24 px). Definitions live in the content overlay as one craft doc, so they can be tuned without code.
- **A scope.** An edit applies to one element and what is inside it: a `data-od-id`, a CSS selector, a preview comment, or a named region (`header`, `hero`, `footer`, or a section found by its heading text). A whole page is allowed for `polish` and `harden` only. The kit stamps the scope with a `data-od-id` if it has none, so it stays findable after the edit.
- **New tool `prepare_open_design_edit`** (MCP and VS Code). It takes `entryPath`, `verb`, `scope` and optional `notes`, saves a snapshot of the design under `.open-design/.edits/`, and returns instructions: the verb's definition, the scope's current HTML, the design system's relevant tokens, and the scope rules (change only inside the scope, keep every `data-od-*` attribute and the copy unless the verb allows otherwise, put new CSS in rules that only match inside the scope). It returns an `editId`. It doesn't write the design itself, apart from the scope stamp.
- **The check proves the edit.** `check_open_design_artifact` takes an optional `editId`. It compares the design with the snapshot and reports:
  - `edit-out-of-scope` (error) when anything outside the scope changed, in the markup or on screen (a shared CSS rule that moved the footer counts);
  - `edit-no-effect` (warning) when the measured properties didn't move in the verb's direction;
  - `edit-regression` (error) for any finding that the snapshot didn't have.
  It also writes a side-by-side image of the scope before and after, at desktop and phone width, and returns it with the check images.
- **Undo.** `prepare_open_design_edit` with `undo: <editId>` restores the snapshot, as long as no later edit was made to the design since.
- **Edit log.** The manifest keeps the last 20 edits (`metadata.edits`: id, verb, scope, time, result), so the critic and the user can see how the design got here.
- **Verbs in the preview.** The comment panel in the VS Code, browser and Claude Desktop previews gets one row of verb buttons. Picking one on a selected element sends "make this bolder" with the element as the scope, the same way comments go to chat today.
- **A skill.** A new `open-design-edit` skill routes everyday wording ("make it pop", "tone it down", "tighten this up", "give it room to breathe", "simplify", "clean it up", "what if the name is really long?") to the right verb and scope, edits, checks, and shows the before and after. The overview skill points to it for any change to an existing design.

Not in this change: edits that span several screens of a flow (a shared navigation partial is out of scope), mixing several verbs in one edit, a strength setting (asking for the same verb again is "more"), and running Impeccable's own commands.

## Capabilities

### New Capabilities
- `steering-edits`: the verbs and their definitions, scopes, `prepare_open_design_edit`, snapshots, undo, the edit log, the preview verb buttons and the `open-design-edit` skill.

### Modified Capabilities
- `artifact-visual-check`: the check takes `editId` and reports `edit-out-of-scope`, `edit-no-effect` and `edit-regression`, with a before and after image of the scope.
- `open-design-tools`: a preview comment can carry a verb, and sending it asks for a scoped edit instead of a free-text change.

## Impact

- `packages/core`: new `generation/steeringEdits.ts` (verbs, scope resolution, snapshot, instructions, undo), new `export/editGuard.ts` (markup and pixel comparison outside the scope, verb measurements), `checkArtifact.ts` (the `editId` path), `workspace/artifactCommentTypes.ts` (optional `verb`), the three preview hosts' comment panels.
- `packages/content/local`: craft doc `steering-verbs.md`, prompt `edit.md`, overview skill and critique rubric lines.
- `packages/mcp-server`: the tool in `session.ts`, annotations (writes), classified as available in `remote.ts` (it only works on the managed workspace), unit tests.
- `packages/vscode`: the language model tool and `package.json` entry.
- Evals: briefs can carry `followUps` (later turns sent with `--resume`); two new briefs that make a design and then steer one section of it.
- Docs: `docs/guides/steer-a-design.md`, `reference/tools.md`, CHANGELOG.
