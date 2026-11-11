---
name: portfolio-share-pack
zh_name: "作品分享包"
en_name: "Portfolio Share Pack"
emoji: "📣"
description: "Everything to post one project from a designer's work library: a cover, three to five Dribbble shots, Behance modules, a LinkedIn document post, an Instagram carousel and a marketplace cover, at each platform's size and limit, with the post text drafted from the project's facts."
en_description: "Everything to post one project from a designer's work library: a cover, three to five Dribbble shots, Behance modules, a LinkedIn document post, an Instagram carousel and a marketplace cover, at each platform's size and limit, with the post text drafted from the project's facts."
category: social
scenario: personal
tags: ["dribbble shot", "behance project", "linkedin document post", "linkedin carousel", "share my work", "upwork portfolio", "作品分享"]
triggers:
  - "dribbble shot"
  - "behance project"
  - "post my case study"
  - "linkedin carousel of my project"
  - "share pack"
od:
  mode: prototype
  craft:
    requires:
      - typography
      - accessibility-baseline
      - anti-ai-slop
  scenario: personal
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
  example_prompt: "Make a share pack of the checkout redesign from my work library: Dribbble shots, a Behance cover, a LinkedIn document post and the post text."
---

<!-- Kit skill (openspec add-portfolio-share-and-review). -->
# Portfolio Share Pack

One project, ready to post: each piece at its platform's exact size and upload limit, made from the work library, with the post text written from the project's facts.

## Before the first piece

1. **Read the library** (`get_open_design_library` with the project). A share pack uses **public** work only. If the project or a picture is unlisted or internal, say so and ask whether to change its level (`save_open_design_project`); never post around it.
2. **Ask once:** which platforms (default Dribbble, LinkedIn and Instagram; Behance, Upwork, Contra or Fiverr if they use them) and the one thing the project should be remembered for.
3. **Brief each piece** with `prepare_open_design_brief`, `portfolio: { projects: ["<slug>"] }` and the piece's `format`. The brief lists the facts, the pictures with their markup and, for screens with a device, the same picture **in its device frame** (`data-od-framed`): use the framed one in shots and covers. Register every piece with the same `portfolio` and one shared `collectionId` (e.g. `<slug>-share`), so they export together.

## The pieces

| Piece | Format | Notes |
|---|---|---|
| Cover | `dribbble-shot` (1600 × 1200) and `behance-cover` (808 × 632, exported at 2×) | The project's one idea and its best picture; the title is optional on Dribbble, legible at thumbnail size on Behance. |
| Shots, 3 to 5 | `dribbble-shot` | One idea each: the problem, a decision (chosen beside rejected), a detail, the outcome. A short MP4 of a flow is welcome; export with `format: "mp4"` and the shot's limit is used as the budget (20 MB). |
| Behance modules | `behance-module` (1400 wide) | The case study as a sequence of 1400 px modules, stacked cards. |
| LinkedIn document post | `linkedin-document` (1080 × 1350 cards) | 6 to 10 cards: hook, problem, two decisions, outcome, a "what I'd do next". Exports as **one PDF** with a page per card. |
| Instagram carousel | `ig-portrait` (1080 × 1350) | The same story as the document post, tighter; up to 10 cards. |
| Marketplace cover | `marketplace-cover` (4:3, exported at 2×) | Upwork and Contra; for Fiverr keep text in the middle band (it crops to 1280 × 769). |

Every card: `data-od-card` at exactly its size, `data-od-project="<slug>"` on it and the brief's picture markup (`data-od-asset`), so export can check privacy. Outcome numbers exactly as the brief writes them.

## Post text

Write `posts.md` beside the pieces, one section per platform the designer picked, from the project's facts only:

- **Dribbble:** a title (under 60 characters), two or three lines on the problem and the decision, tags from the project's tags and platforms.
- **Behance:** project title, a one-paragraph summary, the role, team and tools from the library, tags.
- **LinkedIn:** a hook line, three short paragraphs (problem, decision with the rejected option, outcome), one question to invite comments; no hashtag wall (three at most).
- **Instagram:** a caption of two or three lines and up to ten tags.
- **Upwork, Contra, Fiverr:** a title and a two-line description that names the kind of work a client would hire for.

No client or employer name unless the library holds it on a public project; no invented numbers.

## Check and export

`check_open_design_artifact` on each piece, then `export_open_design_artifact` per piece (the format's preset sets the size, the upload limit as the byte budget, and a document post as one PDF). The export reports any file over a platform's limit, citing the platform's own help page and the date it was checked; values the kit couldn't confirm only warn.

## Rules

- Public work only; the export refuses anything stricter and names it.
- Only library facts; ask for what's missing, or leave it out.
- Tokens only, from the design system's `:root`.
