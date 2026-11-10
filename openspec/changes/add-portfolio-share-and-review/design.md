## Context

Poster formats define screen and print shapes with byte budgets and multi-card sets. Platform shells draw device frames around kit screens in previews and image exports. The comment sidecar stores element comments with a resolve flow. add-artifact-comment-review proposes a comment import tool that isn't built yet. Before/after pages compare base screens with a design. Targets (add-tailored-portfolios) pick projects and set a privacy ceiling.

## Goals / Non-Goals

**Goals:** files that upload without resizing or errors; a review post that follows community rules and leaks nothing; feedback that turns into tracked changes and a visible "what changed".

**Non-Goals:** posting to platforms, scraping replies from Reddit or Dribbble, reach or engagement analytics, the hosted review room from the team-collaboration study.

## Decisions

### Platform facts in one data file

Platform rules change. Keeping them in `share-platforms.json` with a source URL and a checked date means one edit per change, and the docs can show when each rule was last checked. Values not confirmed on the platform's own page ship marked `unverified` and are not used for failing checks, only warnings.

### Shots are designs

A shot is a fluid design in a share format, so it gets the normal checks, steering edits and exports. The share pack registers its pieces as one collection so they can be exported together.

### Anonymising is replacement, then a check

Replacement uses the library's own facts (owner, companies, clients, schools, links), so it knows what to look for. The check then searches the built output, including alt text, file names, `<title>`, Open Graph tags and link targets, because those are where names usually leak. Faces or logos inside images are not detected; the recipe asks the designer to add redaction boxes for them.

### Feedback is pasted, not fetched

Community sites block or rate-limit scraping and their terms vary. The designer pastes what they want to act on. Each point is matched to a page and, when possible, an element; points that don't fit a page attach to the home page.

## Risks / Trade-offs

- **Platform sizes drift.** Mitigated by the data file and checked dates; a task re-checks them before release.
- **Missed identifying details in images.** Stated in the recipe and docs; redaction boxes are the fix.
- **Overlap with add-artifact-comment-review.** The import tool is shared; whichever change is applied first builds it, and the other only adds its source.
