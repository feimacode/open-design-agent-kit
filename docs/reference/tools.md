# Tools

Every tool the agent can call. In VS Code these are language-model tools (reference one in chat with `#<ref>`, e.g. `#od-export`). Over MCP (Claude Code, Codex, Cursor and others) they're MCP tools on the `open-design` server with the same names and the same arguments.

Two rules apply to every tool (and over MCP every tool declares `readOnlyHint`, `destructiveHint` and `openWorldHint` annotations, so hosts can tell reads from writes and local from online):

- **Tools never write your design.** The generation tools return *instructions*; the agent writes the HTML with its own file-editing tools and then calls [`register_open_design_artifact`](#register_open_design_artifact). The only files these tools write themselves are manifests, copied examples ([`remix_open_design_example`](#remix_open_design_example)) and export outputs ([`export_open_design_artifact`](#export_open_design_artifact), [`publish_open_design_artifact`](#publish_open_design_artifact)). No tool deploys anything or talks to a hosting service.
- **Paths are workspace-relative**, e.g. `.open-design/coffee-landing/coffee-landing.html`. The workspace is the open VS Code folder, or for MCP the server's working directory (see [`OPEN_DESIGN_WORKSPACE_ROOT`](settings-and-env.md#open_design_workspace_root)) unless the agent sets it with [`set_open_design_workspace`](#set_open_design_workspace).

| Tool | VS Code ref | MCP | What it does |
|---|---|---|---|
| [`list_open_design_skills`](#list_open_design_skills) | `#od-skills` | yes | Browse skills, templates and remixable examples |
| [`list_open_design_design_systems`](#list_open_design_design_systems) | `#od-design-systems` | yes | Browse brand design systems |
| [`recommend_open_design_design_systems`](#recommend_open_design_design_systems) | `#od-recommend-design-system` | yes | Recommend design systems for what you're making |
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
| [`extract_open_design_design_system`](#extract_open_design_design_system) | `#od-extract-design-system` | yes | Measure a website's colours, fonts and spacing as a draft design system |
| [`port_open_design_artifact_to_app`](#port_open_design_artifact_to_app) | `#od-port-to-app` | yes | Instructions to turn a prototype into app code |
| [`share_open_design_artifact_to_community`](#share_open_design_artifact_to_community) | `#od-share-to-community` | **no** (VS Code only) | Instructions to contribute a design to the community catalog |
| [`publish_open_design_artifact_to_canva`](#publish_open_design_artifact_to_canva) | `#od-publish-to-canva` | yes | Get a design into Canva: through your Canva connector when it's connected, otherwise a file to import |
| [`publish_open_design_artifact_to_shop`](#publish_open_design_artifact_to_shop) | `#od-shop` | yes | Put product images and copy in Shopify, Big Cartel or Etsy: through Shopify's connector, or a folder ready to upload |
| [`pull_open_design_figma_frame`](#pull_open_design_figma_frame) | `#od-pull-figma-frame` | yes | Instructions to rebuild a Figma frame as code (through your Figma connection, or a token) |
| [`push_open_design_artifact_to_figma`](#push_open_design_artifact_to_figma) | `#od-push-to-figma` | yes | Push a design into Figma as editable layers through your Figma connection |
| [`check_open_design_artifact`](#check_open_design_artifact) | `#od-check` | yes | Render a design and see it: screenshots plus preflight findings, at desktop and mobile, per card or per slide |
| [`export_open_design_artifact`](#export_open_design_artifact) | `#od-export` | yes | Export to PNG, JPEG, PDF, PowerPoint, MP4, WebM, GIF, standalone HTML, a site folder, email HTML or paste-ready HTML; check a design; one file per data row |
| [`add_open_design_diagram_runtime`](#add_open_design_diagram_runtime) | `#od-diagram-runtime` | yes | Add or update the layout runtime in a diagram |
| [`adapt_open_design_artifact`](#adapt_open_design_artifact) | `#od-adapt` | yes | Instructions to re-compose a design for other sizes |
| [`create_open_design_qr_code`](#create_open_design_qr_code) | `#od-qr-code` | yes | Make a real QR code for a design |
| [`list_open_design_print_houses`](#list_open_design_print_houses) | `#od-print-houses` | yes | The card and sticker printers whose upload sizes the kit knows |
| [`publish_open_design_artifact`](#publish_open_design_artifact) | `#od-publish` | yes | Package for hosting and get instructions to publish a link |
| [`restore_open_design_artifact`](#restore_open_design_artifact) | none | yes (MCP only) | Pick a design back up from a synced Claude artifact |
| [`find_open_design_3d_assets`](#find_open_design_3d_assets) | `#od-3d-assets` | yes | Find free CC0 HDRIs, textures and models on Poly Haven for a 3D design |
| [`list_open_design_integrations`](#list_open_design_integrations) | `#od-integrations` | yes | Find trusted integrations (Canva, Figma, Notion, Drive, Slack, social posting) and setup steps for this agent |
| [`start_open_design_job_run`](#start_open_design_job_run) | none | yes (MCP only) | Start one run of a [recurring job](../guides/recurring-jobs.md): skip or the steps to follow |
| [`finish_open_design_job_run`](#finish_open_design_job_run) | none | yes (MCP only) | Check a job run without a browser, record it and get its summary |
| [`set_open_design_workspace`](#set_open_design_workspace) | none | yes (MCP only) | Tell the server which folder to work in, for hosts that start it elsewhere (Claude Desktop) |
| [`use_open_design_managed_workspace`](#use_open_design_managed_workspace) | none | yes (MCP only, chats with no folder) | Open a folder the server keeps for a design, in a Claude Desktop chat with no folder |
| [`write_open_design_file`](#write_open_design_file) | none | yes (MCP only, chats with no folder) | Save a design file Claude wrote into that folder |
| [`set_up_open_design_browser_pane`](#set_up_open_design_browser_pane) | none | yes (MCP only) | Set up the live preview for Claude Desktop's Code tab Browser pane, in `.claude/launch.json` |

## Workspace

### set_open_design_workspace

MCP only. Sets the folder the server works in for the rest of the session: where designs, manifests and `.open-design/config.json` go, and what every workspace-relative path is relative to. It wins over MCP roots and the working directory.

Claude Code, Codex and VS Code start the server in your project, so they never need it. Claude Desktop is different: in a chat with a connected folder, the server starts in your home folder, the app reports no MCP roots, and Claude's own file tools see the folder under a different path from the one on your machine. The skills tell Claude to call this tool first with the folder's path on your machine (what `get_device_info` lists under `connectedFolders`), then join the relative paths other tools return onto its own path for the folder.

| Argument | Required | Description |
|---|---|---|
| `path` | yes | Absolute path of the folder on the machine the server runs on. It must exist. |

It also wins over [`OPEN_DESIGN_DEFAULT_WORKSPACE`](settings-and-env.md#open_design_default_workspace), the desktop extension's default design folder. Until Claude calls it (or the next tool), tools refuse with a message saying which folder to pass, so nothing lands in your home folder or in the default folder by mistake.

### use_open_design_managed_workspace

MCP only, and listed only when the server has no folder of its own: it runs in your home folder (or as the [desktop extension](../getting-started/claude-desktop.md#install-the-desktop-extension)), with no `OPEN_DESIGN_WORKSPACE_ROOT` and no MCP roots. That's a Claude Desktop chat with no connected folder, where Claude's own file tools (if it has any) write into a cloud sandbox the server can't see.

It makes the managed folder, `~/Documents/Open Design/`, the workspace for the rest of the session and creates, or reopens, one subfolder per design, `<name>/`, which the first design's files go in (no `.open-design/` level). The managed folder is [`OPEN_DESIGN_MANAGED_ROOT`](settings-and-env.md#open_design_managed_root) when that is set, else the extension's default design folder when one is set, else `~/Documents/Open Design/`, or `~/Open Design/` when there is no Documents folder. Using the same name in a later chat continues the same design. A per-design folder from an earlier release (`~/Open Design/<name>/` with designs in its `.open-design/`) is reopened where it is, as its own workspace. Claude tells you the folder's path the first time.

| Argument | Required | Description |
|---|---|---|
| `name` | yes | A short name for the design, e.g. "Coffee poster". The folder is named after it (`coffee-poster`). |

### write_open_design_file

MCP only, and only in a folder opened with `use_open_design_managed_workspace`. Everywhere else Claude writes design files with its own tools and this tool refuses. It is the one exception to "the agent writes the files": Claude still writes every byte, and the server only saves them where it can't. The file is written exactly as sent; the result gives its path, size and SHA-256.

Limits: the path must be under the designs folder (the managed folder itself, or `.open-design/` in a folder from an earlier release), with no `..` or link leading out of it; only `.html .htm .css .js .mjs .json .svg .md .txt .csv` as text and `.png .jpg .jpeg .webp .gif .woff .woff2` as base64; at most 5 MiB per file. Manifests (`*.artifact.json`), comments (`*.comments.json`), `config.json`, anything in an `exports/` folder and check screenshots belong to other tools and are refused. It never deletes or moves anything.

| Argument | Required | Description |
|---|---|---|
| `path` | yes | Workspace-relative path, e.g. `.open-design/coffee-poster/coffee-poster.html`. |
| `content` | yes | The whole file: text, or base64 for images and fonts. |
| `encoding` | no | `"base64"` for images and fonts. |

In a managed folder, [`publish_open_design_artifact`](#publish_open_design_artifact) with `provider: "claude-artifact"` hands Claude the page itself (up to 2 MiB) instead of a path its Artifact tool can't read.

## Catalog

### list_open_design_skills

Lists the skill catalog: skills (task recipes), design templates (rendering styles) and remixable examples (real rendered artifacts). All are usable as a `skillId`.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `query` | string | no | Free-text filter over name, description and triggers. |
| `mode` | `prototype` · `deck` · `design-system` · `image` · `video` · `template` · `utility` · `audio` · `other` | no | Exact mode filter. |
| `source` | `skill` · `design-template` · `example` · `community` | no | Exact source filter. `community` entries come from the unreviewed [awesome-open-design](https://github.com/feimacode/awesome-open-design) catalog (VS Code only). |
| `remixableOnly` | boolean | no | Only entries with a rendered example to remix. |
| `surface` | string | no | A [surface](#surfaces) id: returns that surface's entries instead. `"list"` returns the surfaces themselves, plus the goals (see below). Ignores the other filters. |
| `goal` | string | no | A goal id from the `"list"` result, such as `get-hired`: returns the goal and the ready surfaces it leads to, the first marked `default: true`. An unknown id returns `{ error }` naming the valid goals. Ignored when `surface` is given. |

**Result:** a list of `{ id, name, description, triggers, category, mode, source, examplePrompt?, remixable? }`.

- `id` is namespaced `od:<mode>:<name>`, e.g. `od:deck:guizang-ppt`. When an example shares a name with a skill, the example gets a suffix: `od:deck:deck-guizang-editorial:example`.
- `examplePrompt` is a ready-made brief. Prefer it when it fits the request.
- `remixable: true` means the entry has a rendered example to remix. The example is bundled inside the server, so the result names no file path: agents that saw one searched the disk for it.
- `stub: true` marks a catalog stub: an entry that only advertises an upstream skill and has no instructions of its own. The agent never picks one.

With more than 40 matches (the whole catalog is about 500 entries), the result is `{ total, offset, nextOffset?, modes, note, entries }` instead: one page of at most 100 entries, each with only `{ id, name, summary?, mode, source, category?, remixable?, stub? }`, where `summary` is the description cut to one line. `modes` counts every match by mode, so the agent knows which filter to narrow with. Pass `nextOffset` as `offset` for the next page; a narrower call returns the full entries. Without paging the full catalog was over 200,000 characters, and even without descriptions about 25,000 tokens, more than Claude reads in one tool result.

**Goals.** `surface: "list"` also returns `goals: [{ id, label, description, surfaces }]`: what the user wants to get done, in their words ("Promote an event", "Get hired", "Show an idea"), each leading to a few surfaces. Claude leads a first design with these instead of the surface list, takes the goal that fits the request or asks "What's it for?", then calls again with `goal` and offers the `default` surface first. Goals live in `surfaces.json` beside the surfaces, and the content build fails when one names a surface that is missing or not ready.

This tool, `list_open_design_design_systems` and the two pickers read only the bundled catalog, so in Claude Desktop they work before Claude has named a folder.

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
| `campaign` | Campaign | [campaign flow](../guides/campaigns.md) |
| `email` | HTML email | [HTML email](../guides/html-email.md) |
| `diagram` | Diagram | [diagrams](../guides/diagrams.md) |
| `color-type` | Color + type | [style tiles](../guides/design-systems.md#pick-one-from-style-tiles) |
| `3d` | 3D object | [3D objects](../guides/3d-objects.md) |
| `shop` | Online shop | [sell what you make](../guides/sell-what-you-make.md) |
| `cards` | Game cards | [sell what you make](../guides/sell-what-you-make.md#game-cards) |

The goals, each leading to its surfaces in order (the first is the default):

| Id | Label | Surfaces |
|---|---|---|
| `promote-event` | Promote an event | `poster`, `social`, `campaign` |
| `run-a-shop` | Sell or run a small shop | `poster`, `social`, `campaign`, `email` |
| `sell-online` | Sell online | `shop`, `social`, `email`, `campaign` |
| `make-cards` | Make cards to print and sell | `cards`, `social` |
| `show-an-idea` | Show an idea | `prototype`, `mobile`, `slides` |
| `get-hired` | Get hired | `resume`, `document`, `social` |
| `explain-something` | Explain something | `slides`, `document`, `diagram`, `data-report` |
| `post-regularly` | Post regularly | `social`, `campaign` |
| `build-a-screen` | Build a product screen | `prototype`, `mobile`, `wireframe` |

**`surface: "list"`** returns `{ surfaces: [{ id, label, description, entryCount, prompt? }] }`.

**`surface: "<id>"`** returns:
- `surface`: `{ id, label, description, prompt?, questions }`.
- `entries`: the catalog entries in curated order. Each id lists its recipe first, then its remixable example when there is one.

An unknown id returns `{ error }`, listing the valid ones.

Mode `design-system` means "a skill that helps author a design-system deliverable". It's unrelated to `designSystemId`.

### list_open_design_design_systems

Lists the brand design systems (198 bundled, 30 of them iOS app systems in the `Mobile Apps` category, plus any custom ones in the workspace).

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `query` | string | no | Free-text filter. Every word must appear somewhere in the name, summary, category or curated descriptors (moods, industries, surfaces), so `warm fintech` works. |
| `category` | string | no | Exact category, e.g. `E-Commerce & Retail`. Call with no arguments to see the categories. |

**Result:** a list of `{ id, name, summary, category, source, active }`. `source` is `built-in` or `user` (custom systems, with ids starting `user:`), and `active` marks the workspace's active design system.

### recommend_open_design_design_systems

Recommends 3 to 5 design systems for a design, from a short profile the agent fills in from the conversation. The ranking is a plain function of the profile and the catalog, so every host gives the same answer. It never changes the active design system: the agent passes the chosen id to [`prepare_open_design_brief`](#prepare_open_design_brief). See [Not sure which one?](../guides/design-systems.md#not-sure-which-one).

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `industries` | string[] | no | What it's for: `saas`, `developer`, `ai`, `finance`, `commerce`, `consumer`, `media`, `editorial`, `brand`, `creative`, `dashboard`, `enterprise`, `wellness`, `education`, `automotive`, `travel`, `food`, `social`, `gaming`, `dating`. |
| `moods` | string[] | no | How it should feel: `minimal`, `calm`, `warm`, `friendly`, `playful`, `bold`, `premium`, `elegant`, `technical`, `editorial`, `retro`, `futuristic`, `corporate`, `artistic`, `romantic`. |
| `theme` | string | no | `light`, `dark` or `either`. `light` and `dark` filter by the system's real `--bg` token. |
| `surface` | string | no | `web`, `mobile`, `slides`, `document` or `dashboard`. |
| `likeBrands` | string[] | no | Products the user wants it to feel like, e.g. `["Notion"]`. A named system goes first. |
| `avoid` | string[] | no | Design system ids or moods to leave out. |
| `brief` | string | no | The request in the user's words, used as a light keyword fallback (and to fill empty `moods`/`industries` from words like "yoga" or "fintech"). |
| `limit` | number | no | 3 to 5, default 5. |

**Result:** `{ recommendations, confidence, questions?, ignored?, activeDesignSystemId }`.

- `recommendations`: `{ id, name, category, kind, reason, facets }` in rank order. `kind` is `genre` or `brand`; product-named (`brand`) systems rank below every matching genre unless the user named them. `facets` are computed from the tokens: `theme`, `accent`, `accentFamily`, `display` (`serif`, `sans` or `mono`), `displayFont`, `shape` (`sharp`, `soft` or `round`).
- `confidence`: `high`, `medium` or `low`.
- `questions`: only when the profile has fewer than two fields and confidence is low. Up to three multiple-choice questions (what it's for, how it should feel, light or dark) plus an optional free-text one (a product it should feel like). The agent asks them once and accepts "you pick". With an empty profile the list starts with `default`.
- `ignored`: values outside the lists above, which were skipped.

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

Composes the instructions for a new design. It combines the skill's workflow, the design system's tokens, the craft rules the skill asks for and the user's brief, plus any [host override](../guides/youtube-video.md#how-it-works) for skills that assume Open Design's desktop daemon. **It writes nothing.**

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
| `answers` | object | no | The user's answers to the surface's [questions](../guides/generate-a-design.md#a-few-questions-first) (and the design-system recommender's), by question id, e.g. `{ "where": "Printed" }`. |
| `assumptions` | string[] (≤ 6, ≤ 160 characters each) | no | What the agent decided without asking, e.g. `["dark theme"]`. Answers and assumptions together are at most 2 KB. Both go into a **Build to these decisions** section, and the Output section asks the agent to pass them to `register_open_design_artifact` as `brief`. |

**Result:** `{ instructions, suggestedEntryPath, suggestedKind, format?, fluid?, designSystemId?, designSystemName?, designSystemHint?, outlinePath?, sources? }`. `outlinePath` and `sources` (`[{ path, markdownPath, kind }]`) are present when `sources` was given. `designSystemHint` is present when no design system was used, and points at [`recommend_open_design_design_systems`](#recommend_open_design_design_systems).

When `.open-design/history.json` lists earlier designs, the instructions also get a **Recent designs** section: up to five recent unrelated designs (theme, hero layout, display font, accent), with the rule to look recognisably different in at least two of those unless the user asked for the same look or the design system fixes it. For a [collection](../guides/generate-a-design.md#collections) screen, its earlier screens are listed under **Keep consistent with** instead. Exploration sketches are left out. `"variety": false` in `.open-design/config.json` turns the section off. See [Why designs vary](../guides/generate-a-design.md#why-designs-vary).

**Errors:** unknown `skillId`, `designSystemId` or `format` (the message lists valid ids), `screenRole` missing with `collectionId`, a source that can't be read (the message names it), and `answers` or `assumptions` over their limits (the message names the limit; no brief is prepared).

#### Canvas formats

| Id | Medium | Size | Safe area | Bleed | Min. type | Byte budget |
|---|---|---|---|---|---|---|
| `x-image` | screen | 1600×900 px | 48 px | | | 5 MB |
| `ig-square` | screen | 1080×1080 px per card | 48 px | | | 8 MB |
| `ig-portrait` | screen | 1080×1350 px | 48 px | | | 8 MB |
| `pinterest-pin` | screen | 1000×1500 px (2:3) | 48 px | | | 20 MB |
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
| `shop-product` | screen | 2048×2048 px | 96 px | | | 20 MB |
| `shop-banner` | screen | 1920×800 px | 120 px | | | 20 MB |
| `shop-collection` | screen | 1920×600 px | 120 px | | | 20 MB |
| `a4` | print | 210×297 mm | 5 mm | 3 mm | 9 pt | |
| `a3` | print | 297×420 mm | 5 mm | 3 mm | 10 pt | |
| `a2` | print | 420×594 mm | 10 mm | 3 mm | 14 pt | |
| `a1` | print | 594×841 mm | 10 mm | 3 mm | 18 pt | |
| `a0` | print | 841×1189 mm | 15 mm | 3 mm | 24 pt | |
| `a5` | print | 148×210 mm | 5 mm | 3 mm | 8 pt | |
| `a6` | print | 105×148 mm | 4 mm | 3 mm | 7 pt | |
| `a7` | print | 74×105 mm | 3 mm | 3 mm | 6 pt | |
| `letter` | print | 8.5×11 in | 5 mm | 0.125 in | 9 pt | |
| `tabloid` | print | 11×17 in | 5 mm | 0.125 in | 10 pt | |
| `poster-18x24` | print | 18×24 in | 10 mm | 0.125 in | 14 pt | |
| `poster-24x36` | print | 24×36 in | 12 mm | 0.125 in | 18 pt | |
| `postcard-4x6` | print | 4×6 in | 4 mm | 0.125 in | 7 pt | |
| `business-card` | print | 85×55 mm | 3 mm | 3 mm | 6 pt | |
| `business-card-us` | print | 3.5×2 in | 0.125 in | 0.125 in | 6 pt | |
| `trading-card` | print | 2.5×3.5 in, corners cut round (0.125 in) | 0.125 in | 0.125 in | 6 pt | |
| `tarot-card` | print | 2.75×4.75 in, corners cut round (0.125 in) | 0.125 in | 0.125 in | 6 pt | |
| `mini-card` | print | 1.75×2.5 in, corners cut round (0.125 in) | 0.125 in | 0.125 in | 5 pt | |

Headers, banners, the email header, the display ads, shop images, business cards and game cards are left out of a shape sheet that names no `presets`, since they need a design's own banner layout. Print sizes are trim sizes. The design's `[data-od-card]` is authored at the trim size plus the bleed on every side (A3: 303×426 mm), and the safe area is measured inside the trim. For cards, the printer cuts the corners round: the design keeps square corners with bleed, and preflight warns (`corner-clearance`) about text in a corner.

### register_open_design_artifact

Call after the entry file (and any supporting files) is written. Validates the artifact and writes its manifest sidecar `<entry>.artifact.json`. In VS Code it also opens the [preview](../guides/preview-comments-edit.md). Through the MCP server, the result points the agent at [`open_open_design_preview`](#open_open_design_preview), or opens the browser preview itself when [`OPEN_DESIGN_PREVIEW`](settings-and-env.md#open_design_preview) is `auto`. For Claude clients (Claude Code, Claude Desktop) on a design with no Claude artifact yet, it also suggests the private artifact preview ([`publish_open_design_artifact`](#publish_open_design_artifact) with `provider: "claude-artifact"`).

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
| `resolvedCommentIds` | string[] | no | Ids of the user's [comments](../guides/browser-preview.md#comments) (from `openComments`) that this edit addressed. They're marked resolved and their pins leave the preview; unknown ids are reported. |
| `brief` | `{ text?, answers?, assumptions? }` | no | What was asked and assumed: the request in one line (`text`, ≤ 500 characters) and the same `answers` and `assumptions` passed to `prepare_open_design_brief`. Stored as `metadata.brief`; a new one replaces the old, and registering without it keeps the old one. |
| `critique` | object | no | The design critic's latest opinion from the [`open-design-critique` skill](../guides/generate-a-design.md#second-opinion): `{ verdict, findings, checkRunId?, at? }`, with `verdict` `ship`, `polish` or `rework` and at most 5 `findings` of `{ area, where?, problem?, fix }`. Stored as [`metadata.critique`](artifact-manifest.md#metadatacritique), replacing the last one; `checkRunId` defaults to the latest saved check run and `at` to now. An unknown verdict or area, a finding without `fix`, more than 5 findings or a record over 4 KB fails the registration and leaves the manifest as it was. |

**Result:** the written manifest. See [Artifact manifest](artifact-manifest.md). Registering also adds or updates the design's line in `.open-design/history.json` (see [Why designs vary](../guides/generate-a-design.md#why-designs-vary)). With `explorationId`, the result also reports the comparison page's path and which directions are still missing. If the exploration has no plan, the artifact is still registered and the result carries a warning. While the [public gallery](../../gallery/README.md#linking-it-from-the-kit) is live, a design made with a bundled design system (the one passed as `designSystemId`, or the active one) also gets `designSystem: { id, name, galleryUrl }`, the system's gallery page, which the skill names when the design is ready.

With `sources`, the result also runs a **number check** on HTML entries: it lists numbers in the page's visible text (speaker notes included) that appear in none of the sources, each with surrounding text, up to 50. Integers 0–12 and years 1900–2100 are ignored, and grouping doesn't matter (`1,200` matches `1200`). It's a prompt to verify, never an error. A source that can't be read is reported and left out.

### get_open_design_artifact

Reads an artifact back.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | Workspace-relative path to the entry file. |
| `critique` | boolean | no | Return the critique input instead (below). Default `false`. |

**Result:** `{ manifest, supportingFiles, entryContent, openComments, commentScreenshotsAttached?, staleSources?, previewUrl? }`. `openComments` holds the user's comments from the VS Code preview or the [browser preview](../guides/browser-preview.md) that haven't been resolved (status `open`, or `sent` once handed to the agent). Each names its element (`selector`, `text`, `htmlHint`, `rect` and `viewport`) and has the user's `note`; a comment made in the browser preview also has `screenshot`, the workspace-relative path of a crop of the element. Up to 4 crops are attached to the result as images, newest first, and `commentScreenshotsAttached` lists whose. The agent should address the comments, then pass their ids as `resolvedCommentIds` to `register_open_design_artifact`. See [Preview, comment and edit](../guides/preview-comments-edit.md). `staleSources` is present when the manifest records sources: each `{ path, reason }` where the source has `changed` since registration or is `missing`. `previewUrl` is the design's Claude artifact link (the newest `claude-artifact` record in [`metadata.shares`](artifact-manifest.md#metadatashares)), when it has one.

With `critique: true`, the result is what the [design critic](../guides/generate-a-design.md#second-opinion) judges: `{ critiqueInput: { entryPath, kind, title, brief?, sourceSkillId, format?, designSystem?, checkRun?, lastCritique? } }`. `brief` is the manifest's `metadata.brief` when it records one; `designSystem` is `{ id, name, designMd }` for the manifest's `designSystemId`; `checkRun` is the latest [saved check run](../guides/browser-preview.md#checks) (`id`, `dir`, `createdAt`, `errors`, `warnings`, `findings`, and `images` as `{ label, path }`), and its screenshots are attached as images in that order; `lastCritique` is the current [`metadata.critique`](artifact-manifest.md#metadatacritique). With no saved run, the result asks the agent to run `check_open_design_artifact` first.

### open_open_design_preview

MCP hosts only (Claude Code, Codex, Cursor and others). Shows a registered artifact in the [browser preview](../guides/browser-preview.md): a live page that reloads when the design changes, with a Comment mode and a Checks panel. It opens an app window of the installed Chrome, Edge or Chromium; without one, the default browser; when nothing can be opened (a remote session), it returns the URL. The preview lasts as long as the MCP server; later calls switch the same window to another artifact.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | no | Workspace-relative path to a registered entry file. Omit it for the list of the workspace's designs. |
| `open` | boolean | no | Open a window (default `true`). `false` only starts the preview and returns its URL. |

**Result:** the preview URL and how it was opened (browser window, default browser, or not opened and why). With [`OPEN_DESIGN_PREVIEW`](settings-and-env.md#open_design_preview) set to `off`, it starts nothing and says so.

### set_up_open_design_browser_pane

MCP only, for Claude Desktop's Code tab. Adds an `open-design-preview` entry to the workspace's `.claude/launch.json`, so the Browser pane can start the live preview and show it beside the chat. The entry runs this server's own kit version with `preview --no-open --root-latest --port <port>`: the port is fixed per project (5317–5416, from the workspace's path), and `--root-latest` makes the pane's address open the newest registered design. It uses the `npx` beside the Node that runs the server when there is one. Other entries in the file are kept; an existing `open-design-preview` entry is updated to this version, so rename it to keep a custom one. A file that isn't valid JSON is left alone, and the result says so.

No arguments. **Result:** whether the file was created, updated or already up to date, and the port. The skill then asks the host's preview tool to start `open-design-preview`, and falls back to [`open_open_design_preview`](#open_open_design_preview) when there is no Browser pane.

### show_open_design_artifact

MCP hosts only. Shows a registered artifact, an exploration's directions side by side, or a fluid master's campaign sheet, [inline in the conversation](../guides/inline-preview.md) in hosts that render MCP Apps (Claude Desktop Chat). There the user can comment on elements and click **Ask Claude to apply**, which posts a message naming the entry and the comment ids; the export buttons post a request for `export_open_design_artifact`, since the host doesn't allow downloads. For an exploration, **Take this one** posts the user's pick, and the agent confirms the next step before calling `choose_open_design_direction`; a [style-tile](../guides/explore-directions.md) exploration also offers **Use as design system**, which asks for `next: "save-design-system"` directly. With `campaign: true` the page shows each tile of the master's last campaign sheet with its errors: a page-type piece opens in the artifact view, and **Fix this piece** posts the tile and its errors.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | no | Workspace-relative path to a registered entry file. |
| `explorationId` | string | no | An [exploration](#exploring-directions) to show instead: its directions side by side. |
| `campaign` | boolean | no | With a fluid master's `entryPath`: show its last campaign sheet (from `exports/campaign-sheet.json`) instead of the design. Without a sidecar the page shows `campaign-sheet.png`, or asks for an export with `campaignSheet: true`. |

**Result:** text for every host: the title, entry path and open comments (with `campaign`, each tile and its errors). The shown page follows the design: it checks for changes every few seconds (less often when idle, not while hidden) and re-renders after a new round, unless the user is writing a comment. So the skills show a design once; after that, in a host with MCP Apps, [`register_open_design_artifact`](#register_open_design_artifact) says whether the design is already shown inline or should be shown now. A host without MCP Apps (the Claude Code terminal, Codex) gets only this text, plus a hint to use [`open_open_design_preview`](#open_open_design_preview). An unregistered entry returns a not-registered result. The tool declares the `ui://open-design/preview` resource as its UI and returns the target as structured content for it.

### show_open_design_examples

MCP hosts that render MCP Apps only: the server lists it to no other host, where [`list_open_design_skills`](#list_open_design_skills) with `remixableOnly: true` does the same job. Shows the remixable examples [inline](../guides/inline-preview.md#pick-an-example) as a gallery: 24 cards a page, each with a live, view-only preview loaded when it scrolls into sight, and mode chips to filter. **Remix this** posts a message naming the example's skill id; the agent then calls [`remix_open_design_example`](#remix_open_design_example) (asking what to make first if the user hasn't said). The page copies no files itself.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `query` | string | no | Free-text filter on name, description and triggers. |
| `mode` | string | no | Exact mode, as `list_open_design_skills` takes. |
| `surface` | string | no | A surface id (`slides`, `poster`, …): only that surface's examples. |

**Result:** structured content with only the view, the filters and a title; the page reads the examples through `get_open_design_preview_state`. Called anyway by a host without MCP Apps, it returns a short text list of matching ids and names `list_open_design_skills`. While the [public gallery](../../gallery/README.md#linking-it-from-the-kit) is live, the result also has `gallery: { url }`, the gallery's examples hub (filtered with `#q=` when the call had a `query`), and the view shows **See them all in the gallery** where the host opens links.

### show_open_design_design_systems

MCP hosts that render MCP Apps only, like `show_open_design_examples`; elsewhere use [`list_open_design_design_systems`](#list_open_design_design_systems). Shows design systems [inline](../guides/inline-preview.md#pick-a-design-system) as tiles: name, category, the active mark, five palette swatches and the display and body fonts, from each system's `tokens.css` (or its DESIGN.md colors without one). Opening a tile shows its Visualize page, the same script-free page VS Code shows; **Use this design system** posts a message naming the id, and the agent calls [`set_active_design_system`](#set_active_design_system).

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `query` | string | no | Free-text filter on id, name, summary and category. |
| `category` | string | no | Exact category. |
| `ids` | string[] | no | A shortlist, shown in this order; `query` and `category` are ignored. |

**Result:** as for `show_open_design_examples`: only the view, filters and a title (plus `gallery` while the gallery is live, pointing at its design-systems hub), or a short text list for a host without MCP Apps.

### show_open_design_questions

MCP hosts that render MCP Apps only, like `show_open_design_examples`. Asks the user up to four short questions [inline](../guides/inline-preview.md#answer-questions-with-taps) as tappable choices, instead of a list in chat: the surface and design-system questions before a build, which direction after an exploration, "fix these?" after a review. Each choice question also gets a **You pick** chip. **Send** posts one chat message: a readable line of `id = label` pairs, and a machine line the skills tell the agent to read.

```text
Answers: where = Printed; mood = Dark, Bold
<!-- od-answers {"where":"printed","mood":["dark","bold"]} -->
```

Values are option ids (an array for `multi`), the typed text for `text`, or `you-pick` (the agent chooses and says what it chose). Unanswered questions are left out. The page calls no tool when you tap Send; if the host refuses the message, it shows the answers to copy and paste.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `questions` | object[] | yes | 1–4 questions, each `{ id, text, kind?, options?, default? }`. `kind` is `single` (the default), `multi` or `text`. `single` and `multi` take 1–8 `options` of `{ id, label, imageRef? }`, labels of at most 120 characters; a `text` question takes none. `default` preselects an option id (an array for `multi`) or prefills the text. Ids are 1–40 letters, digits, `-` or `_`; `you-pick` is reserved. |
| `title` | string | no | A short heading; default "A few quick questions". |

The whole schema must be under 2 KB as JSON. An option's `imageRef` names a picture the server already makes, loaded by the page through `get_open_design_preview_state`: `designSystem:<id>` (its palette), `example:<skillId>` (its preview), `artifact:<entryPath>` (its latest check screenshot, else the page) or `checkRun:<entryPath>` (that entry's latest check screenshot; `checkRun:<entryPath>#<runId>` for one run). URLs and HTML are refused, with a message listing these forms.

**Result:** in a host with MCP Apps, a short text telling the agent how to read the answer, and the checked questions as structured content for the page. Called anyway by a host without MCP Apps, it returns "Ask the user these in one message:" and the questions as a numbered list with their options.

### get_open_design_preview_state

Called only by the inline preview page, never by the model: hosts that render MCP Apps keep it out of the model's tool list, and the server lists it only to those hosts. For an artifact it returns the design as one self-contained page (local fonts and images inlined, the preview bridge injected), its comments, its latest check screenshots and the export formats offered. Over 5 MiB, or for a kind that isn't HTML, the page shows the latest check screenshot instead. For the pickers it returns one page of examples, the design-system tiles, a campaign sheet's tiles, one example's or design system's preview, or one question option's picture, so none of it passes through the model's context.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | no | The registered entry to show (or, with `view: "campaign"`, the master). |
| `explorationId` | string | no | The exploration to show instead. |
| `view` | string | no | `examples`, `design-systems` or `campaign`. |
| `query` | string | no | The examples' or design systems' filter. |
| `mode` | string | no | The examples' mode filter. |
| `surface` | string | no | The examples' surface filter. |
| `category` | string | no | The design systems' category filter. |
| `ids` | string[] | no | The design systems' shortlist. |
| `cursor` | string | no | The next page of examples, as the previous page returned it. |
| `exampleId` | string | no | One example's view-only preview (text instead over 5 MiB). |
| `designSystemId` | string | no | One design system's Visualize page. |
| `imageRef` | string | no | One [`show_open_design_questions`](#show_open_design_questions) option's picture: swatches, a screenshot (at most 1 MiB) or a view-only page. |
| `revisionOnly` | boolean | no | With `entryPath` or `explorationId`: return only `{ revision }`, a short hash of the files the view shows (entry, manifest, comments, checks, files beside it). The page polls it to follow edits. |

### save_open_design_comment

Called only by the inline preview page, like `get_open_design_preview_state`. It creates or edits one comment in `<entry>.comments.json`, merged by id the same way as the [browser preview](../guides/browser-preview.md#comments), or deletes one. `get_open_design_artifact` lists the result in `openComments`.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | The registered entry. |
| `comment` | object | no | The whole comment record to create or edit. |
| `deleteId` | string | no | The id of a comment to delete. |

### remix_open_design_example

Copies a real example into the workspace (with its assets), registers it, and returns instructions to **modify** it rather than start over. In VS Code the preview opens.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `skillId` | string | yes | An id with `remixable: true`. |

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
| `count` | integer 2–6 | no | Number of directions: 2–4, default 3; with the `style-tile` skill 2–6, default 4 (the visual library has five, so six tiles need `customDirections`). |
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
| `writeProjectDesignMd` | boolean | no | MCP only. Also writes the design system as `DESIGN.md` at the project root (design tokens in YAML front matter, then the system's text), for tools such as [Impeccable](../guides/impeccable.md) that read one. Never overwrites: if the project has a `DESIGN.md` at the root, in `.agents/context/` or in `docs/`, it is kept. Skipped in the managed designs folder. |

The active system is stored in the [`openDesign.activeDesignSystemId`](settings-and-env.md#opendesignactivedesignsystemid) setting (VS Code) or `.open-design/config.json` (MCP).

### create_open_design_design_system

Composes instructions for writing a custom design system: a `DESIGN.md` plus a sibling `tokens.css` following the Open Design token contract. **It writes nothing.**

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `name` | string | yes, unless `existingDesignSystemId` is given | Name, e.g. `Acme Corp`. |
| `brief` | string | yes, unless `existingDesignSystemId` is given | The brand in the user's words: colors, tone, industry. |
| `sourceUrl` | string | no | A website to take a rough starting palette, fonts and favicon from, by reading its source (best effort). To match a site, use [`extract_open_design_design_system`](#extract_open_design_design_system) first. |
| `existingDesignSystemId` | string | no | An existing custom design system (`user:<slug>`). Returns instructions to write **only** its `tokens.css`, from its current `DESIGN.md`; the other arguments are ignored. Built-in ids are rejected. |

**Result:** `{ instructions, suggestedEntryPath, id }`. The files go to `<outputDirectory>/design-systems/<slug>/DESIGN.md` and `…/tokens.css`, and the id is `user:<slug>`. After writing them, call `set_active_design_system` with that id. In tokens-only mode, `suggestedEntryPath` is the `tokens.css` path. See [Design systems](../guides/design-systems.md).

### extract_open_design_design_system

Renders a website in an installed Chrome, Edge or Chromium and measures its design system. **It writes no `DESIGN.md` or `tokens.css`**, only an evidence bundle at `<outputDirectory>/.extract/<site>/`.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `url` | string | yes | The page to measure, usually the home page. `http` or `https` only. |
| `extraUrls` | string[] | no | Up to 3 more pages on the same site, to fill in roles the first page lacks. |
| `theme` | `light` \| `dark` \| `both` | no | Default `light`. `dark` and `both` measure a dark theme only when the site has one (under `prefers-color-scheme: dark`, or a `data-theme`/`.dark` toggle on the root element). |

What it measures: the page background, card surface, body and secondary text, border, the primary button's colour, its text colour and its `:hover` and `:active` states (forced in the browser); `:root` and theme-scoped custom properties; the fonts the page loaded; text sizes, line heights and tracking; radii, spacing and the container width; transition durations and easing. Each page is shot at 1440×900 and 390×844.

**Result:** `status` (`ok`, `partial` or `blocked`), the bundle path, screenshots (the desktop one is attached as an image), `draft.tokens` (contract names only, plus `draft.dark` when the site has a dark theme), `draft.sources` (the element and crop each value came from), `draft.unmeasured` (left to the contract's fallbacks), `draftCss`, and `marks` (the logo and favicon). With no browser it reads the page source instead and returns `partial` with candidate colours and fonts. A bot check, a login redirect or an empty page is `blocked`, with its screenshot.

Limits: public addresses only (private, loopback and link-local hosts are refused, for the page and everything it loads); at most 4 pages, 20 seconds each; no cookies, logins or form submissions. See [Design systems](../guides/design-systems.md#take-one-from-a-website).

## Beyond the prototype

### port_open_design_artifact_to_app

Composes instructions to rebuild a finished artifact as real, idiomatic code in the workspace's own app. **It writes nothing.**

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | The artifact to promote. |
| `targetComponentPath` | string | no | Where the new component should go. A suggestion is returned when omitted. |
| `referenceComponentPath` | string | no | An existing component to follow as the pattern. The agent finds one when omitted. |

**Result:** `{ instructions, suggestedTargetComponentPath }`. Routing and navigation wiring are left to you. See [Promote to app code](../guides/promote-to-app-code.md).

### prepare_open_design_component_library

Composes staged instructions to turn one or more reviewed artifacts into a reusable component set in the workspace's React app, on **Material UI themed to Material 3** (`mui`) or **shadcn/ui** (`shadcn`). **It writes no app code.** The only file it changes is the artifacts' manifests, on the `record` call. See [Build a component set](../guides/component-library.md).

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPaths` | string[] (1–10) | one of these two | Registered artifacts to build the set from. |
| `collectionId` | string | one of these two | Instead of `entryPaths`: every screen of this [collection](../guides/generate-a-design.md#collections). |
| `library` | `auto` · `mui` · `shadcn` | no | Default `auto`: `mui` when the app depends on `@mui/material`, `shadcn` when it has a `components.json` (or Radix and Tailwind). When it can't tell, the result is `needs-choice` and the agent asks once. A library the app doesn't have yet gets an install step the agent asks about first. |
| `outputDir` | string | no | Workspace-relative folder for the components, inside the app. Default: `<app>/src/components/<DesignName>` (`components/` when the app has no `src/`), or the folder an earlier record names. The app is the nearest `package.json` from this folder up. |
| `record` | object | no | Stage 5 only: `{ library, outputDir, themePath, components: [{ name, path, sourceSelectors? }] }`. Writes it as [`metadata.componentLibrary`](artifact-manifest.md#metadatacomponentlibrary) on each artifact and returns a confirmation instead of instructions. At most 60 components and 4 KB. |

**Result:** the instructions, in five stages:

1. **Inventory.** Up to 40 candidates from a scan of the designs: element groups with the same tag and classes seen two or more times, plus every button, input, `nav`, `header`, `footer` and top-level `section`; what several designs share comes first. The agent writes `components.md` beside the first artifact (name, source selectors, variants, props, states) and **stops for the user's approval**.
2. **Theme.** Generated from the artifact's design system (or its own `:root` tokens) by a fixed mapping: a `createTheme` options object for MUI, the `:root` variables (hex and HSL forms) for shadcn. Tokens without a slot are listed with where they could go.
3. **Components** that wrap the library's own ones, take content through props and read every colour, size and radius from the theme.
4. **Gallery:** Storybook stories when the app has Storybook, otherwise one unrouted `ComponentGallery` component.
5. **Check and record:** the app's type check or build, then the `record` call.

When an artifact already records a set for the same library, the instructions switch to **update mode**: they name the existing files, and list recorded components no longer found in the design for the user instead of deleting them.

**Errors**, each prefixed `Component set not prepared (<code>)`: `invalid-args`, `not-registered` (an entry path without a manifest), `unsupported-library` (anything but `auto`, `mui`, `shadcn`), `no-app` (no `package.json`), `unsupported-framework` (the app doesn't depend on `react`; it names what it found), `needs-choice`, `invalid-record`.

**Example (MCP arguments):**

```json
{ "entryPaths": [".open-design/pricing/pricing.html"], "library": "mui" }
```

### share_open_design_artifact_to_community

VS Code only. Composes instructions to package a finished artifact as a new entry in the community catalog and open a pull request under your own GitHub identity. **It writes nothing and runs nothing itself.** The instructions require the agent to check with you before anything public happens.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | The artifact to share. |

**Result:** the instructions text.

### publish_open_design_artifact_to_canva

Composes instructions to get a finished artifact into Canva. **It writes nothing, and talks to Canva only to send a private upload you chose.** The agent exports the artifact (`pdf`, or `pptx` for a registered deck), then checks whether your Canva MCP server is connected ([`list_open_design_integrations`](#list_open_design_integrations)):

- **Canva connected:** it explains two routes, recommends the first and waits for your choice.
  - **Editable design.** The export is hosted briefly on a public link through [`publish_open_design_artifact`](#publish_open_design_artifact) with `includeFiles`, after that tool's own confirmation (`cloudflare-temporary` or your own host, never `netlify-temporary`, whose links are password-protected). Canva's `import-design-from-url` then converts it into a design, and the agent checks it with `read-design` and gives you the edit link. It publishes a Brand Template with `publish-brand-template` only if you say yes.
  - **Private upload.** The file goes straight into your Canva **Uploads**, and you open it there to edit. Nothing goes public. The agent gets a single-use URL from Canva's `create-upload-url` and calls this tool again with `filePath` and `uploadUrl`. The Open Design server then sends the file from the machine it's on, so the agent doesn't need a terminal (Claude Desktop Chat may not have one ready). The server only uploads a file from the artifact's `exports/` folder, and only to an https `canva.com` URL.
- **Canva not connected:** the agent offers to connect it once. If you decline, it hands you the file with Canva's own **Import a file** steps.

The import passes a Canva design type when one fits the artifact: a deck becomes `presentation`, an `ig-square`/`ig-portrait` card `instagram_post`, `story` `your_story`, `x-image` `twitter_post`, `yt-thumbnail` `youtube_thumbnail`, `a4` `a4`, `letter` `us_letter`, and larger print sizes `poster`. Public Creator templates on Canva's marketplace stay a manual step in Canva.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | The artifact to get into Canva. |
| `filePath` | string | no | The exported file for a private upload, as [`export_open_design_artifact`](#export_open_design_artifact) returned it. Give it with `uploadUrl`. |
| `uploadUrl` | string | no | The single-use URL from Canva's `create-upload-url`. With `filePath`, the tool uploads the file and returns its `fileId` instead of instructions. |

**Result:** the instructions text, or with `filePath` and `uploadUrl`, the upload's outcome.

### publish_open_design_artifact_to_shop

Gets finished shop designs into the user's online shop, product by product, from the same product list they were exported with. **It never contacts the shop.** See [Put your designs in your shop](../guides/sell-what-you-make.md#put-your-designs-in-your-shop).

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPaths` | string[] | yes | The registered designs to put in the shop, each filled per product with `data-od-field` (the product image, then a second angle…). Their images become `<product>-1`, `<product>-2`… in that order. |
| `shop` | `shopify` · `bigcartel` · `etsy` · `other` | yes | Where the user sells. |
| `data` | string | for the folder | The product list (CSV, XLSX or JSON array), one row per product. |
| `nameField` | string | no | The column with each product's title. Default: a `title`, `name` or `product` column. |
| `folder` | boolean | no | Shopify only: write the hand-off folder now instead of the connector instructions. Other shops always get the folder. |

- **Shopify, without `folder`:** instructions only. The agent checks for Shopify's connector ([`list_open_design_integrations`](#list_open_design_integrations)). When it's connected, the agent shows the product matches before writing anything, makes the first three updates one at a time with the user's go-ahead, creates new products only as drafts, leaves price, stock and visibility alone unless asked, attaches images only if a connector tool can, and reports what changed per product. Its tool names aren't verified yet, so the agent finds them by description.
- **The hand-off folder** (`folder: true`, and always for other shops): each design is exported once per product and gathered into `<design folder>/for-<shop>/` with images named `<product>-<n>.png`, `copy.md` (each product's title, price and description), and for Shopify a `products.csv` in Shopify's import format: products unpublished, image links empty. The result lists the files, the columns used and left out, and the shop's own upload steps.

Columns for cost, margin, supplier, stock, SKU or notes are never used, whatever the arguments say.

**Result (text):** the instructions, or the written files and the upload steps.

### pull_open_design_figma_frame

Composes instructions to rebuild a Figma frame as code with 1:1 fidelity. **It writes nothing and never needs a token when Figma is connected.** The agent checks for your Figma MCP server ([`list_open_design_integrations`](#list_open_design_integrations)). When it's connected, the agent loads Figma's design-to-code guidance, then uses Figma's `get_design_context` (reference code, a screenshot and asset links), `get_variable_defs` and `get_screenshot`, and translates the result into a registered artifact.

A Figma token is optional: the "Open Design: Set Figma Access Token" command in VS Code, or [`OPEN_DESIGN_FIGMA_TOKEN`](settings-and-env.md#open_design_figma_token) for MCP. With one, the tool also fetches the frame's structure and a rendered image through Figma's REST API and includes them as ground truth. It's the fallback when Figma isn't connected. With neither, the agent offers to connect Figma or explains the token.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `figmaUrl` | string | yes | A frame link from Figma's "Copy link to selection" (it must contain `node-id`). Branch, FigJam (`/board/`), Slides and Make links work too. |
| `designSystemId` | string | no | A design system to align the code with. |

**Result:** `{ instructions, suggestedEntryPath }`, or a request for a frame link when the link has no `node-id`. See [Figma](../guides/figma.md).

### push_open_design_artifact_to_figma

Pushes a finished artifact into Figma as editable layers through your Figma MCP server. **It never contacts Figma itself.** It renders the artifact in a headless browser and captures its layers, or reuses a capture newer than the file. Then it writes ready-to-run code parts (at most 30,000 characters each) and the artifact's images under `exports/figma/`, and returns instructions:

1. Check that Figma is connected.
2. Ask you whether to add the design to an existing Figma file (paste its link) or a new one.
3. Load Figma's `figma-use` guidance.
4. Run each part with Figma's `use_figma` exactly as written.
5. Upload the images with `upload_assets`.
6. Verify with `get_screenshot` and give you the link.

A push always adds a new frame and never changes existing layers. Without a Figma connection, the instructions offer setup, then fall back to the OD Figma Import plugin.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | The artifact's entry file. |
| `refresh` | boolean | no | Capture again even when a capture newer than the file exists. |

**Result:** the instructions text, after writing `exports/figma/` (`part-NN.js`, `images/`, `manifest.json`) and `<entry>.od-figma.json`. See [Figma](../guides/figma.md).

## Export

### check_open_design_artifact

Renders a registered artifact in a headless browser (an installed Chrome, Edge or Chromium, never downloaded) and returns what it looks like: **screenshots attached as images** plus [preflight](../guides/posters.md#preflight-checks) findings. It doesn't change the artifact or its manifest; it saves each run's screenshots and findings under `.open-design/.checks/` (see [Saved check runs](#saved-check-runs)). The agent calls it after creating or substantially editing a design, before saying it's done: it fixes every error, looks at the screenshots for what checks can't measure (balance, hierarchy, crowded or empty areas), and re-checks, for at most two rounds.

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
| `views` | (`overview` · `closeup` · `low` · `wireframe`)[] or `false` | no | 3D scenes that expose their handles (below): which review views go on the review sheet. Default all four; `false` for no sheet. |
| `states` | boolean | no | Pages: run the [state accessibility checks](#taste-and-accessibility-checks) (hover and focus, tap targets, 320 px reflow, reduced motion). Default `true`; `false` for a faster check. |

Screenshots are JPEG, at most 1568 px on the long edge. A page's first screen at each viewport comes first; further screens down a tall page fill the remaining images, and the result lists what was left out.

**Result:** text with the findings (errors first), the attached screenshots' labels and sizes, what wasn't attached, and any warnings; then the screenshots. In VS Code they're image parts of the tool result; over MCP they're `image` content items after the text. A client that ignores images still gets every finding in the text.

When the artifact was registered with `sources` and any of them changed since, the findings include `stale-sources` (info).

#### Taste and accessibility checks

Besides the [preflight checks](../guides/posters.md#preflight-checks), the check reports two more groups.

**Taste** (always warnings, never failing an export or a registration). They point at the looks that make a design read as default AI output. The agent fixes them unless the brief or the design system asks for that look.

| Check | Finds |
|---|---|
| `slop-glow` | A gradient or blurred glow (`filter: blur` ≥ 40 px) in the purple-blue band (hue 235–300°, saturation ≥ 0.45, other stops blue, cyan or pink) covering at least a quarter of the first screen (or of the card), reported once; or `--accent` or a button filled with a default Tailwind indigo (`#6366f1`, `#4f46e5`, `#4338ca`, `#3730a3`, `#8b5cf6`, `#7c3aed`, `#a855f7`) |
| `card-row` | Pages: a row of three or four cards of the same width (within 4 px, each ≥ 160 px) and structure, each an icon (≤ 64 px), then a heading, then text. Reported once per row |
| `uniform-surface` | Pages: six or more card-like boxes (a border or shadow, a background unlike their parent's) that all share one radius (≥ 4 px) and one shadow |
| `type-scale` | Pages that declare `--text-*` or `--font-display`/`--font-body`: an `h1`/`h2` whose size is more than 1 px from every `--text-*` step (the finding names the nearest), or whose font is neither display nor body |
| `intent` | A button or button-like link whose text says it destroys something (delete, remove, discard, erase, revoke, reset, cancel subscription, close account) or that has `data-intent="destructive"`, coloured neither red nor with `--danger`; or a primary action (`type="submit"` or `data-intent="primary"`) styled exactly like a button next to it |

For a deliberate exception (a brand that really is purple, three equal pricing tiers), put `data-od-allow` on the element or an ancestor, listing the codes: `<html data-od-allow="slop-glow">`. The agent doesn't add it just to pass. The destructive words are English; on other pages use `data-intent`.

**Accessibility in states** (pages only; decks, posters and cards skip them; `states: false` turns them off):

| Check | Finds |
|---|---|
| `state-contrast` | At desktop width, with `:hover`, then `:focus` and `:focus-visible` forced on up to 60 buttons, links, inputs and `[tabindex]` elements: text below 4.5:1 (3:1 for large text) in a state that changes the element. Text over images or gradients is listed as not checked |
| `focus-visible` | An error: an element that shows no visible change when focused (no outline, and no change of shadow, border, background, text decoration or `::before`/`::after`). The browser's own outline counts, so only pages that remove it without a replacement fail |
| `tap-target` | On the phone viewport: an interactive element smaller than 24×24 px whose 24 px circle touches another target (WCAG 2.2 target size, with its spacing exception). An error below 16 px. Links inside running text and labelled checkboxes are exempt |
| `reflow` | An error: at 320 px wide (WCAG 1.4.10), the page scrolls sideways or clips text. Not repeated when the phone viewport already scrolls sideways |
| `reduced-motion` | When the page animates: with `prefers-reduced-motion: reduce`, an animation or transition longer than 200 ms still running, or an element with `will-change: transform` or an inline transform still moving. Canvases (three.js) are exempt |

Hover and focus are forced through the Chrome DevTools Protocol, so effects run by scripts (`mouseenter`) aren't seen. Several elements failing the same check are reported as one finding listing five of them and the count. These checks add no screenshots unless they find an error; then a crop of the first element with no focus indicator (`focus: …`) and the 320 px render (`reflow 320px`) come after each viewport's first screen, within `maxImages`. They add about half a second to a typical page check.

#### Saved check runs

Each check that renders saves its screenshots and a findings summary to `.open-design/.checks/<entry>/<time>/`, keeping the last 5 runs per artifact. The result lists the saved image paths and, when there's an earlier run, its folder and how the error and warning counts changed (for example `errors 2 → 0`). Terminal agents such as Claude Code and Codex CLI don't show tool images to you, so this is how you see them: in the [browser preview's](../guides/browser-preview.md#checks) Checks panel, before and after side by side, or by opening the files. Add `.open-design/.checks/` to `.gitignore` if you don't want them committed.

For a 3D scene (a canvas marked `data-od-webgl`, or a three.js import), the check renders with software WebGL, waits for the scene's `window.odScene.ready`, and reports `webgl`: an error when the canvas has no WebGL context, a warning when it's one flat color. Export reports the same finding. See [3D objects](../guides/3d-objects.md).

When the scene also exposes `window.odScene.scene`, `camera` and `renderer` (the [3D object](../guides/3d-objects.md) ready contract), the check adds:

- **A review sheet**, attached second: one image with four views of the object. **overview** is a three-quarter view at 25°, **closeup** is nearer, **low** is level with the object's base (it shows floating parts), and **wireframe** shows the geometry on grey. The check pauses the page's animation loop, frames each view on the object's bounds from that view's direction, renders it directly and then restores the page. Meshes marked `userData.odStage = true` (a ground or an environment) and `ShadowMaterial` grounds are left out of the framing. `odScene.subject`, `odScene.focus` and `odScene.views` can override the framing.
- **3D evidence** in the text: the overview's color entropy, edge density, contrast and dominant-color share, plus the renderer's draw calls, triangles, geometries and textures. These are hints for the reviewer, not findings.
- **`webgl-budget`** (warning): the scene renders more than 300,000 triangles, 400 draw calls or 64 textures, which is slow in the software rendering that checks and exports use.

A three.js page without the handles gets a note saying how to enable the views.

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
| `embedAssets` | boolean | no | `standalone` only: download the remote assets the page declares (a [3D scene](../guides/3d-scenes.md)'s scene spec `assets`, or a [3D object](../guides/3d-objects.md)'s `application/od-assets+json` block: HDRIs, textures, glTF models with their files) and embed them in the page, so it works offline and as a [Claude artifact](../guides/share-and-publish.md#a-claude-artifact). The result lists each embedded asset and the page's size; it warns from 12 MB and fails above 16 MB (`too-large`), naming the largest assets. An asset that can't be downloaded is reported and left as its URL. The source file doesn't change. |
| `maxResolution` | `1k` · `2k` · `4k` | no | With `embedAssets`: the highest Poly Haven resolution fetched for textures and HDRIs. Default `1k`; 2k and 4k rarely fit in 16 MB. Models keep the resolution the page uses. |
| `target` | `wechat` · `notion` · `newsletter` · `generic` | with `paste` | Where the HTML will be pasted. See [Paste into WeChat, Notion and newsletters](../guides/paste-html.md). |
| `preset` | [format id](#canvas-formats) | no | Use a canvas format's settings instead of `width`/`height`/`selector`/`maxBytes`. A screen format captures each `[data-od-card]` at its size within its byte budget. A fluid design is reflowed to the preset's shape first, and for print the bleed is added to it. A print format writes a [print-ready PDF](../guides/posters.md#print-ready-pdfs) (the default format becomes `pdf`). Explicit arguments still win. Without `preset`, the format the artifact was registered with is used. |
| `bleed` | number 0–20 | no | Print PDFs only: bleed in mm on every side. Default: the format's. |
| `cropMarks` | boolean | no | Print PDFs only: add crop marks at the trim corners, in a 10 mm slug around the page. |
| `dpi` | integer 150–600 | no | PNG or JPEG of a print format only: the resolution. Default 300. The image is the bleed box at this dpi (a `trading-card` is 825×1125 px), and the dpi is written into the file. Not with `scale`. Over 8192 px a side is refused, naming the largest dpi that fits. |
| `printHouse` | string | no | A [print-house profile](#list_open_design_print_houses) id, such as `boardgamesmaker`. Each card face is written at that printer's exact upload size and file type, removing only bleed, and the result names the page the size came from. Fails if the design's format isn't one the printer takes. Not with `dpi`, `scale`, `width`/`height`, `presets` or `selector`. See [Send cards to a print house](../guides/posters.md#send-cards-to-a-print-house). |
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
| `transparent` | boolean | no | `png` only: capture without the page background, so whatever the design doesn't paint is transparent (cut-outs such as a [3D product shot](../guides/3d-objects.md)). The page, and a 3D scene's renderer, must have a transparent background; a warning says when every pixel came out opaque. Not re-encoded to fit `maxBytes`. |
| `campaignSheet` | boolean | no | Fluid designs only: also write `exports/campaign-sheet.png`: the design at every shape in `presets`, plus the first screen of every other piece registered in the same collection (landing page, email…), each marked when it has errors. Next to it, `exports/campaign-sheet.json` lists each tile in order (label, shape preset or member entry path, exported file, image, error findings) and `exports/campaign-sheet-tiles/` holds each tile's image. See [Run a campaign](../guides/campaigns.md). |

**Card backs:** a design with a `[data-od-card][data-od-side="back"]` element exports its faces as `<name>-front` and `<name>-back` (numbered when there are several fronts, and per row with `data`). A back with no bound fields is written once for the whole export, unless the printer wants one back per card. A print PDF puts the back on the page after its front, for double-sided printing.

**Result (text):** each written file with its pixel size, file size and format; for print images, the dpi (and, with `printHouse`, the printer and its source page); for decks, the slide count and the stage size and scale used; where the size came from; for print PDFs, the trim size, bleed and a note that the PDF is RGB; for page exports, the **preflight** findings, errors first ([the checks](../guides/posters.md#preflight-checks)); and any warnings (failed requests, blank slides, budget re-encoding). Details in [Export images](../guides/export-images.md), [Export decks and PDFs](../guides/export-decks.md) and [Posters and print](../guides/posters.md).

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

With `provider: "claude-artifact"`, it writes the `standalone` file (`exports/<name>.html`) instead, checks it against the Claude artifact viewer's limits (16 MB, and which hosts may serve scripts and stylesheets), and returns instructions for the agent to publish that file by its path with its own Artifact tool. The artifact is private until the user shares it, so there is no confirmation stage, and the badge is off unless asked. A page over 16 MB returns `artifact-too-large` and no instructions. Only agents with an Artifact tool (Claude Code, Claude Desktop) can use it.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `entryPath` | string | yes | The registered artifact's entry file. |
| `provider` | `netlify-temporary` · `cloudflare-temporary` · `netlify` · `vercel` · `cloudflare-pages` · `github-pages` · `claude-artifact` | no | Where to publish. Omitted: the instructions list the choices for the user to pick. |
| `includeFiles` | string[] | no | Up to 10 files from this artifact's own `exports/` folder (e.g. an exported PDF) to host alongside the page, at `files/<name>` in the bundle and publicly downloadable at `<site URL>/files/<name>`. They're listed among the files going out at the confirmation stage. A path outside the artifact's `exports/`, a missing file or a duplicate name is an error, and nothing is built. The Canva flow uses this to give Canva a URL to import. |
| `badge` | boolean | no | Add the closeable "Made with Open Design" footer badge. Default `true`, unless [`openDesign.share.badge`](settings-and-env.md#opendesignsharebadge) is off or [`OPEN_DESIGN_SHARE_BADGE`](settings-and-env.md#open_design_share_badge) is `0`. |
| `sync` | boolean | no | `claude-artifact` only (any other provider is an `invalid-args` error): carry the design's working files in the page, so [`restore_open_design_artifact`](#restore_open_design_artifact) can pick it up elsewhere. Stored as [`metadata.sync`](artifact-manifest.md#metadatasync); omitted, the stored setting is used, and `false` turns it off. See [Continue on another device](../guides/share-and-publish.md#continue-on-another-device). MCP only. |
| `published` | object | no | Record mode, after a successful deploy or publish: `{ provider, url, claimUrl?, expiresAt?, siteRef? }`. `url` and `claimUrl` must be `https:`; for `claude-artifact`, `url` is the `https://claude.ai/…` link and is also used as `siteRef`. Nothing is rebuilt. |

**Result (text):**
- Without `published`: the bundle's file list and preflight findings, then either the provider choices or the instructions for the chosen provider (check, confirm, deploy, report and record). For `claude-artifact`: the file's path and size, what won't load in the artifact, and the publish-and-record steps.
- With `published`: a confirmation. The link is stored in the manifest's [`metadata.shares`](artifact-manifest.md#metadatashares), replacing an earlier record for the same provider and site.

With sync on, the page to publish is `exports/<name>.sync.html`: the standalone page plus one `<script type="application/od-sync+json" id="od-sync">` block. The plain `exports/<name>.html` never carries it. The block counts toward the 16 MB budget: when page plus block would go over, the page is prepared without the block and the instructions say so (`artifact-sync-dropped`), so sync never stops the preview. The first time sync is on, the instructions tell the agent to say that anyone the artifact is shared with can read the files, and that earlier versions keep their copy.

**Example (MCP arguments):**

```json
{ "entryPath": ".open-design/launch/launch.html", "provider": "netlify-temporary" }
```

### restore_open_design_artifact

Writes a synced Claude artifact's working files back into the workspace, so the design can be edited and republished here: on another device, in a new Claude Code cloud session, or after editing it in a chat without the kit. The agent first reads the artifact with its own Artifact tool, which saves the page to a file, and passes that file's path. **It makes no network request.** MCP only.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `pagePath` | string | yes | The page the Artifact tool saved: absolute, or relative to the workspace. In Claude Desktop with a folder, a path in the connected folder. |
| `artifactUrl` | string | yes | The artifact's `https://claude.ai/…` link. Recorded as the design's `claude-artifact` share, so the next preview publish updates the same artifact. |
| `overwrite` | boolean | no | Replace local files whose content differs from the artifact's. Default `false`. |

What it checks, all before writing anything:
- **The bundle.** One `application/od-sync+json` block, a known version, and every file's SHA-256. A file with `sha256: null` was edited outside the kit: it's written and reported. A mismatched hash fails the restore.
- **Paths.** Every file goes under the [output directory](settings-and-env.md#open_design_output_dir) at its recorded path. A path that is absolute, has a `..` segment or resolves outside it refuses the whole restore.
- **Local work.** A file that exists with different content stops the restore, and the result lists it, unless `overwrite` is `true`. Identical files are left untouched. The manifest counts as identical when only its share records and `updatedAt` differ.

**Result (text):** the files written, those already identical, those edited outside the kit, and the [`sources`](artifact-manifest.md#manifest-fields) the design was built from that aren't present here (the bundle lists them but doesn't carry them).

**Errors:** a page without a sync block ("published without sync"), a damaged bundle, an unsafe path, differing files without `overwrite`, and an `artifactUrl` that isn't a claude.ai link. Nothing is written in any of these cases.

**Example (MCP arguments):**

```json
{ "pagePath": "/tmp/artifact-abc.html", "artifactUrl": "https://claude.ai/artifact/abc" }
```

## Recurring jobs

MCP only: VS Code has no scheduler. See [Recurring design jobs](../guides/recurring-jobs.md) for the job file and the per-surface setup.

### start_open_design_job_run

Starts one run of the job at `jobPath`. It validates the job file, listing every problem by field; works out the period key in the job's `timezone` (`2026-10-21` for `day`, the ISO week `2026-W43` for `week`, `2026-10` for `month`); and reads the run log `.open-design/jobs/<id>.runs.json`. When this period already has a `completed` run, it returns `skip` with a reason, unless `runNow` is set or (with `rebuildOnSourceChange`, the default) a workspace source's hash changed since that run. Connector snapshots aren't compared, since they're only refreshed during a run.

Otherwise it records a `started` run and returns:

- the `runId` and period key;
- the target: its entry path (`{period}` replaced in `series` mode), whether it exists, its `staleSources` and the preview link;
- the capabilities: `browser` (a browser found the way [export](#export_open_design_artifact) finds one) and `cloud` (`CLAUDE_CODE_REMOTE` is `true`);
- the outputs to make and the captures skipped for lack of a browser;
- the brief and the ordered steps. Without a browser, the steps leave out [`check_open_design_artifact`](#check_open_design_artifact) and the captures. With a recorded `preview.url`, they republish that artifact through [`publish_open_design_artifact`](#publish_open_design_artifact) with `provider: "claude-artifact"`.

In a cloud session that isn't on the job's state branch, it returns steps to check that branch out (or create it) and to call the tool again, and records nothing.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `jobPath` | string | yes | The job file, e.g. `.open-design/jobs/weekly-kpis.job.md`. |
| `runNow` | boolean | no | Rebuild even though this period already has a completed run. Not for scheduled prompts. |

**Errors:** an invalid job file, by field: a missing `timezone`, a `series` `target` without `{period}`, a connector source without `snapshot`, or a `deliver` entry that names a public provider or social posting.

### finish_open_design_job_run

Finishes a started run. It checks the target without a browser: missing local files the entry or its CSS references, empty `data-od-field` elements, leftover `{{`, `TODO` or Lorem ipsum, numbers on the page found in no recorded source, and (for a `preview` delivery) the standalone file against the artifact viewer's limits. Then it settles the status: `completed` only when no check reports an error, and `needs-review` when the job has `checks: required` and the run had no browser. Capture formats the job asks for are recorded as `skipped: no-browser` when the run had none. It writes the run record (status, period, source hashes, outputs, findings, times) and returns a one-paragraph summary plus the remaining steps: push the state branch in the cloud, and the commit, PR and connector deliveries only for a `completed` run.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `jobPath` | string | yes | The same job path. |
| `runId` | string | yes | The id `start_open_design_job_run` returned. |
| `status` | `completed` · `needs-review` · `failed` | yes | How the run went. |
| `outputs` | object | no | `{ written?: string[], notMade?: [{ output, reason }] }`: the workspace paths written, and outputs not made with why (`no-browser`, `no-artifact-tool`, …). |
| `notes` | string | no | A sentence or two for the record and summary. |

**Errors:** a `runId` that isn't a started run of this job, or one already finished. Nothing is written.

## Assets

### find_open_design_3d_assets

Searches [Poly Haven](https://polyhaven.com) for free CC0 3D assets and returns the direct file URLs a three.js page needs. **It writes nothing.** The [3D scene](../guides/3d-scenes.md) and [3D object](../guides/3d-objects.md) recipes use it for real sky light, PBR surfaces and models that shapes alone can't make convincingly.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `query` | string | yes | A few words: a material (`cobblestone`, `oak floor`), an object (`lantern`, `armchair`) or a sky (`sunset field`, `overcast`). |
| `type` | `hdri` · `texture` · `model` | yes | `hdri` for environment light and sky, `texture` for a PBR surface, `model` for an object. |
| `limit` | integer 1–10 | no | How many results. Default 5. |
| `resolution` | `1k` · `2k` | no | File resolution. Default `1k`; `2k` only for the hero object. |

**Result (text):** for each match, ranked by how many words match and then by popularity:
- the id, name and categories, plus size in meters and polycount for models (triangles can be up to twice the polygon count);
- the Poly Haven page and a thumbnail;
- the file URLs: the `.hdr` for an HDRI; diffuse, normal, roughness and ARM (AO, roughness, metalness) JPGs for a texture; the `.gltf` for a model;
- for a model, an `includes` map from each relative path inside the `.gltf` to its CDN URL. The `.gltf`'s textures live in other folders on the CDN, so a page loads models through a `LoadingManager` URL modifier built from this map. Offline copies that keep the relative layout don't need it.

Every result says the license (CC0: no attribution needed, free for any use) and carries the credit "Powered by Poly Haven (polyhaven.com)", which Poly Haven's API terms ask for. Requests identify the kit by User-Agent, and each type's asset list is fetched once per session. When Poly Haven can't be reached, the result says so and tells the agent to fall back to procedural materials.

**Example (MCP arguments):**

```json
{ "query": "lantern", "type": "model", "limit": 3 }
```

### list_open_design_print_houses

Lists the card and sticker printers whose upload sizes the kit knows, from the content's `print-houses.json`. Each profile has the formats it takes with the exact pixel size, file type and dpi, how it wants card backs (`per-card`, `shared` or `none`), and the printer's own page the sizes came from, with the date they were checked. **It takes no arguments and writes nothing.** Pass a profile's id as `printHouse` to [`export_open_design_artifact`](#export_open_design_artifact). When the user's printer isn't listed, the agent exports at 300 dpi and asks them to check the size against the printer's upload page.

**Result (text):** one line per profile, then that advice.

## Integrations

### list_open_design_integrations

Looks up the trusted third-party MCP servers a workflow step can use instead of a manual handoff: Canva, Figma, Notion, Google Drive, Slack, the posting services Buffer and Metricool, and X's official server. **It installs nothing, contacts no service and writes no files.** The agent calls it when a step would hand work to another service, checks its own tools against the returned patterns, uses an installed integration, and otherwise offers setup once and waits for the user's yes. See [Connect other services](../guides/integrations.md).

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `capability` | string | no | What the step needs: `design.import`, `design.upload`, `design.export`, `design.read`, `design.write`, `brand.kits`, `docs.read`, `docs.write`, `storage.read`, `storage.search`, `storage.upload`, `team.share`, `social.post`, `social.schedule`. |
| `integration` | string | no | One integration by id: `canva`, `figma`, `notion`, `google-drive`, `slack`, `buffer`, `metricool`, `x`. |
| `platform` | string | no | A social network, for `social.*`: `x`, `linkedin`, `instagram`, `facebook`, `threads`, `tiktok`, `youtube`, `pinterest`, `bluesky`, `mastodon`. |
| `agent` | `claude-code` · `claude-desktop` · `codex` · `vscode` · `cursor` · `generic` | no | Which agent the setup steps are for. VS Code defaults to `vscode`; the MCP server infers it from the connecting client (any Claude client other than Claude Code is `claude-desktop`), falling back to `generic`. `claude-desktop` covers Claude Desktop Chat, Cowork and claude.ai, where servers are added as claude.ai connectors. |

**Result (text):**
- With no arguments: the capability vocabulary and the list of integrations.
- With filters: the matching providers in priority order. Official platform servers come first, then vendors' official servers, then posting services; when several posting services match, it says to ask the user which one they use. Each provider lists its tools, the tool-name patterns that show it's installed, caveats, and setup steps for the agent. Then come the consent rules: install only after the user's yes, at user level, never write or ask for API keys, still ask before publishing or posting, and fall back to the manual path if declined.

**Example (MCP arguments):**

```json
{ "capability": "social.post", "platform": "linkedin" }
```

