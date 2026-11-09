## 1. Verbs and scope

- [x] 1.1 Craft doc `packages/content/local/craft/steering-verbs.md`: the seven definitions (change, keep, avoid), loaded per verb
- [x] 1.2 `generation/steeringEdits.ts`: verb list and measurement directions; scope resolution (`data-od-id`, comment id, selector, named region, heading), candidate listing, `page` only for `polish` and `harden`; id stamping; unit tests
- [x] 1.3 Snapshot under `.edits/<editId>/` with `edit.json` (scope measurements, hash); keep the last 20 per entry

## 2. Tool

- [x] 2.1 `prepare_open_design_edit` instructions: definition, scope HTML, design-system tokens, scope rules, "check with editId"; `undo`
- [x] 2.2 MCP tool in `session.ts`, annotations (writes), available in `remote.ts`; VS Code tool and `package.json`; unit tests

## 3. Guard in the check

- [x] 3.1 `export/editGuard.ts`: markup comparison with the scope replaced and scoped style rules allowed; unit tests
- [x] 3.2 Pixel comparison at desktop and phone with the scope masked and the area below shifted; tolerance and minimum area; browser test
- [x] 3.3 Verb measurements inside the scope (type size and weight, accent count, gaps and padding, visible elements and words, findings and off-scale values); `edit-no-effect`
- [x] 3.4 `edit-regression` by pairing findings with the snapshot (reuse the before/after pairing)
- [x] 3.5 `editId` on `check_open_design_artifact` (MCP, VS Code, CLI); before and after image; result in `metadata.edits`; the unchecked-edit note

## 4. Preview and skill

- [x] 4.1 `verb` on `ArtifactComment`; verb buttons in the VS Code, browser and Claude Desktop comment panels; the gathered instruction for verb comments
- [x] 4.2 `open-design-edit` prompt (wording to verb and scope, edit, check, fix, show); overview skill routing; regenerate skills
- [x] 4.3 Critic input carries the edit log

## 5. Evals and docs

- [x] 5.1 Eval briefs take `followUps` (sent with `--resume` after the first registration); scorer reads the last edit's guard result
- [ ] 5.2 Two briefs: a landing page then "make the pricing section bolder"; an orders table then "it feels cramped"; one live run each
- [x] 5.3 `docs/guides/steer-a-design.md`, `reference/tools.md`, CHANGELOG
