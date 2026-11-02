## 1. Content

- [ ] 1.1 `app-screens` surface, questions (task, platform, density) and "Build an app" goal in `packages/content/local/surfaces.json`; move `dashboard` out of Prototype
- [ ] 1.2 Shared app shell CSS and pattern templates `app-shell`, `app-form`, `app-table`, `app-detail`, `app-settings`, `app-search` in `packages/content/local/skills/`
- [ ] 1.3 Flow packs `flow-sign-in`, `flow-onboarding`, `flow-paywall`, `flow-settings`, `flow-ai-chat`
- [ ] 1.4 `local/craft/product-ui.md` and `craft-requires.json` entries; route `login-flow`, `paywall-upgrade-cro`, `shadcn-ui`, `platform-design`, `apple-hig`, `kanban-board`
- [ ] 1.5 `check-content-sync.mjs` passes; provenance notes for ideas taken from XIAS and OpenPencil (MIT)

## 2. Instructions and check

- [ ] 2.1 Density and platform answers as numbers in `composeInstructions.ts`; Android answer gives a frameless 412 px screen and says so
- [ ] 2.2 `store-rules` notes in `checkArtifact.ts` for collections with sign-up or paywall screens; warnings when the brief says the app ships to a store; tests

## 3. Skills, docs, evals

- [ ] 3.1 `open-design-new` and overview skills list the surface; regenerate copies
- [ ] 3.2 `docs/guides/app-screens.md`, `generate-a-design.md`, `reference/tools.md`
- [ ] 3.3 Eval briefs: a settings screen and a sign-in flow
