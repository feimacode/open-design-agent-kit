# Engineering documents

Turn the facts in your repository into documents people read in a browser: RFCs, architecture decision records, postmortems, pull request explainers and changelogs. You can also turn a whole folder of existing Markdown docs into a matching set of pages.

## Before you start

- Nothing to install. The agent reads your repository with its own tools; `gh` (the GitHub CLI) adds pull request details when it's installed.
- An installed Chrome, Edge or Chromium for the visual check and for PDF export ([why](export-images.md#before-you-start)).

## The documents

| Ask for | Skill | What the agent reads first |
|---|---|---|
| "Write an RFC for …" | `rfc` | The code and docs the proposal changes; related issues or earlier RFCs |
| "Record this decision as an ADR" | `adr` | The code that embodies the decision; existing ADRs, to match numbering and link the ones it supersedes |
| "Write the postmortem for …" | `postmortem` | Incident notes and timeline you provide, and the commits that caused and fixed it |
| "Explain this branch for reviewers" | `pr-explainer` | `git log` and `git diff` against the base branch; the PR via `gh` if one exists |
| "Make a changelog page" | `changelog-page` | Tags and commits per release; an existing `CHANGELOG.md` |

RFCs and ADRs carry a status banner (`data-od-status`: proposed, accepted, superseded…). Every document ends with a **Sources** section. The files and commits the agent read are registered as the artifact's sources, so later checks can tell you when they've changed.

**The agent doesn't invent facts.** If a postmortem has no timeline or an RFC needs a number nobody gave, it asks you instead of making one up.

Also in the catalog, ported from [html-anything](https://github.com/nexu-io/html-anything): `exec-briefing-memo`, `experiment-readout`, `competitive-teardown`, `info-funnel` and `article-sketchnote-editorial`. The first three come with three visual styles each, as remixable examples.

## A folder of Markdown docs

> Turn docs/adr/*.md into ADR pages.

> **In VS Code:** `/open-design-docs docs/adr/*.md`

> **In Claude Code / Codex:** just ask; the `open-design-docs` skill handles it (`/open-design:open-design-docs` with the plugin).

1. The agent lists the files and asks first if there are more than 20.
2. It picks one template for the whole set: ADR pages for decisions, RFC pages for proposals, and so on, or the style you name.
3. It builds one page per file from that file's content only, keeps each document's structure and status, and links sibling pages where the Markdown links sibling files. All pages go in one collection.
4. **Run it again after editing the Markdown.** Only the pages whose source file changed are regenerated; the rest are skipped.

> **In VS Code:** the set appears in the Collections view, and each page's preview has Prev/Next buttons.

## Related

- [Diagrams of your code](diagrams.md), to embed in an RFC or ADR
- [Turn a document into a deck](deck-from-a-document.md)
- [Export decks and PDFs](export-decks.md), to send a document as a PDF
