# Tools

Every tool the agent can call. In VS Code these are language-model tools (reference one in chat with `#<ref>`, e.g. `#od-export`). Over MCP (Claude Code, Codex, Cursor and others) they're MCP tools on the `open-design` server with the same names and the same arguments.

Two rules apply to every tool:

- **Tools never write your design.** The generation tools return *instructions*; the agent writes the HTML with its own file-editing tools and then calls [`register_open_design_artifact`](#register_open_design_artifact). The only files these tools write themselves are manifests, copied examples ([`remix_open_design_example`](#remix_open_design_example)) and export outputs ([`export_open_design_artifact`](#export_open_design_artifact), [`publish_open_design_artifact`](#publish_open_design_artifact)). No tool deploys anything or talks to a hosting service.
- **Paths are workspace-relative**, e.g. `.open-design/coffee-landing/coffee-landing.html`. The workspace is the open VS Code folder, or for MCP the server's working directory (see [`OPEN_DESIGN_WORKSPACE_ROOT`](settings-and-env.md#open_design_workspace_root)).

| Tool | VS Code ref | MCP | What it does |
|---|---|---|---|
| [`list_open_design_skills`](#list_open_design_skills) | `#od-skills` | yes | Browse skills, templates and remixable examples |
| [`list_open_design_design_systems`](#list_open_design_design_systems) | `#od-design-systems` | yes | Browse brand design systems |
| [`read_open_design_source`](#read_open_design_source) | `#od-read-source` | yes | Turn a document into Markdown source material |
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
| [`check_open_design_artifact`](#check_open_design_artifact) | `#od-check` | yes | Render a design and see it: screenshots plus preflight findings, at desktop and mobile, per card or per slide |
| [`export_open_design_artifact`](#export_open_design_artifact) | `#od-export` | yes | Export to PNG, JPEG, PDF, PowerPoint, standalone HTML or a site folder; check a design; one file per data row |
| [`add_open_design_diagram_runtime`](#add_open_design_diagram_runtime) | `#od-diagram-runtime` | yes | Add or update the layout runtime in a diagram |
| [`adapt_open_design_artifact`](#adapt_open_design_artifact) | `#od-adapt` | yes | Instructions to re-compose a design for other sizes |
| [`create_open_design_qr_code`](#create_open_design_qr_code) | `#od-qr-code` | yes | Make a real QR code for a design |
| [`publish_open_design_artifact`](#publish_open_design_artifact) | `#od-publish` | yes | Package for hosting and get instructions to publish a link |

## Catalog

### list_open_design_skills

Lists the skill catalog: skills (task recipes), design templates (rendering styles) and remixable examples (real rendered artifacts). All are usable as a `skillId`.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `query` | string | no | Free-text filter over name, description and triggers. |
| `mode` | `prototype` · `deck` · `design-system` · `image` · `video` · `template` · `utility` · `audio` · `other` | no | Exact mode filter. |
| `source` | `skill` · `design-template` · `example` · `community` | no | Exact source filter. `community` entries come from the unreviewed [awesome-open-design](https://github.com/feimacode/awesome-open-design) catalog (VS Code only). |
| `remixableOnly` | boolean | no | Only entries with a rendered example to remix. |
| `surface` | string | no | A [surface](#surfaces) id: returns that surface's entries instead. `"list"` returns the surfaces themselves. Ignores the other filters. |

**Result:** a list of `{ id, name, description, triggers, category, mode, source, examplePrompt?, exampleArtifactPath? }`.

- `id` is namespaced `od:<mode>:<name>`, e.g. `od:deck:guizang-ppt`. When an example shares a name with a skill, the example gets a suffix: `od:deck:deck-guizang-editorial:example`.
- `examplePrompt` is a ready-made brief. Prefer it when it fits the request.
- A non-empty `exampleArtifactPath` means the entry can be remixed.
- `stub: true` marks a catalog stub: an entry that only advertises an upstream skill and has no instructions of its own. The agent never picks one.

#### Surfaces

A surface is a kind of thing to make, such as a wireframe, a poster or a diagram. Each one maps to curated entries in the catalog, and catalog stubs never appear. The ready surfaces are:

| Id | Label | Flow |
|---|---|---|
| `prototype` | Prototype | |
| `mobile` | Mobile app | |
| `slides` | Slides | |
| `document` | Document | |
| `wireframe` | Wireframe | |
| `animation` | Animation | |
| `resume` | Résumé | |
| `research` | Research | |
| `data-report` | Data report | |
| `poster` | Poster / flier | [poster flow](../guides/posters.md) |
| `social` | Social post | [social-post flow](../guides/social-posts.md) |
| `email` | HTML email | [HTML email](../guides/html-email.md) |
| `diagram` | Diagram | [diagrams](../guides/diagrams.md) |

Color + type and 3D object are planned and don't appear yet.

**`surface: "list"`** returns `{ surfaces: [{ id, label, description, entryCount, prompt? }] }`.

**`surface: "<id>"`** returns:
- `surface`: `{ id, label, description, prompt?, questions }`.
- `entries`: the catalog entries in curated order. Each id lists its recipe first, then its remixable example when there is one.

An unknown id returns `{ error }`, listing the valid ones.

Mode `design-system` means "a skill that helps author a design-system deliverable". It's unrelated to `designSystemId`.

### list_open_design_design_systems

Lists the brand design systems (~150 bundled, plus any custom ones in the workspace).

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `query` | string | no | Free-text filter over name, summary and category. |
| `category` | string | no | Exact category, e.g. `E-Commerce & Retail`. Call with no arguments to see the categories. |

**Result:** a list of `{ id, name, summary, category, source, active }`. `source` is `built-in` or `user` (custom systems, with ids starting `user:`), and `active` marks the workspace's active design system.

## Generating

### read_open_design_source

Turns a workspace document into source material for a design: Markdown under `<output>/sources/<slug>/source.md`, its embedded images under `assets/`, and a `source.json` record. Returns the **outline**, not the text: the agent then reads `source.md` by line range. Re-reading an unchanged file reuses the extraction (matched by SHA-256). See [Turn a document into a deck](../guides/deck-from-a-document.md).

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `path` | string | yes | Workspace-relative path of the document. |

| Format | Extracted as |
|---|---|
| `.docx` | Headings (including custom heading styles), lists, tables and paragraphs in order |
| `.pptx` | One section per slide in presentation order, with its title, text, tables and speaker notes |
| `.xlsx` | One table per sheet, up to 200 rows each |
| `.pdf` | One section per page, via `pdftotext` (poppler) when it's installed |
| `.md`, `.markdown`, `.mdx`, `.txt`, `.csv` | As they are |

**Result:** `{ path, kind, cached, markdownPath, lines, chars, sections: [{ heading, level, lines, chars }], assets, warnings?, pdfNote?, next }`. Without `pdftotext`, a PDF returns no text and a `pdfNote` telling the agent to read the PDF with its own tools.

**Errors:** a path outside the workspace (symlinks included) or inside `<output>/sources/`, a missing file, an unsupported or legacy format (`.doc`, `.ppt`, `.xls`: save as the newer format), more than 50 MB, or XML with entity declarations.

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
| `sources` | string[] (1–10) | no | Workspace paths of documents to [build from](../guides/deck-from-a-document.md). Each is extracted with [`read_open_design_source`](#read_open_design_source), and the instructions add the material, an outline-first workflow (write `outline.md`, get approval, then build) and accuracy rules. |
| `format` | [format id](#canvas-formats) | no | A canvas format. The instructions gain a **Canvas** section with the exact size, units, safe area and, for print, the bleed and minimum type size, which takes precedence over any size the skill names. See [Posters and print](../guides/posters.md). |
| `fluid` | boolean | no | Build a **fluid** design that [reflows to any shape](../guides/posters.md#change-the-shape): the format becomes the default shape, and the Canvas section teaches container-unit sizing with wide and tall layout rules. Default: `true` for print formats, `false` for screen formats. `fluid: true` without `format` uses A3. |

**Result:** `{ instructions, suggestedEntryPath, suggestedKind, format?, fluid?, designSystemId?, designSystemName?, outlinePath?, sources? }`. `outlinePath` and `sources` (`[{ path, markdownPath, kind }]`) are present when `sources` was given.

**Errors:** unknown `skillId`, `designSystemId` or `format` (the message lists valid ids), `screenRole` missing with `collectionId`, and a source that can't be read (the message names it).

#### Canvas formats

| Id | Medium | Size | Safe area | Bleed | Min. type | Byte budget |
|---|---|---|---|---|---|---|
| `x-image` | screen | 1600×900 px | 48 px | | | 5 MB |
| `ig-square` | screen | 1080×1080 px per card | 48 px | | | 8 MB |
| `ig-portrait` | screen | 1080×1350 px | 48 px | | | 8 MB |
| `story` | screen | 1080×1920 px | 48 px | | | 8 MB |
| `xhs-card` | screen | 1080×1440 px per card | 48 px | | | |
| `yt-thumbnail` | screen | 1280×720 px | 48 px | | | 2 MB |
| `linkedin-image` | screen | 1200×627 px | 48 px | | | 5 MB |
| `og-image` | screen | 1200×630 px | 60 px | | | 5 MB |
| `x-header` | screen | 1500×500 px | 60 px | | | 5 MB |
| `linkedin-banner` | screen | 1584×396 px | 60 px | | | 8 MB |
| `email-header` | screen | 600×200 px, captured at 2× | 24 px | | | 1 MB |
| `banner-mrec` | screen | 300×250 px | 12 px | | | 150 KB |
| `banner-leaderboard` | screen | 728×90 px | 8 px | | | 150 KB |
| `banner-skyscraper` | screen | 160×600 px | 10 px | | | 150 KB |
| `banner-mobile` | screen | 320×50 px | 4 px | | | 150 KB |
| `a4` | print | 210×297 mm | 5 mm | 3 mm | 9 pt | |
| `a3` | print | 297×420 mm | 5 mm | 3 mm | 10 pt | |
| `a2` | print | 420×594 mm | 10 mm | 3 mm | 14 pt | |
| `a1` | print | 594×841 mm | 10 mm | 3 mm | 18 pt | |
| `a0` | print | 841×1189 mm | 15 mm | 3 mm | 24 pt | |
| `letter` | print | 8.5×11 in | 5 mm | 0.125 in | 9 pt | |
| `tabloid` | print | 11×17 in | 5 mm | 0.125 in | 10 pt | |
| `poster-18x24` | print | 18×24 in | 10 mm | 0.125 in | 14 pt | |
| `poster-24x36` | print | 24×36 in | 12 mm | 0.125 in | 18 pt | |

Headers, banners, the email header and the display ads are left out of a shape sheet that names no `presets`, since they need a design's own banner layout. Print sizes are trim sizes. The design's `[data-od-card]` is authored at the trim size plus the bleed on every side (A3: 303×426 mm), and the safe area is measured inside the trim.

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
| `sources` | string[] | no | The same source paths passed to `prepare_open_design_brief`. Each source's hash is recorded in the manifest. |
| `format` | [format id](#canvas-formats) | no | The canvas format passed to `prepare_open_design_brief`. Recorded as [`metadata.format`](artifact-manifest.md#metadataformat), so export, preflight and adaptation use it. Registering again keeps the manifest's earlier metadata (this format, export and share records); a new `format` replaces the old one. |

**Result:** the written manifest. See [Artifact manifest](artifact-manifest.md). With `explorationId`, the result also reports the comparison page's path and which directions are still missing. If the exploration has no plan, the artifact is still registered and the result carries a warning.

With `sources`, the result also runs a **number check** on HTML entries: it lists numbers in the page's visible text (speaker notes included) that appear in none of the sources, each with surrounding text, up to 50. Integers 0–12 and years 1900–2100 are ignored, and grouping doesn't matter (`1,200` matches `1200`). It's a prompt to verify, never an error. A source that can't be read is reported and left out.

### get_open_design_artifact

Reads an artifact back.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | Workspace-relative path to the entry file. |

**Result:** `{ manifest, supportingFiles, entryContent, openComments, staleSources? }`. `openComments` holds comments left in the VS Code preview that haven't been resolved; the agent should address them. See [Preview, comment and edit](../guides/preview-comments-edit.md). `staleSources` is present when the manifest records sources: each `{ path, reason }` where the source has `changed` since registration or is `missing`.

### remix_open_design_example

Copies a real example into the workspace (with its assets), registers it, and returns instructions to **modify** it rather than start over. In VS Code the preview opens.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `skillId` | string | yes | An id whose `exampleArtifactPath` is non-empty. |

**Result:** `{ entryPath, instructions, manifest }`. Remixed artifacts are registered as kind `html` with `sourceSkillId` set, which is enough for [deck export](../guides/export-decks.md#how-decks-are-detected) to recognize remixed decks.

### add_open_design_diagram_runtime

Inserts the diagram layout runtime into a diagram's HTML entry file, or updates it in place: one `<script data-od-runtime="diagram">` block before `</body>`. Everything else in the file is left unchanged, and running it again on a current file changes nothing. It works before or after registration. See [Diagrams of your code](../guides/diagrams.md).

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | The diagram's HTML entry file. |

**Result (text):** whether the runtime was added, updated or already current, plus the markup it lays out:

- **Flow diagrams:** a `[data-od-diagram]` container with `data-direction` `right` or `down`. Nodes carry `data-od-node`, `data-rank`, `data-lane`, and optionally `data-group` and `data-od-source`. Links are hidden `data-od-link` elements and groups are hidden `data-od-group` elements.
- **Sequence diagrams:** `data-od-diagram="sequence"`, with `data-od-participant` elements and hidden `data-od-message` elements.
- **Styling:** the CSS custom properties that style connectors and groups.

**Errors:** the file doesn't exist, isn't HTML, or is outside the workspace.

**Example (MCP arguments):**

```json
{ "entryPath": ".open-design/package-architecture/package-architecture.html" }
```

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

### check_open_design_artifact

Renders a registered artifact in a headless browser (an installed Chrome, Edge or Chromium, never downloaded) and returns what it looks like: **screenshots attached as images** plus [preflight](../guides/posters.md#preflight-checks) findings. It writes no files and doesn't change the manifest. The agent calls it after creating or substantially editing a design, before saying it's done: it fixes every error, looks at the screenshots for what checks can't measure (balance, hierarchy, crowded or empty areas), and re-checks, for at most two rounds.

What it renders depends on the artifact:

- **A page** (no `[data-od-card]`): at each viewport, by default desktop 1440×900 and mobile 390×844. Findings are tagged with the viewport they appear at. It adds a `horizontal-scroll` check: a page wider than its viewport is an error at phone widths (up to 480 px) and a warning above, naming the element that sticks out. Content in an `overflow-x: auto` container (a carousel) and fixed off-canvas elements don't count.
- **A card design** (posters, social posts): each card at the format it was registered with, like export. Several cards come back as one contact sheet.
- **A diagram** (an `[data-od-diagram]` page): at desktop width only, plus the diagram checks `node-overlap`, `edge-through-node`, `group-overlap` and `diagram-error`; see [Diagrams of your code](../guides/diagrams.md).
- **A deck**: preflight on every slide (findings tagged with the slide number) and one contact sheet of up to 12 slides, each marked when it has errors.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | The registered artifact's entry file. |
| `viewports` | `{ name, width, height }`[] (1–4) | no | Pages only: the viewports to check instead of desktop and mobile. Ignored (with a warning) for card designs. |
| `slides` | integer[] | no | Decks only: 1-based slide numbers to check. Default: every slide; the contact sheet shows the first 12 of them. |
| `maxImages` | integer 0–6 | no | How many screenshots to attach. Default 3. `0` returns findings only. |
| `at` | number[] (up to 6) | no | Animations: also capture the artifact at these times in seconds, on a virtual clock, labelled `t=<seconds>s`. They come first and share `maxImages`. |

Screenshots are JPEG, at most 1568 px on the long edge. A page's first screen at each viewport comes first; further screens down a tall page fill the remaining images, and the result lists what was left out.

**Result:** text with the findings (errors first), the attached screenshots' labels and sizes, what wasn't attached, and any warnings; then the screenshots. In VS Code they're image parts of the tool result; over MCP they're `image` content items after the text. A client that ignores images still gets every finding in the text.

When the artifact was registered with `sources` and any of them changed since, the findings include `stale-sources` (info).

**Errors**, each prefixed `Check failed (<code>)`: `invalid-args`, `not-found`, `not-registered`, `unsupported-kind`, `no-browser` and `capture-failed`, with the same meanings as [export's](#export_open_design_artifact). On `no-browser`, the agent skips checking and tells you once.

For checks of spreadsheet rows (`data`) or of every shape of a fluid poster (`shapeSheet`), use `export_open_design_artifact` with `checkOnly: true`.

**Example (MCP arguments):**

```json
{ "entryPath": ".open-design/coffee-landing/coffee-landing.html", "viewports": [{ "name": "tablet", "width": 768, "height": 1024 }] }
```

### export_open_design_artifact

Renders a registered artifact in a headless browser (an installed Chrome, Edge or Chromium, never downloaded) and writes the result under the artifact's own `exports/` folder. The packaging formats `standalone` and `site` need no browser. The artifact's source files are never modified.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | The registered artifact's entry file. |
| `format` | `png` · `jpeg` · `pdf` · `pptx` · `standalone` · `site` · `email` · `paste` · `mp4` · `webm` · `gif` | no | Default `png`. `pdf` works for decks (one page per slide) and pages (printed, vector). `pptx` is for decks only. `standalone` writes one self-contained `exports/<name>.html`. `site` writes a deploy-ready `exports/site/` folder. See [Share and publish](../guides/share-and-publish.md). `email` writes an inbox-ready `exports/<name>.email.html` and `.email.txt` ([HTML email](../guides/html-email.md)). `paste` writes `exports/<name>.<target>.html` for pasting into another editor. `mp4`, `webm` and `gif` [render an animation frame by frame](../guides/export-animations.md) and need an installed ffmpeg. |
| `quality` | integer 1–100 | no | JPEG quality. Default 90. |
| `width`, `height` | integer 16–8192 | no | CSS pixels, given together. They override the skill's size for images, the measured slide size for decks, or the page size for page PDFs. |
| `scale` | number 1–3 | no | Device scale factor. Default 2 for deck `pptx`/`pdf`, 1 otherwise. |
| `selector` | string | no | Images only: export each matching element as its own image, e.g. `[data-od-card]`. Can't be combined with `pdf`, `pptx` or `slides`. |
| `maxBytes` | integer | no | Per-file byte budget. Oversized images are re-encoded as JPEG at quality 90 down to 40. For `pdf`/`pptx` it only warns. |
| `deck` | boolean | no | Force deck (`true`) or page (`false`) handling. Detected automatically when omitted. |
| `slides` | integer[] | no | Decks only: 1-based slide numbers, e.g. `[1, 3]`. With `png`/`jpeg` you get one image per slide; with `pdf`/`pptx`, only those slides in that order. |
| `badge` | boolean | no | `standalone`/`site` only: add the closeable "Made with Open Design" footer badge. Default: on for `site`, off for `standalone`. See [the badge](../guides/share-and-publish.md#the-made-with-open-design-badge). |
| `baseUrl` | string | no | `site`: the https address the bundle will be served from, so the preview image (`og:image`) gets a full URL. `email` and `paste`: where the artifact's files are hosted; relative image and link URLs are rewritten against it. |
| `target` | `wechat` · `notion` · `newsletter` · `generic` | with `paste` | Where the HTML will be pasted. See [Paste into WeChat, Notion and newsletters](../guides/paste-html.md). |
| `preset` | [format id](#canvas-formats) | no | Use a canvas format's settings instead of `width`/`height`/`selector`/`maxBytes`. A screen format captures each `[data-od-card]` at its size within its byte budget. A fluid design is reflowed to the preset's shape first, and for print the bleed is added to it. A print format writes a [print-ready PDF](../guides/posters.md#print-ready-pdfs) (the default format becomes `pdf`). Explicit arguments still win. Without `preset`, the format the artifact was registered with is used. |
| `bleed` | number 0–20 | no | Print PDFs only: bleed in mm on every side. Default: the format's. |
| `cropMarks` | boolean | no | Print PDFs only: add crop marks at the trim corners, in a 10 mm slug around the page. |
| `checkOnly` | boolean | no | Load the page and run [preflight](../guides/posters.md#preflight-checks) only. No files are written and the manifest isn't changed. |
| `data` | string | no | A workspace-relative CSV, XLSX or JSON-array file for [one output per row](../guides/posters.md#one-per-row-from-a-spreadsheet). At most 200 rows. Every `data-od-field` and `data-od-qr-field` in the page must have a column. Not for decks. |
| `sheet` | string | no | With an XLSX `data` file: the sheet to read. Default: the first. |
| `nameField` | string | no | With `data`: the column that names each row's file (slugified and made unique), e.g. `poster-ada-lovelace.png`. Default: row numbers. |
| `split` | boolean | no | With `data` and a PDF: one PDF per row instead of one multi-page PDF. |
| `presets` | [format id](#canvas-formats)[] (1–15) | no | Fluid designs only: several shapes in one export, each reflowed and checked at its own shape, written as `<name>-<format>.<ext>` (PDF for print shapes, PNG for screen shapes unless `format` is given). Not with `preset`, `width` or `height`. With `data`: one file per row per shape, at most 400. |
| `shapeSheet` | boolean | no | Fluid designs only: also write `exports/<name>-shapes.png`, the design at every shape in `presets` (default: the poster and social formats, not headers, banners or ads), each marked when preflight found errors. With `checkOnly`, it's the only file written. |
| `fps` | integer 1–60 | no | `mp4`/`webm`/`gif` only: frames per second. Default 30 (15 for GIF). See [Export animations](../guides/export-animations.md). |
| `duration` | number 0.5–60 | no | `mp4`/`webm`/`gif` only: length in seconds. Default: the sum of the frames' `data-duration`, else the longest CSS or Web animation, else 6. |
| `loop` | boolean | no | `gif` only: loop forever. Default true. |
| `campaignSheet` | boolean | no | Fluid designs only: also write `exports/campaign-sheet.png`: the design at every shape in `presets`, plus the first screen of every other piece registered in the same collection (landing page, email…), each marked when it has errors. See [Run a campaign](../guides/campaigns.md). |

**Result (text):** each written file with its pixel size, file size and format; for decks, the slide count and the stage size and scale used; where the size came from; for print PDFs, the trim size, bleed and a note that the PDF is RGB; for page exports, the **preflight** findings, errors first ([the checks](../guides/posters.md#preflight-checks)); and any warnings (failed requests, blank slides, budget re-encoding). Details in [Export images](../guides/export-images.md), [Export decks and PDFs](../guides/export-decks.md) and [Posters and print](../guides/posters.md).

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
| `missing-references` | `standalone`/`site`: the page references a file that doesn't exist (the message names it and what referenced it). |
| `path-outside-workspace` | `standalone`/`site`: a reference (or a symlink) points outside the workspace. |
| `package-failed` | `standalone`/`site`: packaging failed for another reason, such as a size limit. |

**Example (MCP arguments):**

```json
{ "entryPath": ".open-design/pitch/pitch.html", "format": "pptx" }
```

```json
{ "entryPath": ".open-design/hack-night/hack-night.html", "preset": "a3", "cropMarks": true }
```

### adapt_open_design_artifact

Instructions to re-compose a finished design for other canvas formats: the same message, copy hierarchy and design system, laid out again for each size instead of scaled. **It writes no design file.** If the master isn't in a [collection](../guides/generate-a-design.md#collections), it is added to a new one (`<name>-formats`, role `master`); that manifest change is the only write.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | The registered master design. HTML only. |
| `formats` | [format id](#canvas-formats)[] (1–6) | yes | The target formats, each listed once. |
| `notes` | string | no | What the user said about the versions, passed into each one's instructions. |

For a **fluid** master (`data-od-fluid`), which already reflows to every shape, it returns `mode: "tune"` instead: per shape, instructions to check the master at that shape and fix it in place with that shape's `@container` rule, then re-check every shape with a shape sheet. No new file, no collection, no write.

**Result:** a short header, then `{ mode, collectionId?, adaptations: [{ mode, formatId, formatLabel, instructions, suggestedEntryPath?, registerArgs? }] }`. For a fixed master (`mode: "new-file"`), each entry's instructions include the master's HTML, that format's Canvas section and the re-composition rules. Write the file at `suggestedEntryPath` (`<master>-<formatId>.html`, next to the master) and register it with exactly `registerArgs`.

**Errors:** a missing or unregistered master, a renderer other than HTML, and unknown, repeated or too many formats.

### create_open_design_qr_code

Generates a QR code offline as SVG, writes it to `<artifact-dir>/assets/<name>.svg`, lists it in the manifest's `supportingFiles`, and returns inline markup to paste into the design. The markup carries `data-od-qr="<text>"`, so [preflight](../guides/posters.md#preflight-checks) decodes the rendered code and checks it. A QR code is generated data, not design, which is why this tool writes a file.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | The registered artifact the code belongs to. |
| `text` | string | yes | What to encode, usually a full https URL. Up to 2000 characters. |
| `name` | string | no | File name under `assets/`. Default `qr`. Reusing a name replaces the file. |
| `errorCorrection` | `L` · `M` · `Q` · `H` | no | Default `M`. Use `H` when a logo will cover part of the code. |
| `margin` | integer 0–16 | no | Quiet zone in modules. Default 4, the standard. |

**Errors:** a missing or unregistered artifact, empty or overlong text, and an out-of-range `margin`.

## Sharing

### publish_open_design_artifact

Packages a registered artifact into a deploy-ready folder (`exports/site/`) and composes step-by-step instructions to publish it as a link, with the host's own CLI and the user's own login, or as a temporary no-account link. **It deploys nothing and handles no tokens.** The instructions stop for the user's explicit yes before any deploy command. A second mode records the link afterwards. See [Share and publish](../guides/share-and-publish.md).

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | The registered artifact's entry file. |
| `provider` | `netlify-temporary` · `cloudflare-temporary` · `netlify` · `vercel` · `cloudflare-pages` · `github-pages` | no | Where to publish. Omitted: the instructions list the choices for the user to pick. |
| `badge` | boolean | no | Add the closeable "Made with Open Design" footer badge. Default `true`, unless [`openDesign.share.badge`](settings-and-env.md#opendesignsharebadge) is off or [`OPEN_DESIGN_SHARE_BADGE`](settings-and-env.md#open_design_share_badge) is `0`. |
| `published` | object | no | Record mode, after a successful deploy: `{ provider, url, claimUrl?, expiresAt?, siteRef? }`. `url` and `claimUrl` must be `https:`. Nothing is rebuilt. |

**Result (text):**
- Without `published`: the bundle's file list and preflight findings, then either the provider choices or the instructions for the chosen provider (check, confirm, deploy, report and record).
- With `published`: a confirmation. The link is stored in the manifest's [`metadata.shares`](artifact-manifest.md#metadatashares), replacing an earlier record for the same provider and site.

**Example (MCP arguments):**

```json
{ "entryPath": ".open-design/launch/launch.html", "provider": "netlify-temporary" }
```
