# Community designs (awesome-open-design)

Besides the 167 built-in examples, the VS Code extension can show a second catalog of remixable designs contributed by the community in [feimacode/awesome-open-design](https://github.com/feimacode/awesome-open-design). This page covers how that catalog gets into your gallery, how to use it safely, and how to contribute a design back.

Community designs are a **VS Code feature**. The MCP server (Claude Code, Codex, Cursor) and the CLI only use the built-in catalog.

## What the community catalog is

A separate public repository. Each entry is one folder:

```
examples/<design-slug>/
├── SKILL.md          # frontmatter + the workflow an agent follows to adapt the design
├── example.html      # the hand-built, rendered design (this is what gets remixed)
└── open-design.json  # optional: the starter prompt, at od.useCase.query.en
```

This is the same shape as the built-in examples. Once synced, community entries behave like any other example. The repository publishes **tagged releases** (e.g. `v0.1.0`), and the extension always tracks one tag, so nothing changes on your machine until you choose a newer one.

**These designs aren't reviewed the way the built-in catalog is.** Contributions go through the repository's merge bar (below), but treat them as third-party content.

## How it reaches your gallery

1. **First run:** when the extension first activates (with the feature on), it downloads the tag named by [`openDesign.communityContentRef`](../reference/settings-and-env.md#opendesigncommunitycontentref), `v0.1.0` by default. A notification tells you how many designs were synced and offers **Disable**. This happens once; after that, syncing is up to you.
2. **The download:**
   - one HTTPS request for the tag's tarball from GitHub (`codeload.github.com`), with no `git` needed;
   - it's unpacked into the extension's own global storage (`<globalStorage>/community-content/`), shared by all your workspaces;
   - a `MANIFEST.json` there records the tag, the resolved commit, the time and the design count.
   - The new copy replaces the old one only once it's fully unpacked, so an interrupted download never leaves a half-written catalog.
3. **Merging:** community entries are read fresh on every catalog query (no reload needed) and added with `source: "community"`. A community design usually keeps its plain id, e.g. `od:prototype:now-page`. If it has the same name as a built-in entry, the built-in one keeps the plain id and the community one gets a `:community` suffix (`od:<mode>:<name>:community`), so a community design can never replace a built-in one.

To pick up newer designs, change `openDesign.communityContentRef` to a newer tag (see the repository's [tags](https://github.com/feimacode/awesome-open-design/tags)), then run **Open Design: Sync Community Designs**. The same command retries after a failed first run (offline, rate-limited, bad tag).

To turn the feature off, set [`openDesign.communityContentEnabled`](../reference/settings-and-env.md#opendesigncommunitycontentenabled) to `false`, or choose **Disable** in the first-run notification. Choosing **Disable** turns it off in your user settings, for every workspace.

## Using community designs

They appear everywhere built-in examples do, clearly labelled:

- **Gallery grid** (**Open Design: Open Gallery Grid**): a **Community** badge on the card. Thumbnails of community designs render in a stricter sandbox, without `allow-same-origin`, so their scripts can't reach the gallery page.
- **Gallery view** (activity bar): shown as `<mode> · community`.
- **Chat:** [`list_open_design_skills`](../reference/tools.md#list_open_design_skills) returns them with `source: "community"`, and `source: "community"` lists only them. The agent is told to mention it when a result is community-sourced and that matters.

Remixing works as for any example:

> Start from the community "now page" design and make it mine.

[`remix_open_design_example`](../reference/tools.md#remix_open_design_example) copies `example.html` (and an `assets/` folder, if the entry has one) into `.open-design/<name>/`. From then on it's **your file**. Look it over before you ship it, especially any `<script>`, since it came from a third party.

## Contributing a design

When you've built something worth sharing:

> Share this design to the community.

or reference the tool: `#od-share-to-community`. [`share_open_design_artifact_to_community`](../reference/tools.md#share_open_design_artifact_to_community) returns instructions, and the agent then:

1. **Derives the metadata from your artifact:** a kebab-case slug, a title, a description, and an `example_prompt` based on the brief that actually produced it. It only asks you about things it can't tell.
2. **Writes a local scaffold** at `.open-design/community-share/<slug>/`: `SKILL.md`, `example.html` (your artifact, verbatim) and `open-design.json`. Nothing is published yet.
3. **Stops and asks you** whether to publish. Everything after this is public and under your GitHub name.
4. **Only after an explicit yes**, using your own GitHub CLI login:
   1. checks `gh auth status`, and stops if you're not logged in;
   2. forks `feimacode/awesome-open-design`;
   3. clones your fork into a temporary folder outside your project;
   4. adds `examples/<slug>/` on a new branch and pushes it;
   5. opens a pull request.

   It reports the PR link and stops. It never merges, never force-pushes, and never retries a failed step with a guessed command.

You need the [GitHub CLI](https://cli.github.com/) (`gh`) installed and logged in. The tool itself writes nothing and runs nothing; your agent does the steps with its own tools, in your session.

### What gets merged

From the repository's [CONTRIBUTING.md](https://github.com/feimacode/awesome-open-design/blob/main/CONTRIBUTING.md), in short:

- `example.html` is hand-built and works when opened straight from disk: no lorem ipsum, no placeholder graphics.
- No generic "AI" visuals: no purple-to-pink gradients, emoji standing in for icons, or invented statistics.
- Honest placeholders: the `SKILL.md` tells the agent to write `—` or a labelled placeholder rather than make values up.
- The `example_prompt` actually reproduces something close to `example.html`.
- ASCII kebab-case slug, no large binaries (inline SVG, system or Google fonts only), one design per PR.
- Contributions are MIT-licensed. A design forked from elsewhere keeps its original license and attribution in a `references/` folder.

Merged designs reach users when the maintainers tag a new release and users move `openDesign.communityContentRef` to it.

## For maintainers

- **Releasing the catalog:** tag the awesome-open-design repository (e.g. `v0.2.0`) when a meaningful batch of designs has landed on `main`. Users only see it once they point `openDesign.communityContentRef` at the new tag and sync.
- **Changing the extension's default tag:** update `DEFAULT_COMMUNITY_CONTENT_REF` in `packages/vscode/src/workspace/communityContent.ts` and the `openDesign.communityContentRef` default in `packages/vscode/package.json`, together. Users who have already synced keep their cache until they sync again.
- **Code map:**

  | Piece | File |
  |---|---|
  | Download, cache, first-run sync | `packages/vscode/src/workspace/communityContent.ts`, `packages/vscode/src/extension/extension.ts` |
  | Sync command | `packages/vscode/src/extension/commands/syncCommunityContentCommand.ts` |
  | Merge into the catalog, id suffixes | `packages/core/src/content/contentIndex.ts` (`loadExamples(…, 'community')`, `mergeSkillPools`) |
  | Stricter thumbnail sandbox, badge | `packages/vscode/src/webview/gallery/main.ts` |
  | Share instructions | `packages/core/src/generation/shareToCommunityInstructions.ts` |

## Troubleshooting

- **"Community content sync failed … (HTTP 404)":** the tag in `openDesign.communityContentRef` doesn't exist. Check the repository's tags.
- **No community designs after install:** the first-run sync may have failed (offline, or GitHub rate limits). Run **Open Design: Sync Community Designs**; failures are also logged in the **Open Design Tools** output channel.
- **Sharing stops at "not logged in":** run `gh auth login`, then ask the agent to continue.

## Related

[Remix and the gallery](remix-and-gallery.md) · [Settings](../reference/settings-and-env.md#vs-code-settings) · [Tools](../reference/tools.md#share_open_design_artifact_to_community)
