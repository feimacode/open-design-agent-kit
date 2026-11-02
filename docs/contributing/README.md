# Contributing

How the project is put together and how to change it.

- [Architecture](architecture.md): the packages and how a request flows through them
- [Content sync](content-sync.md): the upstream pin, the local overlay, curation, mirrors and drift checks
- [Adding a skill or prompt](adding-a-skill-or-prompt.md)
- [Upstream ports](upstream-ports.md): code adapted from Open Design, and how we keep track of it
- [Releasing](releasing.md): versions, the release workflow, npm and Marketplace publishing, the plugin pin, the gateway image

Design decisions live as [OpenSpec](https://github.com/Fission-AI/OpenSpec) changes in `openspec/changes/`: a proposal, a design, tasks and spec deltas per change. Propose a change there before a large feature, and tick its tasks as the PR lands.

## Generated outputs

Some folders are built from the content and checked by `npm run lint`. Never edit them by hand:

| Output | Built by | Rebuild with |
|---|---|---|
| `packages/claude-plugin/skills/` (generated skills), `.agents/skills/`, `packages/cli/assets/` | the plugin and Codex generators | `npm run sync-content` |
| `packages/vscode` content mirror | `packages/vscode/scripts/copy-content-assets.mjs` | `npm run sync-content` |
| `claude-design-systems/` | `scripts/build-claude-design-systems.ts` | `npm run sync-content` |
| Integration tables in the README and docs | `scripts/generate-integrations-docs.mjs` | `node scripts/generate-integrations-docs.mjs` |
| The gallery site | `scripts/build-gallery.ts` | the **Gallery** workflow (see [gallery/README.md](../../gallery/README.md)) |

See [Content sync](content-sync.md) for the order the steps run in.

## Testing other hosts

- **Claude Desktop extension and ChatGPT plugin:** build them as in [Architecture](architecture.md#development) and run their smoke tests (`scripts/test-mcpb.mjs`, `scripts/test-chatgpt-plugin.mjs`), which unzip outside the checkout and complete an MCP handshake.
- **MCP Apps hosts:** `scripts/probe-mcp-apps-host/` is a tiny server that records what a host's MCP App support actually does (subframes, fullscreen, links, `window.openai`). Run it in a new host before relying on the inline preview there.
- **Hosted gateway:** `deploy/smoke-test.sh <url>` checks a running gateway end to end. See [deploy/README.md](../../deploy/README.md).
- **Browser tests as root** (in a container): Chromium needs `--no-sandbox`. Point `OPEN_DESIGN_BROWSER_PATH` at a wrapper script that adds it.

## Evals

`npm run evals` runs a fixed set of briefs (a poster, a landing page, a deck, a shop pack, a card set, a dashboard and two vague requests) headless through Claude Code with this checkout's plugin, and scores every design with the kit's own checks. See [evals/README.md](../../evals/README.md) for the brief format, the options and what each score means.

It costs model tokens and isn't run in CI. Run it by hand:

- **Before and after** a change to checks, skills or craft content (`packages/content/local/`, `packages/claude-plugin/skills/`, `packages/core/src/poster/preflight.ts` and the check code). Run it on the base branch with `--label "before <change>"`, then on your branch with `--label "after <change>"`.
- Put both tables from `evals/RESULTS.md` in the PR description, and commit the two RESULTS.md sections and their contact sheets.
- A change counts as an improvement when the error total drops on both repeats and no brief gets worse by more than one error.

Use `--only <id> --repeat 1` while iterating. For designs made in Claude Desktop or Codex, which the runner can't drive, use `--score-only <dir>`.
