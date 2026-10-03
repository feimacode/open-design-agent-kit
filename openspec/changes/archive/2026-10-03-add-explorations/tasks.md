## 1. Direction libraries (core)

- [x] 1.1 Vendor upstream `apps/daemon/src/prompts/directions.ts` to `packages/core/src/vendored/designDirections.ts` (data, spec renderer, lookup helpers; drop the question-form-only helpers) and record path, commit, Apache-2.0 licence, MIT huashu-design lineage and deviations in `vendored/SOURCE.md`
- [x] 1.2 Add `packages/core/src/generation/structuralDirections.ts`: four page postures and four deck narrative arcs, each with id, label, spec text and a "must differ in" clause
- [x] 1.3 Unit tests: ids unique, the default visual contrast order resolves, every structural entry renders a non-empty spec

## 2. Exploration planning (core)

- [x] 2.1 Add `generation/explorationPlan.ts`: input validation (count 2–4, axis, `directionIds`, `customDirections`) and axis resolution (auto → structure when a design system is active, otherwise visual; explicit visual drops the design system and flags it)
- [x] 2.2 Add direction instruction composition: reuse `composeInstructions`, then append the assigned direction spec, sibling labels with the "do not resemble" clause, and mode-specific sketch fidelity (page / deck / other)
- [x] 2.3 Add `workspace/explorationStore.ts`: slug plus collision suffix for `explorationId`, write and read `exploration.json`, record the choice, and list registered directions by scanning sidecars for `explorationId`
- [x] 2.4 Add optional `explorationId` and `directionId` to `vendored/artifactManifest.ts` validation and sanitizing (bounded strings, like the collection fields) and note the divergence in `SOURCE.md`
- [x] 2.5 Unit tests: axis defaults, invalid-input errors, deck mode chooses deck arcs, sibling labels appear in each block, slug collision, plan round-trip

## 3. Comparison page and contact sheet (core)

- [x] 3.1 Add the `compare.html` renderer: pure function from plan plus registered directions to HTML (grid, iframe or placeholder, label, axis or school, spec summary, direct link, chosen badge; no scripts, relative paths only, escaped text)
- [x] 3.2 Add `refreshExplorationCompare(workspaceRoot, outputDir, explorationId)`, which writes `compare.html` and returns a result or warning without throwing
- [x] 3.3 Add contact-sheet rendering through the existing capture path (static server plus discovered browser, fixed viewport, full page) to `<explorationId>/exports/contact-sheet.png`, degrading to a "skipped: no browser" result
- [x] 3.4 Unit tests: renderer output for partial, complete and chosen states (snapshot), HTML escaping, refresh with a missing plan returns a warning

## 4. Choosing (core)

- [x] 4.1 Add choose instruction composers: `build-out` (full fidelity, locked spec, sketch path, `-full.html` path), `merge` (sources and aspects, `merged.html`), `save-design-system` (delegating to the existing custom-design-system composer, seeded with spec and sketch path)
- [x] 4.2 Validation: unknown exploration or direction, unregistered direction, `merge` without valid `mergeFrom`. Errors leave the plan unchanged
- [x] 4.3 Export the new APIs from `packages/core/src/index.ts`; add unit tests for each `next` value and each error

## 5. MCP server

- [x] 5.1 Add `prepare_open_design_exploration`, `compare_open_design_exploration` and `choose_open_design_direction` handlers and schemas in `packages/mcp-server/src/tools.ts`
- [x] 5.2 Add `explorationId` and `directionId` to `register_open_design_artifact` and call the compare refresh, including its path or warning in the result
- [x] 5.3 Update the MCP server tool-count and resolution tests, and add a round-trip test: prepare → write stub files → register × N → compare → choose

## 6. VS Code

- [x] 6.1 Add the three `languageModelTools` (classes, `registerTools.ts`, `package.json` contributions with `#od-explore`, `#od-compare-exploration` and `#od-choose-direction` refs and model descriptions)
- [x] 6.2 Extend `RegisterArtifactTool` with the new fields and the compare refresh; its response gives the `compare.html` path for an external browser and repeats the "don't open in Simple Browser" note
- [x] 6.3 Generalize `resolveCollectionNav` into sibling navigation that also handles `explorationId` ("Direction N of M — <title>", plan order, skipping unregistered directions); check that collection navigation is unchanged
- [x] 6.4 Add a "When to explore" section to `instructions/open-design.instructions.md`

## 7. Content and agent guidance

- [x] 7.1 Write `packages/content/local/prompts/explore.md` (prepare → write and register each direction, in parallel where possible → compare with contact sheet → self-check → present → choose)
- [x] 7.2 Add "When to explore" and contact-sheet self-check guidance to the overview skill source used for Claude Code, Codex and the `skills add` bundle
- [x] 7.3 Run `npm run sync-content` and confirm the generated prompt file, MCP prompt, and Claude and Codex skills; the sync checks (`check-skills-sync`, `check-codex-skills-sync`, `check-cli-assets-sync`, content mirror) pass

## 8. Docs

- [x] 8.1 Write `docs/guides/explore-directions.md` (when to use it, axes, sketches, `compare.html`, contact sheet, the three choose paths, the per-host experience) and link it from `docs/guides/README.md` and the root README's guides list
- [x] 8.2 Update `docs/reference/tools.md` (three new tools plus the register arguments), `docs/reference/artifact-manifest.md` (new fields) and `docs/reference/prompts-and-commands.md` (`explore`)
- [x] 8.3 `npm run lint` (including `check-docs.mjs`) passes

## 9. Verification

- [x] 9.1 `npm run typecheck` and `npm run test:unit` pass
- [ ] 9.2 Manual end-to-end in Claude Code, with no design system and then with one active: three directions are generated, `compare.html` renders from `file://`, the contact sheet is written and visibly different, and `build-out` produces a full page
- [ ] 9.3 Manual end-to-end in VS Code Copilot: directions register, preview previous/next moves between directions, collections still navigate
