## Context

Documentation today:
- `README.md` (193 lines), plus READMEs for `packages/vscode` (151, shown on the Marketplace), `mcp-server` (127, shown on npm), `cli` (72, npm) and `content` (25);
- `docs/codex.md` (38 lines);
- `docs/screenshots/`.

The READMEs have accumulated how-to and reference material: the social-post workflow, deck export, env vars, settings, CLI flags. There's no troubleshooting, no complete tool reference, and nothing for contributors beyond code comments and `vendored/SOURCE.md`.

The user decided: plain Markdown (no site), English only, and the full scope in one change.

Existing patterns worth reusing:
- the repo already enforces "generated or mirrored content must not drift" with lint-time check scripts (`check-content-sync`, `check-skills-sync`, `check-content-mirror`);
- the MCP tool schemas are already generated from VS Code's `languageModelTools`;
- the user prefers native host mechanisms over bespoke machinery.

## Goals / Non-Goals

**Goals:**
- A reader can find, within two clicks from `docs/README.md` or from inside their host, how to do any supported task, and what every tool, setting, env var and CLI flag means.
- Each fact is written once, and lint fails when code gains a tool, setting, env var, command or flag the reference doesn't document, or when a link breaks.
- Contributors can understand the package architecture, the content pipeline (upstream pin → sync → overlay → mirrors → generated skills and prompts) and the release flow without reading scripts.

**Non-Goals:**
- A docs website, search, versioning or i18n.
- Generating prose from code. Only presence is checked.
- Rewriting the vendored upstream skill text.

## Decisions

### D1. Layout: audience-first top level, Diátaxis-style inside
`getting-started/` (one per host), `guides/` (how-to, host-neutral), `reference/` (exhaustive, dry), `troubleshooting.md`, `automation/` (the internal pipeline recipe), `contributing/` (explanation for maintainers).

- File names are kebab-case with no numeric prefixes. Ordering comes from `docs/README.md` and a "Next:" link at the bottom of each getting-started page.
- The layout is site-generator-ready: every folder that needs a landing page has a `README.md`, links are relative, and every page starts with a single `#` title.
- *Alternative considered:* one folder per host (`vscode/…`, `claude-code/…`). Rejected: most tasks are identical across hosts, and per-host trees would triplicate the guides.

### D2. Page templates
- **Guide:** title, one-sentence outcome, "Before you start" (prerequisites), numbered steps, then per-host callouts as `> **In VS Code:** …` blockquotes (renders on GitHub, no custom syntax), "What you get" (files and paths), "Troubleshooting" (links into `troubleshooting.md` anchors), "Related".
- **Reference entry:** a heading equal to the exact identifier (e.g. `### export_open_design_artifact`, `### openDesign.export.browserPath`, `### --max-bytes`), a one-line summary, an argument or field table, errors, and an example. Using the identifier as the heading gives stable anchors and lets the drift check match by heading text.
- **Troubleshooting:** one `##` per symptom, phrased as the user sees it ("No Chrome, Edge, or Chromium browser was found", "Emoji show as empty boxes", "HyperFrames render hangs", "Export failed (not-a-deck)"), each with cause and fix. Tool error messages quote these headings, so the anchors are part of the contract.

