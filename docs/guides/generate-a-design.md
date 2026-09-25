# Generate a design

Ask for a design in plain words; your agent picks a recipe from Open Design's catalog, writes the files and registers them as an **artifact**.

## Before you start

Open Design is set up for your host: [VS Code](../getting-started/vscode.md), [Claude Code](../getting-started/claude-code.md) or [Codex](../getting-started/codex.md).

## Steps

1. **Ask.** Describe what you want and, if you care, the look:

   > A pricing page for a developer tool, three tiers, dark, Linear-like.

2. **The agent picks a recipe.** It calls [`list_open_design_skills`](../reference/tools.md#list_open_design_skills) and chooses from the catalog:
   - about 160 **skills** (task recipes such as `guizang-ppt` or `data-report`);
   - about 115 **design templates** (rendering styles);
   - 167 **examples** (real rendered artifacts).

   Ids look like `od:<mode>:<name>`; the mode is `prototype`, `deck`, `design-system`, `image`, `video`, `template`, `utility` or `audio`.

3. **The agent gets instructions.** [`prepare_open_design_brief`](../reference/tools.md#prepare_open_design_brief) combines:
   - the recipe's workflow;
   - your [active design system](design-systems.md), if any;
   - the universal craft rules (typography, color, accessibility, avoiding generic "AI" look);
   - your brief.

   It writes nothing.

4. **The agent writes the files** with its own file tools, under `.open-design/<name>/`.
5. **The agent registers the artifact** with [`register_open_design_artifact`](../reference/tools.md#register_open_design_artifact), which writes the `<entry>.artifact.json` manifest.

To skip the choosing, run a [curated recipe](../reference/prompts-and-commands.md#curated-entries) directly (e.g. `/od-deck-guizang-ppt …`), or [remix a real example](remix-and-gallery.md).

> **In VS Code:** `/open-design-generate` runs the same flow explicitly, and `/open-design-list-skills` just browses. The result opens in the [preview](preview-comments-edit.md).

> **In Claude Code / Codex:** the `open-design` skill drives this flow from any design request. Open the HTML in a browser to see it.

## Grounded in your app

If the workspace's `package.json` shows a React, Vue, Next.js, Nuxt, Svelte, Angular, Astro or Solid app, the instructions ask the agent to look at a few of your real components first, so the prototype matches your app's look. The artifact is still a standalone file; [promoting it](promote-to-app-code.md) is a separate step.

## Collections

For a multi-screen flow (onboarding, checkout, a set of app screens), ask for several screens at once:

> Design a 4-screen onboarding flow for a budgeting app.

The agent generates each screen as its own artifact with a shared `collectionId`. Each screen's instructions list the other screens (role and title), so they stay consistent, and the design system chosen for the first screen carries through to the rest.

> **In VS Code:** the **Collections** view (Open Design activity-bar icon) lists each collection's screens, and the preview gets previous and next buttons.

## What you get

```
.open-design/pricing-page/pricing-page.html                ← the design (HTML, CSS and assets beside it)
.open-design/pricing-page/pricing-page.html.artifact.json  ← its manifest
```

Plain files: diff, review and commit them. See [Artifact manifest](../reference/artifact-manifest.md).

## Troubleshooting

- [The agent doesn't use Open Design](../troubleshooting.md#the-agent-doesnt-use-open-design)
- [Unknown skillId](../troubleshooting.md#unknown-skillid)

## Related

[Design systems](design-systems.md) · [Remix and the gallery](remix-and-gallery.md) · [Export images](export-images.md) · [Export decks and PDFs](export-decks.md)
