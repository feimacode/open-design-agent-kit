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
| `/open-design-generate` | Generate a design from a brief: picks a skill, prepares the brief, writes and registers the artifact. |
| `/open-design-list-skills` | Browse the skill catalog. |
| `/open-design-custom-design-system` | Invent a design system for your brand. |
| `/open-design-social-post` | [Design a social media post](../guides/social-posts.md) for a platform and export ready-to-upload files. |
| `/od-<mode>-<id>` | The [curated entries](#curated-entries). |

Copilot also receives Open Design's chat instructions on every request, so a plain request ("make me a pricing page") works without any command.

### Commands (Command Palette)

| Command | Id | What it does |
|---|---|---|
| Open Design: Browse Design Systems | `openDesign.browseDesignSystems` | Fuzzy-search the design systems and set the active one (also on the status bar). |
| Open Design: Import Design System | `openDesign.importDesignSystem` | Import a design system from a file, pasted text or a GitHub repo. No model is involved. |
| Open Design: Browse Gallery | `openDesign.browseGallery` | Quick-pick the remixable examples; picking one remixes it. |
| Open Design: Open Gallery Grid | `openDesign.openGalleryGrid` | Searchable card grid of examples with live thumbnails. |
| Open Design: Open Artifact Preview | `openDesign.openArtifactPreview` | Open an HTML file in the preview (also on the Explorer's right-click menu). |
| Open Design: Remix | `openDesign.remixExample` | Remix the selected gallery example (Gallery view). |
| Open Design: Preview Example | `openDesign.previewExample` | Read-only preview of a gallery example. |
| Open Design: Use in Chat | `openDesign.chatWithExample` | Prefill Copilot Chat with a gallery example's brief (not sent). |
| Open Design: Set Figma Access Token | `openDesign.setFigmaToken` | Store a Figma personal access token, encrypted. |
| Open Design: Show Figma Import Plugin Folder | `openDesign.revealFigmaPlugin` | Reveal the bundled Figma import plugin for a one-time import into Figma desktop. |
| Open Design: Refresh Collections | `openDesign.refreshCollections` | Rescan the Collections view. |
| Open Design: Sync Community Designs | `openDesign.syncCommunityContent` | Fetch the community catalog at [`openDesign.communityContentRef`](settings-and-env.md#opendesigncommunitycontentref). |
| Open Design: Open Docs | `openDesign.openDocs` | Open this documentation in the browser. |

The Open Design activity-bar icon has two views: **Gallery** (examples by category) and **Collections** (multi-screen collections in the workspace).

For a guided tour, open **Welcome → Walkthroughs → Get started with Open Design** (five steps: first design, gallery, design system, social post, export).

## Claude Code

Installed by the plugin (`/plugin install open-design`) or by [`init --tools claude`](cli.md#init):

| Skill | Invocation | Model-invocable |
|---|---|---|
| `open-design` | picked up from any design request | yes |
| `open-design-social-post` | `/open-design:open-design-social-post` (plugin) or `/open-design-social-post` (init) | yes, from social-post requests |
| curated entries | see [Curated entries](#curated-entries) | no |

The MCP server also offers **MCP prompts**. In Claude Code they appear as `/mcp__open-design__<name>`:

- `open-design-social-post` takes an optional `brief` argument.
- There's one prompt per remixable example, named `od-<mode>-<id>`, e.g. `od-deck-deck-guizang-editorial-example`. Selecting one prefills a remix request; nothing runs until you send it.

## Codex

Skills in `.agents/skills/` (from [`init --tools codex`](cli.md#init) or copied from this repository):

| Skill | Model-invocable |
|---|---|
| `open-design` | yes |
| `open-design-social-post` | yes |
| curated entries (`guizang-ppt`, `card-twitter`, …) | no: each has `agents/openai.yaml` with `policy.allow_implicit_invocation: false` |

MCP prompts are the same as for Claude Code, if your Codex version surfaces them.

## CLI

See the [CLI reference](cli.md): `init`, `export`, `render-video`.
