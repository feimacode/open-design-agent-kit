## 1. Plan and markup

- [x] 1.1 `flow` input on `prepare_open_design_brief` and `metadata.flow` on register (MCP, VS Code), limits (20 screens, 80 links); latest plan wins; tests
- [x] 1.2 Flow section in `composeInstructions.ts` (plan, own links, `href` plus `data-od-goto`, shared nav include)
- [x] 1.3 `data-od-include` resolution in preview, check and export

## 2. Map, preview, export

- [x] 2.1 `flowMap.ts`: `flow.html` with thumbnails and arrows from plan and found links
- [x] 2.2 Preview follows links (VS Code, browser preview, MCP App); Collections view opens the map
- [x] 2.3 Single-file clickable export and site bundle for a collection; publish of a collection (the `site` export of any screen holds every screen with the shared nav filled in and the flow map as `index.html`; a Claude artifact of a screen is the one-file prototype)

## 3. Check

- [x] 3.1 `collectionId` on the check; image budget across screens
- [x] 3.2 `flow-broken-link`, `flow-dead-end`, `flow-unfilled`, `flow-nav-drift`, `flow-unlinked`; tests

## 4. Docs

- [x] 4.1 `generate-a-design.md` Collections, `share-and-publish.md`, `reference/tools.md`, `reference/artifact-manifest.md`; skill copies
