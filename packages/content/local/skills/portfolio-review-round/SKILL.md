---
name: portfolio-review-round
zh_name: "作品集社区评审"
en_name: "Portfolio Review Round"
emoji: "🔍"
description: "A designer's portfolio, anonymised for a community critique (Reddit, a Discord, a mentor group): a review version with neutral labels, published unlisted, a review post with up to three questions, the pasted feedback tracked as comments, and a follow-up showing what changed."
en_description: "A designer's portfolio, anonymised for a community critique (Reddit, a Discord, a mentor group): a review version with neutral labels, published unlisted, a review post with up to three questions, the pasted feedback tracked as comments, and a follow-up showing what changed."
category: web
scenario: personal
tags: ["portfolio review", "portfolio critique", "roast my portfolio", "anonymous portfolio", "feedback on my portfolio", "作品集评审"]
triggers:
  - "portfolio review"
  - "portfolio critique"
  - "roast my portfolio"
  - "anonymise my portfolio"
  - "feedback on my portfolio"
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
  example_prompt: "I want to post my portfolio on r/UXDesign for a critique without my name or my employer on it. Ask about mobile readability and whether the case studies are too long."
---

<!-- Kit skill (openspec add-portfolio-share-and-review). -->
# Portfolio Review Round

Feedback from strangers, without telling them who you are or where you work, and a visible record of what you changed because of it.

## 1. The review version

1. **Read the library** (`get_open_design_library`) and pick the projects with the designer (usually the ones the portfolio leads with).
2. **Save a review target** with `save_open_design_portfolio_target`: `kind: "review"`, the community's posting rules pasted as `notes`, the projects, and `review: { community, questions, notWanted }`. At most three questions: if the designer gives more, ask which three to keep (the tool refuses four). Ask for a sector word per employer or client ("Grocery company, 2025") and save them as `review.labels`.
3. **Build it** as a portfolio site (the `portfolio-site` structure) with `portfolio: { target: "<slug>" }` on every page. The brief's "Anonymise this version" part lists each name, email, profile link, employer, client and live link to replace and the neutral label for each. Its own collection, `noindex` in every page.
4. **Pictures:** the check can't see inside images. Look at each one with the designer; a face, a logo, a name or an internal URL in a screenshot gets a redaction box (`save_open_design_project`, the asset's `redactions`) before building.
5. **Check** with `check_open_design_artifact` on every page. `review-anonymity` errors name the page and where the name is (text, alt text, a file name, `<title>`, an Open Graph tag or a link target). Fix them all; publish refuses a review version that still names anyone.
6. **Publish unlisted** with `publish_open_design_artifact`: a Claude artifact, or a host where the designer adds a password.

## 2. The review post

Write `review-post.md` beside the home page, following the brief and the community's rules: one or two lines of context (the role or level they're aiming at, no name), the questions, the feedback not wanted, and the link. Keep it short: posts that ask three sharp questions get answers to them.

## 3. Feedback

When the designer pastes replies, split them into points and import them with `import_open_design_comments`, `source: "community"`, each with the page it is about (`page`: the entry path of that case study) and the reviewer's name if given. Points that fit no page go to the home page. They become open comments: `get_open_design_artifact` lists them per page.

Apply the changes on the **real** portfolio (and the review version), and resolve each point with `resolvedCommentIds` when you register again. Points the designer decides not to act on: say so and resolve them with a one-line reason.

## 4. Follow-up

1. Before the first revision, store the posted version as each page's "before": prepare the page's brief again with `baseScreen` set to its unlisted address (or a screenshot of the posted page).
2. After revising, make the before/after page with `compare_open_design_before_after` (its `collectionId`): the posted pages beside the revised ones, at desktop and phone size.
3. Draft `follow-up-post.md`: thank the thread, then one line per resolved point ("Case studies were hard to read on a phone → body text is 18 px and images stack on small screens"), and the before/after link. Only points that are resolved.

## Rules

- Never post for the designer; they paste the post and the replies.
- Nothing stricter than unlisted goes in a review version; internal work stays out.
- Tokens only, from the design system's `:root`.