### D3. READMEs become landing pages
- **Root README:** pitch, "Ways to use it" (one line per host plus a link), screenshots, "Documentation" (a link list mirroring `docs/README.md`), license and provenance.
- **Package READMEs:** keep what their registry audience needs above the fold (install, a 3-line quick start, the tool table's names only), then "Full documentation →". Settings, env var and flag tables move to `reference/`.
- **Link style:** READMEs shipped to the Marketplace or npm use absolute `https://github.com/feimacode/open-design-agent-kit/blob/main/docs/...` URLs, because relative links break there. `docs/**` and the root README use relative links, which the check verifies.
- `docs/codex.md` becomes a one-line stub pointing to `getting-started/codex.md`, so existing external links keep working.

### D4. Drift check `scripts/check-docs.mjs` (Node, no dependencies), run by root `npm run lint`
**Sources of truth, read from code:**
- tool names and input property names from `packages/vscode/package.json` `languageModelTools`, plus MCP tool names parsed from `packages/mcp-server/src/index.ts` (the MCP-only difference is none today, but checking both keeps it honest);
- `contributes.configuration.properties` keys;
- `contributes.commands` ids;
- env vars as every `OPEN_DESIGN_[A-Z_]+` string literal in `packages/*/src`, excluding tests (this catches env vars read through a constant, such as `BROWSER_PATH_ENV`);
- CLI commands and options by parsing `.command('…')` and `.option('--…')` calls in `packages/cli/src/index.ts`.

**Assertions:**
- each tool has a `### <name>` heading in `reference/tools.md`, and each of its properties appears as a table cell or inline code within that section;
- each setting and env var has a heading in `reference/settings-and-env.md`;
- each command id appears in `reference/prompts-and-commands.md`;
- each CLI command has a `### <command>` heading and each option appears in its section in `reference/cli.md`;
- **links:** every relative Markdown link in `docs/**/*.md`, `README.md` and `packages/*/README.md` resolves to an existing file, and a `#fragment` matches a heading slug in the target (GitHub slug rules: lowercase, drop punctuation except `-`, spaces become `-`);
- absolute `github.com/feimacode/open-design-agent-kit/blob/main/<path>` links are also checked for the local file's existence.

*As built*, the check also:
- validates the absolute docs links in the VS Code walkthrough pages (`packages/vscode/media/**`) and the bare repo URLs in the overview skill;
- enforces that every docs page is reachable from `docs/README.md` within two clicks (redirect stubs exempt).

Output lists every problem, not just the first, and exits non-zero. A focused unit test runs the script's pure functions (slugging, section extraction) against fixtures.

- *Alternative considered:* generating `reference/tools.md` from the schemas. Rejected for now: the reference carries examples, error explanations and cross-links that don't belong in schema descriptions. Checking presence gets most of the drift protection and keeps the prose hand-written.
- *Alternative considered:* markdown-link-check or remark-lint. Rejected: adds dependencies and network access, and we only need relative links plus our own repo URLs.

### D5. In-product entry points (native mechanisms)
- **VS Code walkthrough** `openDesign.getStarted` in `contributes.walkthroughs`, with about five steps:
  1. "Generate your first design" (runs `workbench.action.chat.open` with a sample prompt);
  2. "Browse the gallery" (`openDesign.openGalleryGrid`);
  3. "Pick a design system" (`openDesign.browseDesignSystems`);
  4. "Make a social post" (opens chat with `/open-design-social-post`);
  5. "Export to images, PDF or PowerPoint" (links to the guide).

  Each step's `media.markdown` is a short bundled file under `packages/vscode/media/walkthrough/` containing absolute GitHub docs links. The extension package can't rely on the repo's `docs/` at runtime.
- **"Open Design: Open Docs" command** `openDesign.openDocs`: opens `docs/README.md` on GitHub via `vscode.env.openExternal`. A plain URL constant; no network fetch or bundling of docs.
- **Overview skill** (`claude-plugin/skills/open-design/SKILL.md`, copied to Codex and the CLI assets by the existing generators): a final "Help" section with absolute links to `docs/README.md`, `troubleshooting.md`, and the social-posts and export guides. The agent can cite them, and users see them in the skill file.
- **CLI:** `program.addHelpText('after', '\nDocs: https://github.com/…/docs/reference/cli.md')`, plus the same URL in error output for export failures.

### D6. Content sourcing
The pages are written from the current code and READMEs, not from memory. Where a README already has the best prose (e.g. the root README's "Core workflow" bullets), it moves verbatim or lightly edited into the matching guide or contributing page, and the README keeps a one-line summary. `contributing/architecture.md` includes one Mermaid diagram each for package relationships and the content pipeline (GitHub renders Mermaid natively). `contributing/upstream-ports.md` summarizes and links `packages/core/src/vendored/SOURCE.md` rather than duplicating it.

## Risks / Trade-offs

- [Docs rot in prose the check can't see (wrong defaults, stale screenshots)] → The reference pages quote defaults straight from `package.json`/code, and a "Docs" line is added to the PR checklist in `contributing/releasing.md`. Presence checks catch the most common drift (new or renamed identifiers).
- [Heading-based matching is brittle to formatting] → Headings are exact identifiers by convention (D2), and the check reports the expected heading text so fixes are mechanical.
- [Marketplace or npm READMEs lose information] → Each keeps install, quick start and the names of its tools, and links out. Registry readers get less inline detail but always one click to the full page.
- [Walkthrough links point at `main`, which may be ahead of the installed version] → Acceptable for now (non-goal: versioned docs). The walkthrough text avoids version-specific details.
- [Large one-shot writing effort (~30 pages)] → Tasks are grouped by section so the check can be enabled early (links first, then the reference assertions once reference pages exist). Every page is written from the code, and examples are run where cheap (CLI commands, tool calls via the MCP server).

## Migration Plan

Additive. Links to `docs/codex.md` keep working through the stub. The README slimming lands in the same change as the pages it moves content to, so no information is ever missing. Rollback means reverting the change.

## Open Questions

None blocking. Whether to later publish `docs/` as a site (VitePress or MkDocs) is deferred; the layout is compatible with both.
