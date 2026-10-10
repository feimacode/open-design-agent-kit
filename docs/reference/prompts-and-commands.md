# Prompts and commands

Everything you can start by name, per host. In short:

- **Explicit-only** entries run only when you invoke them.
- **Model-invocable** skills can also be picked up by the agent from a plain request.
- VS Code prompt files can only be started by the user; the agent is steered by the chat instructions and the tools instead.

## Curated entries

A curated subset of the skill catalog gets its own one-step command, which pins that skill and a ready-made example brief. An entry is curated when upstream Open Design flags it (`featured`, `recommended` or `od.default_for`) or when it's listed in this project's `packages/content/local/curated.json`. There are 27 at the time of writing, including `guizang-ppt` (editorial slide deck), `data-report`, `deck-swiss-international`, `card-twitter`, `card-xiaohongshu`, `social-carousel`, `poster-hero` and `social-youtube-thumbnail`.

How each host names them:

| Host | Name | Example |
|---|---|---|
| VS Code | `/od-<mode>-<id>` | `/od-deck-guizang-ppt A 10-slide pitch for…` |
| Claude Code (plugin) | `/open-design:od-<mode>-<id>` | `/open-design:od-prototype-card-twitter` |
| Claude Code (`init`) | `/od-<mode>-<id>` | `/od-deck-guizang-ppt` |
| Codex | skill `<id>` | `guizang-ppt` |

All of them are explicit-only. To see the current list, type `/od-` in the chat input, or look at `packages/vscode/prompts/featured/` or `.agents/skills/` in the repository.

## VS Code

### Prompt files (`/` in Copilot Chat)

