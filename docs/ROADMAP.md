# Roadmap

Last reviewed: 10 November 2026 (after release 0.4.0).

This roadmap groups the kit's feature work into **northstar areas**. Each area has one northstar statement: the outcome we are building toward. New features should move at least one area closer to its northstar. If a feature fits no area, that is a signal to either rethink the feature or propose a new area here first.

The first four areas are the product's core. Areas 5 to 8 were added because most of the past month's work landed there and would otherwise have no home. They can be merged or dropped if they stop earning their place.

| # | Area | Northstar, in one line |
| --- | --- | --- |
| 1 | [Design systems](#1-design-systems) | Any brand, from any source, becomes a trustworthy system that every design follows. |
| 2 | [Portfolios](#2-portfolios) | A designer enters their work once and gets every portfolio they need. |
| 3 | [Import and export](#3-import-and-export) | Work comes in from wherever it lives and goes out in the format the next person needs, editable where possible. |
| 4 | [Artifact management](#4-artifact-management) | Every design is a durable artifact you can find, preview, share, review and pick up again anywhere. |
| 5 | [Design quality and steering](#5-design-quality-and-steering) | Designs are judged and fixed before a person sees them, and steered precisely after. |
| 6 | [Professional workflows](#6-professional-workflows) | Product builders, web agencies and small sellers finish real jobs end to end. |
| 7 | [Hosts and distribution](#7-hosts-and-distribution) | The kit works, and is easy to find and install, in every agent people already use. |
| 8 | [Community and growth](#8-community-and-growth) | People share public work made with the kit and help build it. |

## How to use this roadmap

**Stages.** Each area lists items in five stages:

- **Shipped:** merged into `main`. Manual or live checks may still be open; those are listed under *In progress*.
- **In progress:** an open pull request, a merged change with checks left, or a proposal under review.
- **Next:** recommended or agreed as the next work in the area.
- **Later:** wanted, not scheduled.
- **Parked:** decided "not now", with the reason and what would reopen it.

**Proposing work.** Start an [OpenSpec](../openspec/) change as usual, and add a line near the top of its `proposal.md`:

```markdown
Roadmap area: Design systems
```

Then add or move the item here in the same pull request. A change can serve two areas; name the main one first.

**Keeping it current.** When a pull request merges, move its item to *Shipped*. When a decision parks or reopens an item, record it with the date. Review the whole page after each release.

Links point to the OpenSpec change (open or archived) and to the pull requests that proposed (→) and implemented it.

---

## 1. Design systems

**Northstar:** any brand or style, from a website, a design tool, a document or a codebase, becomes a design system the agent can trust. Every later design follows it, checks hold it to account, and it travels to Claude Design and other tools unchanged.

### Shipped

- **198 bundled systems, reconciled.** Where a system's `DESIGN.md` and `tokens.css` disagreed, one source was picked per system and recorded ([reconcile-design-system-sources](../openspec/changes/reconcile-design-system-sources/), [#20] → [#21]).
- **Smart matching.** `recommend_open_design_design_systems` ranks systems from the brief, with curated descriptors ([add-design-system-matching](../openspec/changes/add-design-system-matching/), [#19]). The nearest bundled system to an extracted brand ([add-nearest-design-system](../openspec/changes/add-nearest-design-system/), [#106] → [#107]).
- **Brand from a website.** `extract_open_design_design_system` measures a live site ([add-design-system-from-url](../openspec/changes/add-design-system-from-url/), [#21]), with consent-banner hiding, scrolling and a phone pass ([extend-site-extraction](../openspec/changes/extend-site-extraction/)). It also captures logos and voice ([add-brand-kit-capture](../openspec/changes/add-brand-kit-capture/)), takes screenshots, CSS or a PowerPoint template where the site can't be opened ([add-brand-from-screenshot-or-css](../openspec/changes/add-brand-from-screenshot-or-css/)), and keeps later designs on brand ([connect-brand-design-systems](../openspec/changes/connect-brand-design-systems/)). All four came from [#87] → [#102].
- **More accurate extraction.** Modern colour formats such as `oklch()` ([fix-modern-colour-formats](../openspec/changes/fix-modern-colour-formats/)), accent candidates with confidence ([add-accent-candidates](../openspec/changes/add-accent-candidates/)), coverage voting across pages ([add-coverage-voting](../openspec/changes/add-coverage-voting/)), runtime motion ([add-runtime-motion](../openspec/changes/add-runtime-motion/)), and a review of the site's own component restyled ([add-component-restyle-review](../openspec/changes/add-component-restyle-review/)). All from [#106] → [#107].
- **From design tools.** Figma files ([archive/2026-11-10-add-design-system-from-figma](../openspec/changes/archive/2026-11-10-add-design-system-from-figma/), [#130] → [#131]) and Canva designs ([add-design-system-from-canva](../openspec/changes/add-design-system-from-canva/), [#130] → [#132]).
- **From your app.** An app's own tokens and components become its design system ([archive/2026-11-02-add-design-from-app](../openspec/changes/archive/2026-11-02-add-design-from-app/), [#86] → [#88]).
- **Claude Design.** Every bundled system ships a ready Claude Design build, checked in lint ([add-claude-design-system-builds](../openspec/changes/add-claude-design-system-builds/), [#23] → [#24]). `export_open_design_design_system` exports custom systems ([#102]).
- **Earlier foundations.** Active design system per workspace, custom and imported systems, mobile systems, and a preview page (archived changes from September and October 2026).

### In progress

- Canva: live check with a real design in Claude and through the hosted gateway (task 3.3 of [add-design-system-from-canva](../openspec/changes/add-design-system-from-canva/)). Needs a machine that can reach Canva's export host.
- Extraction benchmark: the first baseline, and before/after numbers for accent candidates and coverage voting ([add-extraction-benchmark](../openspec/changes/add-extraction-benchmark/)). Needs a machine with open network access.
- Claude Design: import one system through "Add design system → GitHub repo" (task 4.2 of [add-claude-design-system-builds](../openspec/changes/add-claude-design-system-builds/)).
- Upstream reports: the source-conflict audit table and the summaries that say "dark" over light tokens ([reconcile-design-system-sources](../openspec/changes/reconcile-design-system-sources/) 5.2, [add-design-system-matching](../openspec/changes/add-design-system-matching/) 1.4).

### Next

- **Readable colour pairs and dark mode, as one token-contract change.** Store each accent and status colour with a partner that is guaranteed readable on it, and give each role a light and a dark value. Today white text on the accent fails 4.5:1 in 62 of 198 systems, `--warn` as text fails in 136, and only 1 system has a dark variant. Derive at resolve time or through the overlay, since the token schema is vendored. Source: Astryx study, 9 November 2026 (items 1 and 2). Not yet proposed.

### Later

- Palettes generated from one pinned brand colour (Astryx study, item 3).
- Corner radius by role with one roundness dial and a nested-corner rule; motion as two dials, speed and bounce (Astryx study, item 4).
- Chart colour tokens (Astryx study, item 5).
- Numbered design rules that checks can cite (Astryx study, item 6).
- Figma variable modes (light/dark from Figma), follow-up to the Figma change.
- Team design-system package with version, owner and a CI check, and an "ask, don't invent tokens" rule (team collaboration research, item 4).

### Parked

- Nothing.

## 2. Portfolios

**Northstar:** a designer enters their work once (projects, facts, pictures, and how private each one is) and gets every portfolio they need from it: a site, an interview deck, versions tailored to each application, and share packs for Dribbble, Behance and LinkedIn. Private client work stays private.

### Shipped

- **Work library** ([#135]): projects, facts, outcomes with their source, and imported work (files, live pages, kit designs, Figma frames) entered once, with a privacy level per project and picture, redaction boxes and alt text kept as a draft until confirmed.
- **Portfolio site and interview deck** ([#136]): a home page, case studies and about page as one site, and a 30, 45 or 60 minute interview deck with presenter notes, minute budgets and backup slides; portfolio checks and a "How I worked" block built only from the kit's own records.
- **Tailored versions and privacy ceilings** ([#137]): targets for a job, client, school or promotion, a PDF recipe with size limits, and export and publish that refuse work stricter than the version allows.
- **Share packs and review rounds** ([#138]): Dribbble, Behance, LinkedIn document and marketplace formats with platform limits from their help pages, device frames on imported screens, an anonymised unlisted version for community critiques, and pasted feedback recorded as comments (`import_open_design_comments`).

### Next

- Re-check the limits marked unverified in `share-platforms.json` (LinkedIn document size and pages, Contra cover) before each release.
- Redeploy the hosted gateway so it offers the portfolio tools.

### Later

- A fuller process story: earlier versions and decisions over time, beyond the records the "How I worked" block lists now.
- Learning a designer's own style from their past work.
- Checks for each situation (job application, school application, client pitch).

### Parked

- Nothing.

## 3. Import and export

**Northstar:** bring work in from wherever it lives (documents, apps, websites, Figma, Canva, image folders) and send designs out in the format the next person needs: print-ready, editable in PowerPoint or Canva, or as code in the app's own stack.

### Shipped

- **Decks:** PDF and picture-per-slide PowerPoint ([archive/2026-09-25-deck-pptx-pdf-export](../openspec/changes/archive/2026-09-25-deck-pptx-pdf-export/)), and **editable PowerPoint** with real text boxes and shapes ([archive/2026-11-04-add-editable-pptx-export](../openspec/changes/archive/2026-11-04-add-editable-pptx-export/), [#103] → [#104], archived in [#105]).
- **Print:** poster formats, bleed, crop marks and preflight; card and shop formats; print-house image presets ([add-card-and-shop-formats](../openspec/changes/add-card-and-shop-formats/), [add-print-house-images](../openspec/changes/add-print-house-images/), [#33] → [#34]).
- **Social, email and paste:** social post export, HTML email, and paste into WeChat, Notion and newsletters (archived changes, October 2026).
- **Motion:** MP4 and GIF export (archived change, October 2026).
- **Code:** promote a design to app code, a component set on MUI or shadcn ([add-component-library-port](../openspec/changes/add-component-library-port/), [#37] → [#38]), and Expo with NativeWind ([add-expo-nativewind-target](../openspec/changes/add-expo-nativewind-target/), [#93] → [#97]).
- **Design tools:** push to and pull frames from Figma, publish to Canva, including a private upload from the server ([canva-upload-from-server](../openspec/changes/canva-upload-from-server/)).
- **Inputs:** a deck from a document (archived change, October 2026), a design from your app ([#88]), a site's content for a redesign ([#100]), and `PRODUCT.md` / `DESIGN.md` interop with Impeccable ([add-impeccable-interop](../openspec/changes/add-impeccable-interop/), [#73] → [#74]).

### In progress

- Canva private upload: confirm the file appears in Canva Uploads from Desktop Chat (task 3.1 of [canva-upload-from-server](../openspec/changes/canva-upload-from-server/)).
- Component set: end-to-end runs on a fresh MUI app and a shadcn app (tasks 4.2 and 4.3 of [add-component-library-port](../openspec/changes/add-component-library-port/)).

### Next

- **Work import:** a folder of images, Figma frames as pictures rather than rebuilt code, and live captures, with WebP, `srcset` and alt text. It arrives with `add-work-library` ([#133]) and also serves comment import.

### Later

- Export into a customer's own PowerPoint slide master (`.potx`). Keep the editable-PPTX extractor separate from the writer so a second writer can fill a template package.
- Developer spec / handoff packet export: measurements, tokens used, states and assets for a developer (UI design research item 9, team collaboration research item 3).
- Import a Canva design itself, not just its brand (needs a real Canva design to test).

### Parked

- Nothing.

## 4. Artifact management

**Northstar:** every design is a durable artifact with a manifest and history. You can find it, preview it where you are, share it, collect review on it, and pick it up again on another device or host, without knowing where its files live.

### Shipped

- **Manifest and history:** `.artifact.json`, register and restore ([artifact manifest](reference/artifact-manifest.md)), and a visible designs folder, by default `~/Documents/Open Design` ([desktop-visible-design-folder](../openspec/changes/desktop-visible-design-folder/), [#31] → [#32]).
- **Preview where you are:** inline MCP App preview ([add-mcp-app-preview](../openspec/changes/add-mcp-app-preview/), [#7]) with pickers and questions ([add-mcp-app-pickers](../openspec/changes/add-mcp-app-pickers/), [add-mcp-app-ask-view](../openspec/changes/add-mcp-app-ask-view/), [#42]); updating in place, and the Claude Code browser pane ([inline-preview-in-place](../openspec/changes/inline-preview-in-place/), [code-tab-browser-pane](../openspec/changes/code-tab-browser-pane/), [#71] → [#72]); the browser preview with comments ([add-browser-preview](../openspec/changes/add-browser-preview/)).
- **Claude artifacts:** publish as a Claude artifact ([add-claude-artifact-provider](../openspec/changes/add-claude-artifact-provider/)), keep a private artifact as a live preview ([add-artifact-preview](../openspec/changes/add-artifact-preview/)), and sync the design's files into it so another session can carry on ([add-artifact-sync](../openspec/changes/add-artifact-sync/)). 3D pages embed their assets so they fit ([embed-3d-assets-for-artifacts](../openspec/changes/embed-3d-assets-for-artifacts/)).
- **Share and publish:** read-only share links and publish providers (archived change, October 2026), a hosted viewer for gateway projects ([add-hosted-design-viewer](../openspec/changes/add-hosted-design-viewer/), [#81] → [#82]).
- **Repeat work:** recurring design jobs ([add-recurring-design-jobs](../openspec/changes/add-recurring-design-jobs/)), and a history of recent designs so new ones don't repeat them ([add-variety-memory](../openspec/changes/add-variety-memory/), [#43]).

### In progress

- Live checks for the Claude artifact work: provider from Desktop Chat, preview milestones, and restoring a synced design in a fresh cloud session (open tasks in the three changes above).
- Hosted viewer: pick the user-content domain and check isolation (tasks 1.1, 2.1, 2.2 of [add-hosted-design-viewer](../openspec/changes/add-hosted-design-viewer/)).
- 3D embedded assets: offline render, size, and an artifact publish of the courtyard example ([embed-3d-assets-for-artifacts](../openspec/changes/embed-3d-assets-for-artifacts/)).
- Recurring jobs: runs in a Claude Code cloud scheduled task and a Desktop local task ([add-recurring-design-jobs](../openspec/changes/add-recurring-design-jobs/) 5.x).

### Next

- **Review on the artifact:** pull comments people leave on a shared Claude artifact into the design's comments, and store direction picks in the artifact's database ([add-artifact-comment-review](../openspec/changes/add-artifact-comment-review/), proposed, 0 of 12 tasks).
- **Approval pinned to a revision:** a review status that says "changed since approved" once the design moves on (team collaboration research, item 2).

### Later

- "What changed since you last looked", a decisions log, and review requests in Slack (team collaboration research, items 5 to 7).
- Direction voting, and a client picking between redesign concepts (team collaboration research item 9; web agency research item 3).
- A "replaced by" state, so an old concept points to the design that superseded it.
- Accounts on the hosted gateway, so projects outlive the 7-day anonymous window ([add-gateway-sign-in](../openspec/changes/add-gateway-sign-in/)). The identity provider side is a draft.

### Parked

- **Artifact pages calling the local server** (`host:Open_Design`) to replace the local preview server. The probe failed on 29 October 2026 because Claude Desktop doesn't route host calls yet. Reopen after a Desktop update passes the probe.
- **A native preview pane via a Claude Code mod.** It can't show an iframe or image on Desktop, so at most an index panel.

## 5. Design quality and steering

**Northstar:** a design is judged in a real browser, fixed and second-guessed by a critic before a person sees it. Afterwards, the person can steer one part of it in plain words and see proof that nothing else changed.

### Shipped

- **Checks:** visual check (archived), taste checks against the generic "AI" look ([add-taste-checks](../openspec/changes/add-taste-checks/)), state-aware accessibility checks ([add-state-accessibility-checks](../openspec/changes/add-state-accessibility-checks/)), and a critic that hasn't seen the conversation ([add-design-critic](../openspec/changes/add-design-critic/)). Proposed together in [#39].
- **Better first drafts:** a few quick questions before a build ([add-brief-questions](../openspec/changes/add-brief-questions/), [#43]), states and microcopy craft docs ([add-states-and-microcopy-craft](../openspec/changes/add-states-and-microcopy-craft/), [#40]), plain-language replies ([plain-language-replies](../openspec/changes/plain-language-replies/)).
- **Steering edits:** seven verbs (bolder, quieter, denser, roomier, distill, polish, harden) on one part of a design, with a guard that proves only that part changed ([add-steering-edits](../openspec/changes/add-steering-edits/), [#128] → [#129]).
- **Measured output:** `npm run evals` with a committed baseline ([add-output-quality-evals](../openspec/changes/add-output-quality-evals/), [#41]).

### In progress

- Calibrate the site audit's taste checks on hand-made and AI-default sites ([calibrate-site-audit-taste-checks](../openspec/changes/calibrate-site-audit-taste-checks/)). Until the first calibration run, live taste findings are notes only. Needs network access.
- Trials with real agent runs: critic on five briefs, variety over five briefs.

### Next

- **More "AI look" rules and a check command for CI:** port about 13 rules (gradient text, nested cards, hero eyebrow chip and others) and add `check --json --github` with a failing exit code (Impeccable study, item 2).
- **A baseline arm in evals:** run the same briefs without the kit and score blind, so we measure what the kit adds (Astryx study, item 7).

### Later

- Dice-rolled directions with re-roll "plainer, safer, bolder" (Impeccable study, item 4).
- Critic verdicts that can say "rebuild", with a stored score and trend (Impeccable study, item 5).
- Skeleton-first layered builds, and compact briefs that fit Claude's Free plan limits (delayed on 24 October 2026).

### Parked

- **Plugin hooks** that check designs after each edit. Parked on 24 October 2026; the Impeccable study shows hooks work in Claude Code, Codex, Cursor and Copilot, but Desktop and Cowork support is unknown. Reopen when we want checks without the agent asking for them.

## 6. Professional workflows

**Northstar:** people who design for a living or for their business (product builders without a designer, web agencies pitching redesigns, makers selling online) can finish the real job end to end, not just get a first draft.

### Shipped

- **App and web UI:** app screens, states boards and linked flows ([#86] → [#88] to [#92]); device shells, realistic sample data and task walkthroughs ([add-platform-shells](../openspec/changes/add-platform-shells/), [add-sample-data](../openspec/changes/add-sample-data/), [add-task-walkthrough](../openspec/changes/add-task-walkthrough/), [#93] → [#94] to [#96]).
- **Web agencies:** audit a live site, redesign it with its real content, and show before and after ([add-site-audit](../openspec/changes/add-site-audit/), [add-redesign-from-url](../openspec/changes/add-redesign-from-url/), [add-before-after](../openspec/changes/add-before-after/), [#98] → [#99] to [#101]).
- **Small sellers:** shop packs and card sets from a spreadsheet, and a Shopify hand-off ([add-shop-and-card-set-recipes](../openspec/changes/add-shop-and-card-set-recipes/), [add-shop-handoff](../openspec/changes/add-shop-handoff/), [#33] → [#34]).
- **Earlier:** campaigns, decks from documents, code diagrams, engineering documents, 3D objects and scenes (archived changes, October 2026).

### In progress

- Shopify: connect the connector to a development store and confirm what it can do (tasks 1.1, 1.2, 4.2 of [add-shop-handoff](../openspec/changes/add-shop-handoff/)).
- End-to-end recipe runs for shop packs and card sets; publishing a whole flow to a real host.

### Next

- **Redesign concepts for a pitch:** 2 to 3 concepts from one site (keep, refresh, bold), and a client-facing comparison page with phone views and the audit fixes each concept makes (web agency research, items 1 and 2). Not yet proposed.

### Later

- Ask for flow tasks at plan time, not at the end.
- App store rules check, a finding for screens that drift from their siblings.
- Pitch pack, batches of prospects, content migration (web agency research).

### Parked

- Nothing.

## 7. Hosts and distribution

**Northstar:** the kit works well in every agent people already use (VS Code, Claude Code, Claude Desktop, Codex, Cursor, ChatGPT and the web), and people and agents can find and install it in a minute.

### Shipped

- **Claude Desktop:** desktop extension, chat without a folder, first-run welcome, set-workspace tool, plugin server launcher, connector setup text ([add-desktop-extension-bundle](../openspec/changes/add-desktop-extension-bundle/), [add-folderless-chat-support](../openspec/changes/add-folderless-chat-support/), [desktop-first-run-welcome](../openspec/changes/desktop-first-run-welcome/) and related `desktop-*` changes).
- **ChatGPT desktop plugin** ([add-chatgpt-desktop-plugin](../openspec/changes/add-chatgpt-desktop-plugin/), [#73] → [#74]), with the folder fix in [#127] (merged, not yet released).
- **Hosted gateway** at `open-design.feimacode.com` for the Claude and ChatGPT directories ([add-remote-mcp-server](../openspec/changes/add-remote-mcp-server/), [add-mcp-gateway](../openspec/changes/add-mcp-gateway/), [#81] → [#82]). The directory plugin is remote-only, and the marketplace plugin keeps the local server ([#112], [#113]).
- **Being found by agents:** better package, plugin and skill metadata ([#110]) and a Glama manifest ([#115]).
- **Release 0.4.0** on npm, the VS Code Marketplace and GitHub Releases ([#125], plugin pin [#126]).

### In progress

- Claude directory review of the remote-only plugin.
- ChatGPT directory listing: walkthrough video for the reviewer.
- Gateway operations: Cloudflare rules, nightly backups, health check alert ([deploy-hosted-gateway](../openspec/changes/deploy-hosted-gateway/)).
- ChatGPT inline preview: run the MCP Apps probe in ChatGPT desktop, then decide scope ([chatgpt-mcp-apps-compat](../openspec/changes/chatgpt-mcp-apps-compat/)).
- Manual checks of the ChatGPT plugin on macOS and Windows ([add-chatgpt-desktop-plugin](../openspec/changes/add-chatgpt-desktop-plugin/) 6.x).

### Next

- **Redeploy the hosted gateway on 0.4.0 or later**, so web users get editable PowerPoint, extraction from sources, steering edits, and Figma and Canva systems.
- **A release with [#127]**, so ChatGPT desktop users stop hitting the folder guard.
- **Registry listings:** claim the Glama listing, then awesome-mcp-servers, the GitHub MCP Registry, skills.sh, a `remotes` entry for the gateway in the official MCP registry, and `llms.txt` on the gallery site.

### Later

- Register the skills with VS Code's `contributes.chatSkills` (Impeccable study, item 6).
- Accounts on the gateway (see [Artifact management](#4-artifact-management)).

### Parked

- **Gemini.** Tested through the hosted gateway on 7 November 2026; the result wasn't good enough. Research stays valid if reopened.
- **ChatGPT directory listing for the local plugin.** Needs an OpenAI partner allowlist with no public route; the hosted gateway is the listing route instead.

## 8. Community and growth

**Northstar:** more people share public work made with the kit, and some of them help build it.

### Shipped

- Contributor basics: CONTRIBUTING, issue and discussion forms, pull request template, good first issues ([#46]).
- Online gallery of every design system and example, with "Open in Claude" links ([#64], [#65], [#67]). Gallery links inside the kit are built but off until the site goes public ([link-public-gallery](../openspec/changes/link-public-gallery/), [#69] → [#70]).
- Subreddit, an install video and a remix video.

### In progress

- Contributor pull requests under review: [#89], [#119], [#120], [#122], [#124].
- Daily triage and a weekly digest.
- Turning on the public gallery links (tasks 7.1 to 7.4 of [link-public-gallery](../openspec/changes/link-public-gallery/)).

### Next

- Outreach to rising AI-design creators, with a design made from their own work.
- An honest comparison page and a refreshed 60-second demo.

### Later

- A "feature of the week" calendar with a proof kit for each feature.
- A chat server once there are about 30 active users.

### Parked

- Nothing.

---

## Housekeeping

Work that keeps the roadmap honest but belongs to no single area:

- **Archive finished OpenSpec changes.** These 23 have no open tasks: add-before-after, add-brand-from-screenshot-or-css, add-brand-kit-capture, add-brief-questions, add-component-restyle-review, add-expo-nativewind-target, add-nearest-design-system, add-output-quality-evals, add-platform-shells, add-print-house-images, add-redesign-from-url, add-runtime-motion, add-sample-data, add-site-audit, add-state-accessibility-checks, add-states-and-microcopy-craft, add-steering-edits, add-task-walkthrough, add-taste-checks, connect-brand-design-systems, extend-site-extraction, fix-modern-colour-formats, plain-language-replies. Add-design-system-from-canva follows once its live check passes.
- **Checks that need a networked machine:** extraction benchmark, taste calibration, Canva export, Poly Haven assets for 3D.
- **Stale counts** of design systems and examples in the package READMEs.

[#7]: https://github.com/feimacode/open-design-agent-kit/pull/7
[#19]: https://github.com/feimacode/open-design-agent-kit/pull/19
[#20]: https://github.com/feimacode/open-design-agent-kit/pull/20
[#21]: https://github.com/feimacode/open-design-agent-kit/pull/21
[#23]: https://github.com/feimacode/open-design-agent-kit/pull/23
[#24]: https://github.com/feimacode/open-design-agent-kit/pull/24
[#31]: https://github.com/feimacode/open-design-agent-kit/pull/31
[#32]: https://github.com/feimacode/open-design-agent-kit/pull/32
[#33]: https://github.com/feimacode/open-design-agent-kit/pull/33
[#34]: https://github.com/feimacode/open-design-agent-kit/pull/34
[#37]: https://github.com/feimacode/open-design-agent-kit/pull/37
[#38]: https://github.com/feimacode/open-design-agent-kit/pull/38
[#39]: https://github.com/feimacode/open-design-agent-kit/pull/39
[#40]: https://github.com/feimacode/open-design-agent-kit/pull/40
[#41]: https://github.com/feimacode/open-design-agent-kit/pull/41
[#42]: https://github.com/feimacode/open-design-agent-kit/pull/42
[#43]: https://github.com/feimacode/open-design-agent-kit/pull/43
[#46]: https://github.com/feimacode/open-design-agent-kit/pull/46
[#64]: https://github.com/feimacode/open-design-agent-kit/pull/64
[#65]: https://github.com/feimacode/open-design-agent-kit/pull/65
[#67]: https://github.com/feimacode/open-design-agent-kit/pull/67
[#69]: https://github.com/feimacode/open-design-agent-kit/pull/69
[#70]: https://github.com/feimacode/open-design-agent-kit/pull/70
[#71]: https://github.com/feimacode/open-design-agent-kit/pull/71
[#72]: https://github.com/feimacode/open-design-agent-kit/pull/72
[#73]: https://github.com/feimacode/open-design-agent-kit/pull/73
[#74]: https://github.com/feimacode/open-design-agent-kit/pull/74
[#81]: https://github.com/feimacode/open-design-agent-kit/pull/81
[#82]: https://github.com/feimacode/open-design-agent-kit/pull/82
[#86]: https://github.com/feimacode/open-design-agent-kit/pull/86
[#87]: https://github.com/feimacode/open-design-agent-kit/pull/87
[#88]: https://github.com/feimacode/open-design-agent-kit/pull/88
[#89]: https://github.com/feimacode/open-design-agent-kit/pull/89
[#91]: https://github.com/feimacode/open-design-agent-kit/pull/91
[#92]: https://github.com/feimacode/open-design-agent-kit/pull/92
[#93]: https://github.com/feimacode/open-design-agent-kit/pull/93
[#94]: https://github.com/feimacode/open-design-agent-kit/pull/94
[#96]: https://github.com/feimacode/open-design-agent-kit/pull/96
[#97]: https://github.com/feimacode/open-design-agent-kit/pull/97
[#98]: https://github.com/feimacode/open-design-agent-kit/pull/98
[#99]: https://github.com/feimacode/open-design-agent-kit/pull/99
[#100]: https://github.com/feimacode/open-design-agent-kit/pull/100
[#101]: https://github.com/feimacode/open-design-agent-kit/pull/101
[#102]: https://github.com/feimacode/open-design-agent-kit/pull/102
[#103]: https://github.com/feimacode/open-design-agent-kit/pull/103
[#104]: https://github.com/feimacode/open-design-agent-kit/pull/104
[#105]: https://github.com/feimacode/open-design-agent-kit/pull/105
[#106]: https://github.com/feimacode/open-design-agent-kit/pull/106
[#107]: https://github.com/feimacode/open-design-agent-kit/pull/107
[#110]: https://github.com/feimacode/open-design-agent-kit/pull/110
[#112]: https://github.com/feimacode/open-design-agent-kit/pull/112
[#113]: https://github.com/feimacode/open-design-agent-kit/pull/113
[#115]: https://github.com/feimacode/open-design-agent-kit/pull/115
[#119]: https://github.com/feimacode/open-design-agent-kit/pull/119
[#120]: https://github.com/feimacode/open-design-agent-kit/pull/120
[#122]: https://github.com/feimacode/open-design-agent-kit/pull/122
[#124]: https://github.com/feimacode/open-design-agent-kit/pull/124
[#125]: https://github.com/feimacode/open-design-agent-kit/pull/125
[#126]: https://github.com/feimacode/open-design-agent-kit/pull/126
[#127]: https://github.com/feimacode/open-design-agent-kit/pull/127
[#128]: https://github.com/feimacode/open-design-agent-kit/pull/128
[#129]: https://github.com/feimacode/open-design-agent-kit/pull/129
[#130]: https://github.com/feimacode/open-design-agent-kit/pull/130
[#131]: https://github.com/feimacode/open-design-agent-kit/pull/131
[#132]: https://github.com/feimacode/open-design-agent-kit/pull/132
[#133]: https://github.com/feimacode/open-design-agent-kit/pull/133
[#135]: https://github.com/feimacode/open-design-agent-kit/pull/135
[#136]: https://github.com/feimacode/open-design-agent-kit/pull/136
[#137]: https://github.com/feimacode/open-design-agent-kit/pull/137
[#138]: https://github.com/feimacode/open-design-agent-kit/pull/138
