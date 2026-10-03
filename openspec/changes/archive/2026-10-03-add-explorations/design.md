## Context

Generation today is one brief → one artifact: `prepare_open_design_brief` composes instructions, the agent writes the file with its own tools, and `register_open_design_artifact` writes the manifest sidecar. Multi-screen **collections** already exist. They have no registry (a collection is just manifests sharing a `collectionId`, found by `workspace/collectionScan.ts`), and `composeInstructions` tells each screen to stay consistent with its siblings.

Upstream Open Design has the raw material for exploration but no daemon-free way to reach it: `apps/daemon/src/prompts/directions.ts` defines five distinct visual "schools" (editorial-monocle, modern-minimal, human-approachable, tech-utility, brutalist-experimental), each with fonts, a six-value OKLch palette, mood, references and layout posture. Upstream's discovery prompt asks for "2–3 differentiated directions … when the user is exploring". The schools are distilled from `alchaincyf/huashu-design` (MIT). Upstream re-expressed them, so we vendor upstream's Apache-2.0 file and keep the attribution.

Constraints from earlier decisions:
- Tools never write the design. They return instructions, and the agent writes with its own file tools. Tools may write manifests, copied examples and export output.
- Logic lives in `packages/core`. The MCP server and the VS Code tools are thin adapters.
- No daemon, no new runtime dependencies. Raster output uses the installed browser, never a downloaded one.
- Prefer native host mechanisms over bespoke UI (Claude Code and Codex have no preview editor).

## Goals / Non-Goals

**Goals:**
- One request produces 2–4 directions that are reliably different, then a single choice leads into existing flows (collections, export, port to app).
- Every host gets a visual comparison in phase 1, not only VS Code.
- Keep cost acceptable: directions are sketches; only the chosen one is built out.

