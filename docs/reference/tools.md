# Tools

Every tool the agent can call. In VS Code these are language-model tools (reference one in chat with `#<ref>`, e.g. `#od-export`). Over MCP (Claude Code, Codex, Cursor and others) they're MCP tools on the `open-design` server with the same names and the same arguments.

Two rules apply to every tool:

- **Tools never write your design.** The generation tools return *instructions*; the agent writes the HTML with its own file-editing tools and then calls [`register_open_design_artifact`](#register_open_design_artifact). The only files these tools write themselves are manifests, copied examples ([`remix_open_design_example`](#remix_open_design_example)) and export outputs ([`export_open_design_artifact`](#export_open_design_artifact)).
- **Paths are workspace-relative**, e.g. `.open-design/coffee-landing/coffee-landing.html`. The workspace is the open VS Code folder, or for MCP the server's working directory (see [`OPEN_DESIGN_WORKSPACE_ROOT`](settings-and-env.md#open_design_workspace_root)).

| Tool | VS Code ref | MCP | What it does |
|---|---|---|---|
| [`list_open_design_skills`](#list_open_design_skills) | `#od-skills` | yes | Browse skills, templates and remixable examples |
| [`list_open_design_design_systems`](#list_open_design_design_systems) | `#od-design-systems` | yes | Browse brand design systems |
| [`prepare_open_design_brief`](#prepare_open_design_brief) | `#od-prepare-brief` | yes | Compose instructions for a new design |
| [`prepare_open_design_exploration`](#prepare_open_design_exploration) | `#od-explore` | yes | Plan 2–4 different directions to compare |
| [`compare_open_design_exploration`](#compare_open_design_exploration) | `#od-compare-exploration` | yes | Comparison page and contact sheet for an exploration |
| [`choose_open_design_direction`](#choose_open_design_direction) | `#od-choose-direction` | yes | Take a chosen direction forward |
| [`register_open_design_artifact`](#register_open_design_artifact) | `#od-register-artifact` | yes | Record a written design as an artifact |
| [`get_open_design_artifact`](#get_open_design_artifact) | `#od-artifact` | yes | Read an artifact back, with open comments |
| [`set_active_design_system`](#set_active_design_system) | `#od-set-design-system` | yes | Set or clear the workspace's design system |
| [`remix_open_design_example`](#remix_open_design_example) | `#od-remix-example` | yes | Copy an example in as a starting point |
| [`create_open_design_design_system`](#create_open_design_design_system) | `#od-create-design-system` | yes | Instructions for a custom design system |
| [`port_open_design_artifact_to_app`](#port_open_design_artifact_to_app) | `#od-port-to-app` | yes | Instructions to turn a prototype into app code |
| [`share_open_design_artifact_to_community`](#share_open_design_artifact_to_community) | `#od-share-to-community` | **no** (VS Code only) | Instructions to contribute a design to the community catalog |
| [`pull_open_design_figma_frame`](#pull_open_design_figma_frame) | `#od-pull-figma-frame` | yes | Instructions to rebuild a Figma frame as code |
| [`export_open_design_artifact`](#export_open_design_artifact) | `#od-export` | yes | Export to PNG, JPEG, PDF or PowerPoint |

## Catalog

### list_open_design_skills

Lists the skill catalog: skills (task recipes), design templates (rendering styles) and remixable examples (real rendered artifacts). All are usable as a `skillId`.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `query` | string | no | Free-text filter over name, description and triggers. |
| `mode` | `prototype` · `deck` · `design-system` · `image` · `video` · `template` · `utility` · `audio` · `other` | no | Exact mode filter. |
| `source` | `skill` · `design-template` · `example` · `community` | no | Exact source filter. `community` entries come from the unreviewed [awesome-open-design](https://github.com/feimacode/awesome-open-design) catalog (VS Code only). |
| `remixableOnly` | boolean | no | Only entries with a rendered example to remix. |

**Result:** a list of `{ id, name, description, triggers, category, mode, source, examplePrompt?, exampleArtifactPath? }`.

- `id` is namespaced `od:<mode>:<name>`, e.g. `od:deck:guizang-ppt`. When an example shares a name with a skill, the example gets a suffix: `od:deck:deck-guizang-editorial:example`.
- `examplePrompt` is a ready-made brief. Prefer it when it fits the request.
- A non-empty `exampleArtifactPath` means the entry can be remixed.

Mode `design-system` means "a skill that helps author a design-system deliverable". It's unrelated to `designSystemId`.

### list_open_design_design_systems

Lists the brand design systems (~150 bundled, plus any custom ones in the workspace).

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `query` | string | no | Free-text filter over name, summary and category. |
| `category` | string | no | Exact category, e.g. `E-Commerce & Retail`. Call with no arguments to see the categories. |

**Result:** a list of `{ id, name, summary, category, source, active }`. `source` is `built-in` or `user` (custom systems, with ids starting `user:`), and `active` marks the workspace's active design system.

## Generating

### prepare_open_design_brief

Composes the instructions for a new design. It combines the skill's workflow, the design system's tokens, the universal craft rules and the user's brief, plus any [host override](../guides/youtube-video.md#how-it-works) for skills that assume Open Design's desktop daemon. **It writes nothing.**

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `skillId` | string | yes | A full `od:<mode>:<name>` id from `list_open_design_skills`. |
| `brief` | string | yes | The request, in the user's words. |
| `designSystemId` | string | no | A design system id. When omitted, the active one is used. When given, it also becomes the active one. |
| `collectionId` | string | no | Set for one screen of a multi-screen [collection](../guides/generate-a-design.md#collections): a slug reused on every screen. |
| `collectionName` | string | no | Display name of the collection. Required with `collectionId`. |
| `screenRole` | string | no | This screen's role, e.g. `splash`, `checkout`. Required with `collectionId`. |
| `screenTotal` | number | no | Planned number of screens, for "screen N of M" framing. |

**Result:** `{ instructions, suggestedEntryPath, suggestedKind, designSystemId?, designSystemName? }`.

**Errors:** unknown `skillId` or `designSystemId` (the message lists some valid ids), and `screenRole` missing with `collectionId`.

### register_open_design_artifact

Call after the entry file (and any supporting files) is written. Validates the artifact and writes its manifest sidecar `<entry>.artifact.json`. In VS Code it also opens the [preview](../guides/preview-comments-edit.md).

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | Workspace-relative path to the entry file. It must already exist. |
| `kind` | `html` · `deck` · `react-component` · `markdown-document` · `svg` · `diagram` · `code-snippet` · `mini-app` · `design-system` | yes | The artifact kind. It decides the renderer and the [export formats](artifact-manifest.md#exports-by-kind). |
| `title` | string | yes | Short human-readable title. |
| `supportingFiles` | string[] | no | Sibling files the entry depends on, relative to the entry's folder. |
| `sourceSkillId` | string | no | The skill used. Export uses it for sizing (the skill's aspect hint) and deck detection. |
| `designSystemId` | string | no | The design system used. |
| `collectionId` | string | no | Same as passed to `prepare_open_design_brief`. |
| `collectionName` | string | no | Same as passed to `prepare_open_design_brief`. |
| `screenIndex` | number | no | 0-based position in the collection. |
| `screenRole` | string | no | Same as passed to `prepare_open_design_brief`. |
| `explorationId` | string | no | The [exploration](#exploring-directions) this artifact belongs to. Registering refreshes its comparison page. |
| `directionId` | string | no | The direction this sketch is. Leave it out for a built-out or merged version registered against the exploration. |

**Result:** the written manifest. See [Artifact manifest](artifact-manifest.md). With `explorationId`, the result also reports the comparison page's path and which directions are still missing. If the exploration has no plan, the artifact is still registered and the result carries a warning.

### get_open_design_artifact

Reads an artifact back.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | Workspace-relative path to the entry file. |

**Result:** `{ manifest, supportingFiles, entryContent, openComments }`. `openComments` holds comments left in the VS Code preview that haven't been resolved; the agent should address them. See [Preview, comment and edit](../guides/preview-comments-edit.md).

### remix_open_design_example

Copies a real example into the workspace (with its assets), registers it, and returns instructions to **modify** it rather than start over. In VS Code the preview opens.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `skillId` | string | yes | An id whose `exampleArtifactPath` is non-empty. |

**Result:** `{ entryPath, instructions, manifest }`. Remixed artifacts are registered as kind `html` with `sourceSkillId` set, which is enough for [deck export](../guides/export-decks.md#how-decks-are-detected) to recognize remixed decks.

## Exploring directions

An exploration generates 2–4 deliberately different sketches for one brief, puts them side by side, and builds out the one the user picks. See [Explore design directions](../guides/explore-directions.md).

### prepare_open_design_exploration

Use it instead of `prepare_open_design_brief` when the user asks for options to compare. It assigns the directions itself, so they don't converge, writes the plan (`<output>/<explorationId>/exploration.json`) and an initial comparison page, and returns the instructions. **It writes no design files.**

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `skillId` | string | yes | A full `od:<mode>:<name>` id from `list_open_design_skills`. |
| `brief` | string | yes | The request, in the user's words. |
| `count` | integer 2–4 | no | Number of directions. Default 3. |
| `axis` | `visual` · `structure` · `custom` | no | What the directions differ in. Default: `structure` when a design system is active, otherwise `visual`. `visual` with an active design system sets it aside for this exploration. |
| `directionIds` | string[] | no | Specific directions, in order, from the axis's library (see below). Sets the count. |
| `customDirections` | `{ label, brief }[]` | no | 2–4 directions for a user-named axis. Implies `axis: "custom"`. |
| `designSystemId` | string | no | A design system id. When omitted, the active one is used. When given, it also becomes the active one. |

Direction libraries:

- **Visual** (from upstream Open Design): `modern-minimal`, `human-approachable`, `tech-utility`, `editorial-monocle`, `brutalist-experimental`. The default takes the first `count` in this order.
- **Structure, pages:** `classic-hero-grid`, `story-led-scroll`, `product-ui-first`, `dense-utility`.
- **Structure, decks:** `problem-solution`, `narrative-journey`, `data-led`, `demo-first`.

**Result:** `{ explorationId, title, axis, designSystemId?, designSystemName?, designSystemSetAside?, comparePath, howToUse, sharedInstructions, directions: [{ directionId, label, suggestedEntryPath, suggestedKind, instructions }] }`. For each direction, follow `sharedInstructions` and then that direction's `instructions`, write the file at `suggestedEntryPath` (`<output>/<explorationId>/<directionId>.html`), and register it with `explorationId` and `directionId`. Directions are sketches: one screen, or a cover plus two slides for a deck.

**Errors:** unknown `skillId`, `designSystemId` or direction id, `count` outside 2–4, repeated ids or labels, `axis: "custom"` without `customDirections`, and no open workspace.

### compare_open_design_exploration

Refreshes the exploration's comparison page and reports its state. Optionally renders a contact sheet with an [installed browser](../troubleshooting.md).

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `explorationId` | string | yes | From `prepare_open_design_exploration`. |
| `contactSheet` | boolean | no | Also render the comparison page to `<output>/<explorationId>/exports/contact-sheet.png`. Default false. |

**Result:** `{ explorationId, title, comparePath, compareFile, registered, missing, chosen?, contactSheetPath?, contactSheetNote?, next }`. When no browser is found, `contactSheetNote` explains why and the rest of the result is unchanged.

### choose_open_design_direction

Records the user's choice (marked on the comparison page) and returns instructions for the next step. **It writes no design files.**

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `explorationId` | string | yes | The exploration. |
| `directionId` | string | yes | The chosen direction. It must already be registered. |
| `next` | `build-out` · `merge` · `save-design-system` | yes | `build-out`: the chosen sketch at full fidelity, at `<directionId>-full.html`. `merge`: the same, taking named aspects from other directions, at `merged.html`. `save-design-system`: instructions for a custom design system based on the direction. |
| `notes` | string | no | The user's own adjustments, in their words. |
| `mergeFrom` | `{ directionId, aspect }[]` | for `merge` | What to take from which other direction, e.g. `{ directionId: "editorial-monocle", aspect: "hero" }`. |

**Result:** `{ explorationId, chosen, next, suggestedEntryPath, suggestedKind?, id?, comparePath, afterwards, instructions }`. `id` is the new design system's id for `save-design-system`.

**Errors:** unknown exploration or direction, a direction that isn't registered yet, an unknown `next`, and `merge` without valid `mergeFrom`. On an error the plan is left unchanged.

## Design systems

### set_active_design_system

Sets or clears the workspace's active design system, which `prepare_open_design_brief` applies whenever `designSystemId` is omitted.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `designSystemId` | string | no | A design system id. Omit it or pass an empty string to clear the active system. |

The active system is stored in the [`openDesign.activeDesignSystemId`](settings-and-env.md#opendesignactivedesignsystemid) setting (VS Code) or `.open-design/config.json` (MCP).

### create_open_design_design_system

Composes instructions for writing a custom design system: a `DESIGN.md` plus a sibling `tokens.css` following the Open Design token contract. **It writes nothing.**

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `name` | string | yes, unless `existingDesignSystemId` is given | Name, e.g. `Acme Corp`. |
| `brief` | string | yes, unless `existingDesignSystemId` is given | The brand in the user's words: colors, tone, industry. |
| `sourceUrl` | string | no | A website to extract a starting palette, fonts and favicon from (best effort). |
| `existingDesignSystemId` | string | no | An existing custom design system (`user:<slug>`). Returns instructions to write **only** its `tokens.css`, from its current `DESIGN.md`; the other arguments are ignored. Built-in ids are rejected. |

**Result:** `{ instructions, suggestedEntryPath, id }`. The files go to `<outputDirectory>/design-systems/<slug>/DESIGN.md` and `…/tokens.css`, and the id is `user:<slug>`. After writing them, call `set_active_design_system` with that id. In tokens-only mode, `suggestedEntryPath` is the `tokens.css` path. See [Design systems](../guides/design-systems.md).

## Beyond the prototype

### port_open_design_artifact_to_app

Composes instructions to rebuild a finished artifact as real, idiomatic code in the workspace's own app. **It writes nothing.**

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | The artifact to promote. |
| `targetComponentPath` | string | no | Where the new component should go. A suggestion is returned when omitted. |
| `referenceComponentPath` | string | no | An existing component to follow as the pattern. The agent finds one when omitted. |

**Result:** `{ instructions, suggestedTargetComponentPath }`. Routing and navigation wiring are left to you. See [Promote to app code](../guides/promote-to-app-code.md).

### share_open_design_artifact_to_community

VS Code only. Composes instructions to package a finished artifact as a new entry in the community catalog and open a pull request under your own GitHub identity. **It writes nothing and runs nothing itself.** The instructions require the agent to check with you before anything public happens.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | The artifact to share. |

**Result:** the instructions text.

### publish_open_design_artifact_to_canva

VS Code only. Composes instructions to export a finished artifact and prepare it for import into Canva. **It writes nothing and does not talk to Canva itself** — Canva has no CLI and this project has no connected account, so every step past the export happens manually in your own Canva session.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | The artifact to prepare. |

**Result:** the instructions text. Directs the agent to call `export_open_design_artifact` itself (`pptx` for a registered deck, `pdf` otherwise), then hand the exported file to you for Canva's own **Import a file** flow. Also explains — without attempting any of them — the three things "publish as a template" can mean in Canva: personal reuse, a Brand Template (Canva Pro/Teams), or a public Creator template (gated behind Canva's own Creator program).

### pull_open_design_figma_frame

Fetches a Figma frame's structure (and a rendered image, best effort) through the Figma REST API, and composes instructions to rebuild it as code with 1:1 fidelity. **It writes nothing.** It needs a Figma token: the "Open Design: Set Figma Access Token" command in VS Code, or [`OPEN_DESIGN_FIGMA_TOKEN`](settings-and-env.md#open_design_figma_token) for MCP.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `figmaUrl` | string | yes | A frame link from Figma's "Copy link to selection" (it must contain `node-id`). |
| `designSystemId` | string | no | A design system to align the code with. |

**Result:** `{ instructions, suggestedEntryPath }`. See [Figma](../guides/figma.md).

## Export

### export_open_design_artifact

Renders a registered artifact in a headless browser (an installed Chrome, Edge or Chromium, never downloaded) and writes the result under the artifact's own `exports/` folder. The artifact's source files are never modified.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | The registered artifact's entry file. |
| `format` | `png` · `jpeg` · `pdf` · `pptx` | no | Default `png`. `pdf` works for decks (one page per slide) and pages (printed, vector). `pptx` is for decks only. |
| `quality` | integer 1–100 | no | JPEG quality. Default 90. |
| `width`, `height` | integer 16–8192 | no | CSS pixels, given together. They override the skill's size for images, the measured slide size for decks, or the page size for page PDFs. |
| `scale` | number 1–3 | no | Device scale factor. Default 2 for deck `pptx`/`pdf`, 1 otherwise. |
| `selector` | string | no | Images only: export each matching element as its own image, e.g. `[data-od-card]`. Can't be combined with `pdf`, `pptx` or `slides`. |
| `maxBytes` | integer | no | Per-file byte budget. Oversized images are re-encoded as JPEG at quality 90 down to 40. For `pdf`/`pptx` it only warns. |
| `deck` | boolean | no | Force deck (`true`) or page (`false`) handling. Detected automatically when omitted. |
| `slides` | integer[] | no | Decks only: 1-based slide numbers, e.g. `[1, 3]`. With `png`/`jpeg` you get one image per slide; with `pdf`/`pptx`, only those slides in that order. |

**Result (text):** each written file with its pixel size, file size and format; for decks, the slide count and the stage size and scale used; where the size came from; and any warnings (failed requests, blank slides, budget re-encoding). Details in [Export images](../guides/export-images.md) and [Export decks and PDFs](../guides/export-decks.md).

**Errors**, each prefixed `Export failed (<code>)`:

| Code | Meaning |
|---|---|
| `invalid-args` | An argument is out of range or a bad combination (the message says which). |
| `not-found` | No file at `entryPath`. |
| `not-registered` | [The file exists but has no manifest](../troubleshooting.md#export-failed-not-registered). |
| `unsupported-kind` | The artifact's renderer can't be rendered (e.g. React or Markdown). |
| `unsupported-format` | The kind doesn't support that format (see [exports by kind](artifact-manifest.md#exports-by-kind)). |
| `no-browser` | [No Chromium-family browser was found](../troubleshooting.md#no-chrome-edge-or-chromium-browser-was-found). |
| `selector-no-match` | The selector matched nothing visible. |
| `no-slides` | [Deck export found no slides](../troubleshooting.md#export-failed-no-slides). |
| `not-a-deck` | [PPTX or `slides` requested for something that isn't a deck](../troubleshooting.md#export-failed-not-a-deck). |
| `capture-failed` | The browser failed or timed out (each browser call is capped at 60 s). |

**Example (MCP arguments):**

```json
{ "entryPath": ".open-design/pitch/pitch.html", "format": "pptx" }
```
