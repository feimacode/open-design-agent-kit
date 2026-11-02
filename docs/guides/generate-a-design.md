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

3. **The agent asks what's missing, if anything.** See [A few questions first](#a-few-questions-first).
4. **The agent gets instructions.** [`prepare_open_design_brief`](../reference/tools.md#prepare_open_design_brief) combines:
   - the recipe's workflow;
   - your [active design system](design-systems.md), if any;
   - the craft rules the recipe asks for (for example typography, color, accessibility, or avoiding a generic "AI" look). Prototypes, landing pages, dashboards and mobile apps also get the state and words rules: every list and form shows its loading, empty and error states, buttons say what they do ("Save changes", not "Submit"), errors say how to fix them, and a busy button keeps its focus and label;
   - your brief, with your answers and anything the agent assumed;
   - a short list of your recent designs, so this one doesn't look the same (see [Why designs vary](#why-designs-vary)).

   It writes nothing.

5. **The agent writes the files** with its own file tools, under `.open-design/<name>/`.
6. **The agent registers the artifact** with [`register_open_design_artifact`](../reference/tools.md#register_open_design_artifact), which writes the `<entry>.artifact.json` manifest.
7. **The agent looks at it.** [`check_open_design_artifact`](../reference/tools.md#check_open_design_artifact) renders the design (desktop and mobile for a page, slide by slide for a deck) and hands the agent screenshots plus the [preflight](posters.md#preflight-checks) findings. It fixes errors such as clipped text, a page that scrolls sideways on phones or at 320 px, or links that show nothing when focused from the keyboard, and anything that looks off, for up to two rounds, then tells you about anything left. The check also points at common "default AI" looks (a purple-blue hero glow, three identical feature cards, headings off the design system's type scale); the agent fixes those unless your brief asks for that look. See [Taste and accessibility checks](../reference/tools.md#taste-and-accessibility-checks). It needs an installed Chrome, Edge or Chromium; without one the agent skips this step and says so.
8. **A second look.** Before calling it done, the agent gets a [second opinion](#second-opinion) from a design critic and, if it suggests fixes, applies them once.

To skip the choosing, run a [curated recipe](../reference/prompts-and-commands.md#curated-entries) directly (e.g. `/od-deck-guizang-ppt …`), or [remix a real example](remix-and-gallery.md).

> **In VS Code:** `/open-design-generate` runs the same flow explicitly, and `/open-design-list-skills` just browses. The result opens in the [preview](preview-comments-edit.md).

> **In Claude Code / Codex:** the `open-design` skill drives this flow from any design request, then opens the design in the [browser preview](browser-preview.md).

## A few questions first

Each kind of thing to make (a poster, slides, a landing page…) has two or three questions whose answers change the design, each with a few options and a default. For a poster:

> Where will it be seen? Printed · On screens · Both (changes size, bleed and file type)

The agent asks only what your request, the conversation and the folder don't already answer: at most three questions, once, in one message, together with any [design system](design-systems.md#not-sure-which-one) questions. Say "you pick" and it uses the defaults. A detailed request gets no questions:

> A printed A3 poster for our jazz night on 4 May, dark and moody.

Whatever the agent decides without asking (a dark theme, one sign-up button) it passes on as an assumption, and when the design is ready it lists them in one sentence ("I assumed a dark theme and one sign-up button; say if you want otherwise"), so a wrong guess costs one message, not a rebuild. Your answers and its assumptions are kept in the manifest as `metadata.brief`, so a later "make it lighter" can see what was decided.

## Why designs vary

Ask for five designs in a week and, left alone, they come out alike. Each time a design is registered, Open Design writes a line to `.open-design/history.json`: its title, recipe, design system, collection, date and a small **look signature** read from the HTML (accent colour, display and body fonts, light or dark, and the hero layout: centred, split, full-bleed image or none). It keeps the latest 50 and stores no HTML and no brief text.

The next brief lists up to five recent designs and asks for one that is recognisably different in at least two of theme, hero layout, display font and accent, unless you asked for the same look or the design system decides it (its tokens always win). Screens of the same [collection](#collections) are listed as ones to keep consistent with instead, and exploration sketches are left out.

To turn this off, add `"variety": false` to `.open-design/config.json`; the history is still written. Deleting `history.json` is safe.

## Second opinion

The agent that built a design sees what it meant, not always what it made. So once the checks are clean, the `open-design-critique` skill has a critic look at the design fresh: the latest check screenshots and findings, your brief and your design system, and nothing of the conversation. It judges seven things (purpose and hierarchy, typography, colour and contrast, layout and rhythm, copy, states, and fit to the design system) and gives one verdict:

- **ship:** done.
- **polish:** up to five specific fixes. The agent applies them once, checks again, and tells you it's done.
- **rework:** the direction is wrong (wrong audience, wrong kind of design, unreadable). The agent tells you what's wrong and asks before rebuilding.

Your brief wins: if you asked for a look, the critic doesn't argue with it. Ask for "another opinion" whenever you like (or run `/open-design-critique`), or say you don't want one.

- **Claude Code with the plugin:** the critic is the plugin's read-only `design-critic` agent, so it runs in a fresh context and edits nothing.
- **Elsewhere** (Codex, VS Code, Claude Desktop): a subagent where the host has one; otherwise the agent reviews its own screenshots against the same rubric and says it's a self-review, which is weaker.
- **Claude Desktop:** you hear it as "I had a second look: …" with the one or two things it improved.

The last opinion is kept in the design's manifest ([`metadata.critique`](../reference/artifact-manifest.md#metadatacritique)) and shown as "Second look" in the [browser preview's](browser-preview.md#checks) Checks panel. 3D designs keep their own scorecard critique instead ([3D objects](3d-objects.md)).

## Grounded in your app

If the workspace's `package.json` shows a React, Vue, Next.js, Nuxt, Svelte, Angular, Astro or Solid app, the instructions ask the agent to look at a few of your real components first, so the prototype matches your app's look. For a closer match, [scan the app](design-from-your-app.md) and save its tokens and components as a design system. The artifact is still a standalone file; [promoting it](promote-to-app-code.md) is a separate step.

## Collections

For a multi-screen flow (onboarding, checkout, a set of app screens), ask for several screens at once:

> Design a 4-screen onboarding flow for a budgeting app.

The agent generates each screen as its own artifact with a shared `collectionId`. Each screen's instructions list the other screens (role and title), so they stay consistent, and the design system chosen for the first screen carries through to the rest.

For screens that link to each other, the agent plans the flow first (screens, links and a shared navigation) and the screens link with real links, so you can click through them, check the whole flow at once and export it as one clickable prototype. See [App screens and flows](app-screens.md#linked-flows).

> **In VS Code:** the **Collections** view (Open Design activity-bar icon) lists each collection's screens and its flow map, and the preview gets previous and next buttons.

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