**Non-Goals:**
- A native VS Code comparison view or a "Choose this" button (phase 2).
- In-page "Tweaks" knobs (phase 3).
- Exploring automatically when the user didn't ask for options.
- Explorations of multi-screen flows. A direction is one artifact; a collection can follow the choice.
- Hosting or sharing URLs (that's the separate sharing work).

## Decisions

### 1. Directions are assigned by the tool, never improvised by the model
`prepare_open_design_exploration` resolves the full set of directions before any generation and returns one instruction block per direction. Each block names the assigned direction **and lists its siblings' labels**, saying "do not resemble these".
*Alternative:* one instruction block saying "make 3 different directions". Rejected because model output converges, and a single block can't give each file its own locked tokens.

### 2. Three axes, with an automatic default
- `visual`: assign schools from the vendored library. Each direction's tokens come from the school spec, bound to `:root`.
- `structure`: the brand stays fixed (the active design system's DESIGN.md is included as normal), and directions vary layout or narrative. These come from an extension-authored library in core: four page postures (classic hero and feature grid, story-led long scroll, product-UI-first, dense utility) and four deck arcs (problem→solution, narrative journey, data-led, demo-first). The deck arcs apply when the skill's mode is `deck`.
- `custom`: the agent passes 2–4 `{label, brief}` pairs for an axis the user named ("three hero concepts"). Validation requires distinct labels.

`axis` omitted → `structure` when a design system is active, otherwise `visual`. If `visual` is requested explicitly while a design system is active, the design system is left out of the sketches and the response says so, because a locked palette and divergent palettes contradict each other.
*Alternative:* always visual. Rejected because it silently overrides the user's brand.

### 3. School selection for the visual axis
The agent may pass `directionIds` (validated against the library). Otherwise a fixed order is used: `modern-minimal`, `human-approachable`, `tech-utility`, `editorial-monocle`, `brutalist-experimental`, truncated to `count`. It's deterministic so it can be tested and reproduced. Upstream's own spec says editorial should not be the default for commerce, SaaS or dashboards, and brutalist suits art and manifesto pages, so both come last. The overview skill tells the agent to pass `directionIds` when the brief's tone clearly points elsewhere.
*Alternative:* keyword-match the brief to schools in the tool. Rejected because the model is better at reading tone than a regex, and passing ids keeps that judgement with the agent.

### 4. Count is 2–4, default 3; fidelity is "sketch"
More than four costs too many tokens and is too much for a person to compare. Sketch fidelity is defined per mode: a page is one screen (above the fold plus one key section); a deck is a cover plus two content slides; other modes are a single representative view. Real copy where it's known, honest placeholders otherwise. This follows upstream's "junior-pass first".

### 4b. Shared instructions are returned once
The skill body, design system and craft rules are identical for every direction, so `prepare_…` returns them once as `sharedInstructions`, with each direction getting only its own section (spec, siblings, fidelity, Output). Returning a full copy per direction would repeat the largest part 3–4 times in the agent's context. When delegating to sub-agents, the agent passes both parts.

### 5. The plan is a file; membership is a manifest field
`prepare_…` writes `<outputDir>/<explorationId>/exploration.json`, containing `{ explorationId, title, brief, skillId, axis, designSystemId?, directions: [{ id, label, spec, entryPath }], chosen? }`. Directions are registered artifacts with `explorationId` and `directionId` in their manifests, validated like the collection fields (bounded-length optional strings, recorded in `vendored/SOURCE.md`).
Why a plan file when collections have none: the comparison page has to show directions that are *planned but not yet written*, along with their labels and rationale, and the choice has to persist somewhere. The file is metadata, the same category as a manifest, so tools may write it.
`explorationId` is a slug of the brief title. A collision with an existing directory gets a numeric suffix. Entry paths are `<outputDir>/<explorationId>/<directionId>.html`.

### 6. `compare.html` is generated chrome, not an artifact
A pure core renderer builds `<outputDir>/<explorationId>/compare.html` from the plan and the registered sidecars:
- a responsive grid with one card per direction
- a live `<iframe>` of a registered direction's entry file, or a "not generated yet" placeholder
- the label, the school or axis, a short spec summary and a "chosen" badge

It's written on every exploration-aware registration and on choose, so it never goes stale. It uses relative paths only, no scripts and no network, and it works when opened from `file://` (iframes of same-directory files render in Chromium, Firefox and Safari). It is **not registered** as an artifact. It's interface around the designs, so it must not appear in the gallery, the collections or the export tools.
*Alternative:* register it as an artifact so it can be exported and shared. Deferred: the contact sheet covers sharing for now, and the sharing work can revisit this.

### 7. The contact sheet reuses export, without going through the public export tool
`compare_open_design_exploration({ explorationId, contactSheet?: boolean })` reports registered and missing directions and the `compare.html` path. With `contactSheet: true` it renders `compare.html` through the core capture path (static server plus installed browser, at a fixed viewport such as 1600 wide, full page) into `<explorationId>/exports/contact-sheet.png`. It calls the internal capture function directly, because the public export tool only accepts registered artifacts. If no browser is found, the result explains that and returns `compare.html` alone, never an error. The overview skill tells agents that can read images to look at the sheet and regenerate any direction that resembles another before presenting.

### 8. Choosing returns instructions, like everything else
`choose_open_design_direction({ explorationId, directionId, next, notes?, mergeFrom? })` records `chosen` in the plan, refreshes `compare.html`, and returns one of three instruction sets:
- `build-out`: the same skill, now at **full** fidelity, with the chosen direction's spec locked and the sketch file named as the starting point to extend. `suggestedEntryPath` is `<explorationId>/<directionId>-full.html`, which keeps the sketches as history. The response mentions that a collection can follow.
- `merge`: `mergeFrom: [{ directionId, aspect }]` (for example "hero"). The instructions name both files and the aspects to take, written to `<explorationId>/merged.html`.
- `save-design-system`: delegates to the existing custom design system instruction composer, seeded with the direction's spec and the sketch's `:root` tokens as evidence. The new system can then be made active for later work.

### 9. Shared core, thin hosts
All logic lives in core: assignment, plan read and write, instruction composition, the compare renderer, the contact-sheet call, and choose instructions. `packages/mcp-server/src/tools.ts` and the new VS Code tool classes only adapt arguments and format results, as the existing tools do. The VS Code register tool calls the same core compare-refresh after writing the manifest.

### 10. VS Code phase 1: direction navigation only
`artifactEditorProvider.resolveCollectionNav` becomes a general sibling-navigation resolver: it checks `collectionId`, then `explorationId` (ordered by the plan's direction order), and labels the result "Direction N of M — <title>". The webview code is unchanged. When it registers a direction, the VS Code tool's response also gives the `compare.html` path for opening in an external browser. VS Code would block it inside Simple Browser, the same problem the existing register response already heads off.

### 11. Curated `open-design-explore` command via the local prompt overlay
`packages/content/local/prompts/explore.md` (prompt name `open-design-explore`, matching `open-design-social-post`) (host-agnostic) uses the existing render path into a VS Code prompt file, an MCP prompt, and Claude Code and Codex skills. It walks through: clarify only if the brief is empty → `prepare_…_exploration` → write and register each direction (in parallel where the host offers sub-agents) → `compare_…` with a contact sheet → present and ask for a choice → `choose_…`. Both the overview skill and `open-design.instructions.md` gain a short section on when to explore: only on explicit requests for options, directions, alternatives or "a few versions".

The Claude Code and Codex generators used to append the social-post trigger ("use whenever the user wants something to post on social media…") to *every* local prompt's skill description, which would have made the explore skill trigger on social requests. The trigger now lives in each prompt's own `model_trigger` frontmatter.

## Risks / Trade-offs

- [Directions still look alike, e.g. structural directions with the same hero] → Each block lists its siblings and a "must differ in" clause (hero pattern, grid rhythm, type scale), and the contact-sheet self-check runs before presenting.
- [Token cost and latency of 3–4 generations] → Sketch fidelity, a maximum of 4, parallel sub-agents where available, and exploration only on request.
- [`file://` iframes are blocked in some setups (strict enterprise browser policy)] → Each card also links to the direction's file directly. The contact sheet doesn't need iframes in the user's browser.
- [The `compare.html` refresh adds a write to registration] → Only when `explorationId` is present. Collections and plain artifacts are unaffected. A failed refresh is reported in the response and never fails the registration.
- [Vendoring drift: upstream edits `directions.ts`] → Pin the commit in `SOURCE.md`, as for every other vendored code file. The content drift check covers content, not vendored code, so re-checking this file is part of the existing manual upstream-port review.
- [Visual schools are opinionated, e.g. brutalist] → Deterministic default order puts it last, and the agent can pass `directionIds`.

## Migration Plan

Additive only: new tools, new optional manifest fields, new files under the output directory. Existing manifests and collections are untouched. Rolling back means removing the tools; any leftover `exploration.json` and `compare.html` files are inert.

## Open Questions

- Should `build-out` reuse `prepare_open_design_brief` with a `directionSpec` argument instead of its own composer? Recommendation: compose in core with a shared helper, and keep `prepare_…_brief`'s arguments unchanged.
- Should Copilot's sub-agent tool (if present in the installed VS Code) be named explicitly in the VS Code instructions? Check the actual tool name during implementation before mentioning it.