| Prompt | What it does |
|---|---|
| `/open-design-new` | Start a new design by picking a [surface](tools.md#surfaces) (wireframe, poster, diagram…): asks only what's missing, then builds it with the right recipe. The Gallery's **New design** tiles prefill it. |
| `/open-design-campaign` | [Run a campaign](../guides/campaigns.md): one master design in every channel size and language, checked, with a campaign sheet. |
| `/open-design-docs` | Turn a folder of Markdown docs into [one designed page per file](../guides/engineering-docs.md#a-folder-of-markdown-docs), and refresh only the changed ones on a re-run. |
| `/open-design-generate` | Generate a design from a brief: picks a skill, prepares the brief, writes and registers the artifact. |
| `/open-design-list-skills` | Browse the skill catalog. |
| `/open-design-custom-design-system` | Invent a design system for your brand. |
| `/open-design-social-post` | [Design a social media post](../guides/social-posts.md) for a platform and export ready-to-upload files. |
| `/open-design-poster` | [Design a poster or flyer](../guides/posters.md) for print or screens, check it, and export print-ready PDFs or images, in other sizes or one per spreadsheet row. |
| `/open-design-explore` | [Explore 2–4 design directions](../guides/explore-directions.md) side by side, then take one forward. |
| `/open-design-publish` | [Share a design](../guides/share-and-publish.md) as a link or as one HTML file. |
| `/open-design-deck-from-source` | [Turn a document into a deck](../guides/deck-from-a-document.md), outline first. |
| `/open-design-integrations` | [See which services are connected](../guides/integrations.md#see-whats-connected) (Canva, Figma, Notion, Drive, Slack, social posting) and set one up. |
| `/od-<mode>-<id>` | The [curated entries](#curated-entries). |

Copilot also receives Open Design's chat instructions on every request, so a plain request ("make me a pricing page") works without any command.

### Commands (Command Palette)

| Command | Id | What it does |
|---|---|---|
| Open Design: Browse Design Systems | `openDesign.browseDesignSystems` | Fuzzy-search the design systems and set the active one (also on the status bar). |
| Open Design: Import Design System | `openDesign.importDesignSystem` | Import a design system from a file, pasted text or a GitHub repo. No model is involved. |
| Open Design: Preview Design System | `openDesign.previewDesignSystem` | Open the read-only preview (Visualize, Showcase, DESIGN.md / tokens.css) of a design system. Doesn't change the active one. |
| Open Design: Set as Active Design System | `openDesign.setActiveDesignSystem` | Make the selected design system active (Design Systems view). |
| Open Design: Use Design System in Chat | `openDesign.useDesignSystemInChat` | Prefill Copilot Chat naming the selected design system (not sent). |
| Open Design: Generate tokens.css | `openDesign.generateDesignSystemTokens` | Prefill Copilot Chat asking the agent to write a custom design system's `tokens.css` (not sent). |
| Open Design: Refresh Design Systems | `openDesign.refreshDesignSystems` | Rescan the Design Systems view. |
| Open Design: Browse Gallery | `openDesign.browseGallery` | Quick-pick the remixable examples; picking one remixes it. |
| Open Design: Open Gallery Grid | `openDesign.openGalleryGrid` | **New design** tiles (one per [surface](tools.md#surfaces); a click prefills `/open-design-new` in chat), then a searchable card grid of examples with live thumbnails. |
| Open Design: Open Artifact Preview | `openDesign.openArtifactPreview` | Open an HTML file in the preview (also on the Explorer's right-click menu). |
| Open Design: Remix | `openDesign.remixExample` | Remix the selected gallery example (Gallery view). |
| Open Design: Preview Example | `openDesign.previewExample` | Read-only preview of a gallery example. |
| Open Design: Use in Chat | `openDesign.chatWithExample` | Prefill Copilot Chat with a gallery example's brief (not sent). |
| Open Design: Set Figma Access Token | `openDesign.setFigmaToken` | Store a Figma personal access token, encrypted. |
| Open Design: Show Figma Import Plugin Folder | `openDesign.revealFigmaPlugin` | Reveal the bundled Figma import plugin for a one-time import into Figma desktop. |
| Open Design: Refresh Collections | `openDesign.refreshCollections` | Rescan the Collections view. |
| Open Design: Refresh Integrations | `openDesign.refreshIntegrations` | Re-check which [integrations](../guides/integrations.md#see-whats-connected) are connected (Integrations view). |
| Open Design: Show Integration Setup | `openDesign.showIntegration` | Open an integration's setup view (from the Integrations view). |
| Open Design: Open Comparison in Browser | `openDesign.openExplorationComparison` | Open an [exploration's](../guides/explore-directions.md) comparison page in your browser (from the Collections view). |
| Open Design: Sync Community Designs | `openDesign.syncCommunityContent` | Fetch the community catalog at [`openDesign.communityContentRef`](settings-and-env.md#opendesigncommunitycontentref). |
| Open Design: Open Docs | `openDesign.openDocs` | Open this documentation in the browser. |

The Open Design activity-bar icon has four views: **Gallery** (examples by category), **Design Systems** (every design system by category, with a [preview](../guides/design-systems.md#preview-a-design-system)), **Collections** (multi-screen collections and [explorations](../guides/explore-directions.md) in the workspace) and **Integrations** ([which services are connected](../guides/integrations.md#see-whats-connected)).

For a guided tour, open **Welcome → Walkthroughs → Get started with Open Design** (five steps: first design, gallery, design system, social post, export).

## Claude Code

Installed by the plugin (`/plugin install open-design`) or by [`init --tools claude`](cli.md#init):

| Skill | Invocation | Model-invocable |
|---|---|---|
| `open-design` | picked up from any design request | yes |
| `open-design-new` | `/open-design:open-design-new` (plugin) or `/open-design-new` (init) | yes |
| `open-design-campaign` | `/open-design:open-design-campaign` (plugin) or `/open-design-campaign` (init) | yes, from campaign and multi-size requests |
| `open-design-docs` | `/open-design:open-design-docs` (plugin) or `/open-design-docs` (init) | yes, from requests to turn Markdown docs into pages |
| `open-design-social-post` | `/open-design:open-design-social-post` (plugin) or `/open-design-social-post` (init) | yes, from social-post requests |
| `open-design-poster` | `/open-design:open-design-poster` (plugin) or `/open-design-poster` (init) | yes, from poster, flyer and print requests |
| `open-design-explore` | `/open-design:open-design-explore` (plugin) or `/open-design-explore` (init) | yes, from requests for several options |
| `open-design-publish` | `/open-design:open-design-publish` (plugin) or `/open-design-publish` (init) | yes, from requests to share, publish or get a link |
| `open-design-deck-from-source` | `/open-design:open-design-deck-from-source` (plugin) or `/open-design-deck-from-source` (init) | yes, from requests to make slides or a one-pager from a document |
| `open-design-integrations` | `/open-design:open-design-integrations` (plugin) or `/open-design-integrations` (init) | yes, from questions about integrations, connectors or what's connected |
| curated entries | see [Curated entries](#curated-entries) | no |

The MCP server also offers **MCP prompts**. In Claude Code they appear as `/mcp__open-design__<name>`:

- `open-design-new`, `open-design-campaign`, `open-design-docs`, `open-design-social-post`, `open-design-poster`, `open-design-explore`, `open-design-publish`, `open-design-deck-from-source` and `open-design-integrations` take an optional `brief` argument.
- There's one prompt per remixable example, named `od-<mode>-<id>`, e.g. `od-deck-deck-guizang-editorial-example`. Selecting one prefills a remix request; nothing runs until you send it.

## Codex

Skills in `.agents/skills/` (from [`init --tools codex`](cli.md#init) or copied from this repository):

| Skill | Model-invocable |
|---|---|
| `open-design` | yes |
| `open-design-new` | yes |
| `open-design-campaign` | yes |
| `open-design-docs` | yes |
| `open-design-social-post` | yes |
| `open-design-poster` | yes |
| `open-design-explore` | yes |
| `open-design-publish` | yes |
| `open-design-deck-from-source` | yes |
| `open-design-integrations` | yes |
| curated entries (`guizang-ppt`, `card-twitter`, …) | no: each has `agents/openai.yaml` with `policy.allow_implicit_invocation: false` |

MCP prompts are the same as for Claude Code, if your Codex version surfaces them.

## CLI

See the [CLI reference](cli.md): `init`, `export`, `check`, `render-video`.
