# OpenDesign Agent Kit

Use [OpenDesign](https://github.com/nexu-io/open-design)'s design skills, design templates, and design systems directly from your AI coding agent — no daemon to run, no MCP server to configure. Whatever model you already have selected does the generation, using its own native file-editing tools; this project supplies the skill/design-system content and bookkeeping.

Today that's a VS Code extension (Copilot Chat). The name and repo layout anticipate more: shared, framework-agnostic logic already lives in its own package so a future npm package (for Claude Code, Codex, or other agent hosts) can reuse it without another restructure — see [Project structure](#project-structure) below. That second package isn't built yet.

Published under the **feimacode** entity; the VS Code extension's publisher id is `feima`.

## Project structure

```
packages/
  core/     @feimacode/open-design-agent-kit-core — content parsing (ContentIndex),
            generation-instruction composition, and vendored artifact-manifest
            logic. Framework-agnostic: no `vscode` import anywhere in this
            package, verified file-by-file before the split (not assumed).
  vscode/   the actual VS Code extension — package.json manifest, commands,
            language model tools, webviews, and the vscode-specific
            workspace-integration glue (active design system, artifact
            writer) that DOES need `vscode` and so couldn't move into core.
```

Both packages are `npm workspaces` members under the root `package.json`. `packages/core` has no build step today — `packages/vscode`'s esbuild bundle and `tsc` both resolve it directly from source through the workspace symlink. Assets (`assets/open-design/`, `instructions/`, `prompts/`) still live under `packages/vscode/` for now, even though a future npm package would likely want the same content pool — sharing that across packages is real, non-trivial scope deliberately left for when that second package actually exists, not solved preemptively.

## How it works

This extension contributes:

- **Language model tools** — `list_open_design_skills`, `list_open_design_design_systems`, `prepare_open_design_brief`, `register_open_design_artifact`, `get_open_design_artifact`, `set_active_design_system`, `remix_open_design_example`, `create_open_design_design_system`. Copilot's agent mode invokes these automatically, or you can reference them explicitly with `#od-skills`, `#od-design-systems`, `#od-artifact`.
- **Chat instructions** — steers Copilot toward the tools above when your request looks like a design ask.
- **Prompt files** — `/open-design-generate` and `/open-design-skills` general-purpose launchers, plus one generated slash command per *featured* skill/design-template (e.g. `/guizang-ppt`) for zero-ambiguity access to the most-curated ~23 entries — see `prompts/featured/`.
- **Commands** — `OpenDesign: Browse Design Systems` (Command Palette, or click the status bar item): a fuzzy-searchable, category-grouped picker over all ~152 design systems; picking one **sets it as the active design system** and opens Copilot Chat with a prefilled (still-editable) message naming it. `OpenDesign: Browse Gallery`: same pattern over ~167 remixable example artifacts — picking one remixes it into the workspace and opens the preview. `OpenDesign: Open Gallery Grid`: a richer visual alternative to the QuickPick (see below). `OpenDesign: Open Artifact Preview` (also on the Explorer right-click menu for `.html` files).
- **Status bar item** — always shows the current active design system (or "No design system"); click to reopen the browse picker.
- **Activity bar view** — a standalone "OpenDesign" container (own icon, `assets/icons/gallery.svg`) holding the "Gallery" tree, grouped by category, listing all remixable examples; click an entry to populate Copilot Chat with a prefilled message about it (nothing written until sent), or use the inline Preview/Remix icons for a read-only look or an immediate workspace copy.
- **Custom editor** — `OpenDesign Artifact Preview` (`priority: "option"` on `**/*.html`, reachable via "Reopen With..." or the commands above): a live-rendering webview with three modes — **View** (default), **Comment** (hover to highlight, click an element to pin a note; "Send to chat" hands selected comments to Copilot as a scoped edit instruction), and **Edit** (HTML artifacts only — hover to highlight, click an element to open a panel with element-kind-aware content fields (text / link href / image src+alt / raw HTML for containers) plus a curated style section (color, background, opacity, font family/size/weight, line height, letter spacing, text align, border radius/color/width/style, and per-side padding/margin), or remove the element — written straight back to the file with full undo support). In both Comment and Edit mode, hovering an element shows a thin blue outline and clicking it shows a thicker one that persists while its panel is open, so it's always clear what you're about to select and what's currently selected. Selecting also draws dashed alignment guide lines from the element's four edges across the full canvas, Figma-style, to help see how it lines up with the rest of the layout.

### Preview, comments, and WYSIWYG editing

Registering an HTML artifact auto-opens it in the OpenDesign Artifact Preview editor. This is a from-scratch (not literally line-for-line ported) implementation of the same mechanism open-design's own product uses — see `packages/core/src/vendored/SOURCE.md`-adjacent design notes in `openspec/changes/archive/2026-09-19-visual-artifact-editor/` for what was adapted vs. simplified. Two things carry over exactly from upstream's actual behavior:
- **Comments are never "applied" by a special engine.** They're gathered into a scoped instruction block and sent into a new chat message (`workbench.action.chat.open`, prefilled); the model edits the file with its own tools, same as any other request.
- **Comments persist as a plain sidecar file**, `<entry>.html.comments.json`, next to the artifact — visible, git-trackable, no database.

WYSIWYG editing works on HTML artifacts only (matches upstream — there's no JSX WYSIWYG path there either). The edit panel is modeled on open-design's own `ManualEditPanel.tsx` (read directly): content fields adapt to what you clicked (an `<img>` gets URL/alt fields, an `<a>` gets text/href, a container gets its raw HTML, anything else gets a text field), and the style section covers typography, box model (independent per-side padding and margin), border, and opacity. Deliberately not ported: upstream's flex-layout controls (direction/justify/gap/align-items), its design-token reference strip (needs a codebase-scanning index this extension doesn't have), drag-to-reposition, and its own in-panel undo/redo history — VS Code's native document undo already covers every applied edit, since each one goes through a real `WorkspaceEdit`. Known limitation: relative asset paths (`<img src="assets/x.png">`) inside a previewed artifact may not resolve in the sandboxed preview iframe — the file on disk is unaffected.

### Gallery and Remix

`remix_open_design_example` (and the `OpenDesign: Browse Gallery` command) copies one of ~167 vendored example artifacts (from open-design's `plugins/_official/examples/`, capped at 2MB per example — 2 outliers excluded) into the workspace as a real starting file, then tells the model to modify it rather than generate from scratch — mirroring upstream's actual Remix behavior, which turned out to need no daemon/project-database machinery to reproduce.

There are three ways to browse and remix the same example pool, for different situations:
- **QuickPick** (`OpenDesign: Browse Gallery`) — fastest, keyboard-driven; selecting an item remixes it directly (no separate preview/chat step — this is the deliberate fast/confirm path, unlike the other two).
- **Tree view** (the standalone "OpenDesign" activity bar icon → Gallery) — always one click away, grouped by category. **Clicking an item, or its inline "Use in Chat" icon, populates Copilot Chat with a prefilled (still-editable, not-yet-sent) message naming the example** — mirroring upstream open-design's own Gallery, where clicking a card populates the chat composer with its brief rather than doing anything immediately. Nothing is written to the workspace just from browsing/clicking. A read-only preview and a direct Remix are both still available as separate actions, via the item's inline context-menu icons (Use in Chat, Preview, then Remix).
- **Grid view** (`OpenDesign: Open Gallery Grid`) — a searchable card grid (search box + category filter chips), modeled on `feima-copilot-ai-flow`'s flow gallery (`webview-src/gallery/`) — same structural pattern (search + filter chips + CSS-grid cards + a singleton, reveal-on-reopen `WebviewPanel`), reimplemented in plain DOM/TS rather than React to stay consistent with this extension's other webview. Each card shows a **live thumbnail** of the actual example: fetched lazily (`IntersectionObserver`, one card at a time as it scrolls into view, not all ~167 upfront) and delivered as a plain HTML string over `postMessage` — read once from this extension's own bundled assets and handed straight to `iframe.srcdoc`, never through `asWebviewUri`/a resource fetch the webview's browser engine would have to load from a URL. **Clicking a card populates chat the same way as the tree view**; a "Preview" link and a "Remix" button on the card are the separate explicit actions.

Clicking to chat (`openDesign.chatWithExample`) calls the same stable `workbench.action.chat.open({ query, isPartialQuery: true })` API already used by `OpenDesign: Browse Design Systems` — the query names the skill id and includes its example prompt/brief, so the model can call `remix_open_design_example`/`prepare_open_design_brief` directly, but the message sits in the composer unsent until the user reviews and sends it. The tree view and grid view's read-only preview (`ExamplePreviewProvider`, `OpenDesign: Preview`) is a separate, lightweight webview from the full Artifact Preview editor — it only ever reads from this extension's bundled assets (never `asWebviewUri`, never a real file write) and offers its own "Remix into workspace" button for when you've decided you want it. All remix actions — from the tool, QuickPick, tree, grid, or this preview panel — call the same `performRemix()`/`remixAndOpen()` logic, so behavior (what gets copied, how the manifest is registered, what instructions are returned) is identical regardless of entry point.

### Visual design

The three webviews (Artifact Preview editor, Gallery grid, example preview panel) follow **open-design's own actual visual design language**, not generic VS Code theming — colors, corner radii, shadows, typography, and component shapes are hand-transcribed from `apps/web/src/styles/{tokens.css,base.css,primitives.css,viewer/*.css,home/plugin-marketplace-demo.css}` (read directly, not guessed) into a shared token module, `packages/vscode/src/extension/webviews/openDesignTheme.ts`. Concretely: near-black/near-white "ink" buttons with a fully pill-shaped (999px) primary action; a lime-green brand accent (`#87ea5c`) reserved for active/selected states; a distinct terracotta (`#d96a46`) for comment pins, rendered as open-design's actual 42px teardrop shape, not a generic dot; frosted-glass floating panels (`backdrop-filter: blur()`); a named radius ladder from 2px (chips) to 16px (large surfaces); and the **Albert Sans** variable font (vendored from open-design's own bundled copy, `assets/fonts/`, SIL OFL-licensed) at its default 600 font-weight. VS Code still adds `vscode-dark`/`vscode-light` classes to every webview body, which this theme uses to switch between open-design's own separate light/dark token sets — so it stays dark/light-aware without adopting whatever arbitrary colors the user's ambient editor theme happens to use. The Gallery tree view and status bar item are native VS Code UI (TreeView/StatusBarItem) and aren't restylable with custom CSS at all — this only applies to the three webviews.

### Active design system

There's a single **active design system** per workspace, persisted as the `openDesign.activeDesignSystemId` setting (visible/editable directly in `settings.json`, not just through the extension). `prepare_open_design_brief` uses it automatically whenever `designSystemId` is omitted, and generating with an *explicit* `designSystemId` also makes that the new active one — so you only need to say "use Starbucks" once per session, not on every request. Change or clear it via the browse command/status bar item, or the `set_active_design_system` tool (pass no id to clear).

`list_open_design_skills` returns a merged catalog of both open-design `skills/` (reusable task recipes) and `design-templates/` (rendering-style catalogue entries) — functionally interchangeable as a `skillId`, distinguished only by a `source` field. Each entry's id is namespaced by its `od.mode` (the field with the best coverage in upstream frontmatter, 98% vs. ~62% for `od.category`) as `od:<mode>:<name>` (e.g. `od:deck:guizang-ppt`), and `list_open_design_skills` can filter by an exact `mode` in addition to free-text `query`. Modes: `prototype`, `deck`, `design-system` (a skill that *authors* a design-system deliverable — unrelated to `designSystemId` below), `image`, `video`, `template`, `utility`, `audio`.

`list_open_design_design_systems` returns each system's `category` (~22 categories, e.g. "E-Commerce & Retail", "AI & LLM") and can filter by an exact `category` or free-text `query`; `prepare_open_design_brief` narrows the applied craft-rule set to a design system's own `craft.suggested` list (from its `manifest.json`) when one is active, instead of applying all craft docs unconditionally.

The actual file authoring is done by Copilot's own model using its normal edit tools; this extension never writes design content itself, only the artifact manifest sidecar (`<entry>.artifact.json`) once you've written the files.

### Custom design systems

Beyond the ~152 bundled ones, there are two ways to add your own — pick based on whether you're inventing a look or importing one that already exists:

- **Invent one from a brief** — `create_open_design_design_system` (or the `/open-design-custom-design-system` slash command): give it a name, a brief describing the brand, and optionally a reference website URL. If a URL is given, a lightweight, no-daemon extraction (`packages/core/src/generation/brandExtraction.ts`) fetches the page's HTML plus up to 3 same-origin linked stylesheets and regex-harvests candidate hex colors (ranked by frequency), `font-family` values, and a favicon/`og:image` — handed to the model as a rough starting point, not ground truth. Like every other content-producing tool here, it only composes instructions; the model authors the actual `DESIGN.md` with its own file-editing tools.
- **Import one that already exists** — `OpenDesign: Import Design System` (Command Palette, or the leading item in the Browse Design Systems picker): a multi-step wizard for the "our org already has a real design system, don't let anything paraphrase it" case. Pick a source — a **file on disk**, **pasted content** (opens a scratch editor to paste into), or a **GitHub repository** (a direct file URL, or a bare repo URL that probes common token locations — `DESIGN.md` itself first if present, then `tailwind.config.*`, `tokens.json`, `*.css` custom properties, etc., public repos only for now) — and it writes the `DESIGN.md` **deterministically**, with no model involved: content that's already `DESIGN.md`-shaped is used verbatim, otherwise colors/fonts are regex-extracted the same way as the brief-driven path and wrapped with the *original source always preserved* in a "Source Reference" section, so nothing found automatically is ever the only record of it.

Either way, activation is the same: call/click `set_active_design_system` (or "Set as Active" after an import) — there's no separate "register" step, since a written file becomes selectable (alongside the built-ins, in `list_open_design_design_systems` and the Browse Design Systems picker, badged "custom") the moment it exists. Custom systems live at `<outputDirectory>/design-systems/<slug>/DESIGN.md` in your workspace (git-trackable, unlike the extension-bundled built-ins) and use ids prefixed `user:` to keep them unambiguous.

Both are deliberately scaled-down ports of open-design's own real "create a design system" feature (researched directly — a genuinely daemon-hosted hybrid of deterministic extraction plus an optional agent-refinement pass, itself not exposed as an agent tool at all). Still out of scope: Figma import and GitHub authentication/private-repo support (both need credential storage — a real next step, not built yet), screenshot/vision analysis (upstream itself doesn't have this either, removed for SSRF-safety reasons), and anti-bot-wall handling; a blocked or failed fetch just yields an empty/partial result rather than failing outright.

Generated artifacts land under `.open-design/<slug>/` in your open workspace by default (configurable via `openDesign.outputDirectory`), so they're visible in the Explorer and trackable in git like any other file.

### Grounding generation in an existing app

`prepare_open_design_brief` also checks (`packages/core/src/workspace/appDetection.ts`) whether the open workspace's own `package.json` lists a recognizable framework (React, Vue, Next.js, Nuxt, Svelte, Angular, Astro, Solid). It's a cheap signal, not a framework classifier — when something's detected, the composed instructions just nudge the model to look at a few of the app's real existing components/conventions with its own file-reading tools before generating, so the resulting prototype is closer to how the app already looks. This never changes where or how the artifact is written — it's still a standalone file under the output directory, not a real app file; that's what "Promoting a prototype to real app code" below is for.

### Promoting a prototype to real app code

Artifacts are sandboxed, standalone HTML files — great for fast, zero-risk iteration, but disconnected from a real app's actual code even when the open workspace already contains one. Once you're happy with a generated or edited artifact, `port_open_design_artifact_to_app` (or the "Promote to App Code" button in the Artifact Preview editor's toolbar) ports its design into the app for real — as idiomatic production code, not a copy-paste of the artifact's HTML. Like every other content tool here, it only composes instructions; the model does the actual porting with its own file-editing tools.

Reproducing the design well depends on grounding it in the app's *real* conventions, not guessing: the returned instructions direct the model to read an existing, structurally-similar component in the workspace first (styling approach, prop/typing style, file organization) and follow it, rather than copying the artifact's inline CSS verbatim — you can point it at one explicitly via `referenceComponentPath`, or leave it to search the workspace itself. `targetComponentPath` works the same way: pass one explicitly, or the tool suggests one (`packages/core/src/generation/portToAppInstructions.ts`'s `suggestTargetComponentPath` — a cheap, best-effort check for a conventional components directory, not a framework classifier).

Deliberately scoped as a one-time action, not a live sync: re-invoke the tool manually if you keep iterating the prototype afterward. Deliberately does **not** wire the new component into routing or navigation either — real blast radius on the rest of the app, left as an explicit step for you to review.

## Content

Skills, design templates, design systems, and remixable examples are vendored from [open-design](https://github.com/nexu-io/open-design) at build time via `npm run sync-content` (see `packages/vscode/scripts/sync-open-design-content.mjs`), not read live at runtime — this extension works standalone. By default this clones a shallow, sparse checkout of the **official public repo, pinned to a tagged release** (`DEFAULT_OPEN_DESIGN_REF`, currently `open-design-v0.22.2`) — not `main` — so the sync is reproducible for anyone who runs it, not just a machine with a specific local checkout, and doesn't silently pull different content depending on when it's run. To pick up a newer upstream release: check the [tags page](https://github.com/nexu-io/open-design/tags) for the latest `open-design-vX.Y.Z`, bump the constant, re-run `npm run sync-content`, and review the diff before committing. `npm run lint` enforces this pairing — it fails with a clear message if the pinned constant and `assets/open-design/MANIFEST.json`'s recorded `sourceRef` don't match (see `packages/vscode/scripts/check-content-sync.mjs`), so bumping the pin without re-syncing and committing the refresh doesn't silently pass review. Set `OPEN_DESIGN_SRC` to a local directory to bypass cloning entirely (e.g. for testing against a modified fork). The vendored content itself — `assets/open-design/` (1,100+ files, ~15MB) — **is committed to the repo**, not gitignored: unlike `node_modules`/`dist`/`out` (regenerable from public sources), it's the extension's core data, and while it *can* be regenerated by anyone via `npm run sync-content`, checking it in means the repo is immediately usable without that step. The same overall command also regenerates `packages/vscode/prompts/featured/` and the corresponding slice of `packages/vscode/package.json`'s `contributes.chatPromptFiles` (see `packages/vscode/scripts/generate-featured-prompts.mjs`) — don't hand-edit files under `prompts/featured/`, they're overwritten on every sync.

## Development

All commands run from the repo root; they delegate to the relevant workspace package (see [Project structure](#project-structure)):

```bash
npm install
npm run sync-content   # populates packages/vscode/assets/open-design/ from a pinned tag of the official open-design repo
npm run compile        # builds packages/vscode/dist/extension.js (Node) and packages/vscode/dist/webview/main.js (browser, for the custom editor)
npm run test:unit      # runs packages/core's test suite — the only package with tests today
```

`npm run typecheck` runs both packages: `packages/core` (plain Node, no DOM lib) and `packages/vscode` (Node extension-host code, plus a separate `tsc` pass for `packages/vscode/src/webview` — browser code, DOM lib, no Node types) — since the webview client and the extension host run in fundamentally different JS environments.

Then press F5 (or run the "Run Extension" launch config) to open an Extension Development Host and try it in Copilot Chat.

## Provenance

Two files under `packages/core/src/vendored/` are adapted from open-design (Apache-2.0). See `packages/core/src/vendored/SOURCE.md` for exactly what was ported verbatim, what was adapted, and what was deliberately rewritten from scratch instead of ported.
