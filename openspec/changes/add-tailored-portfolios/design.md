## Context

add-work-library stores projects with privacy levels and redaction. add-portfolio-site-and-deck makes the site and the interview deck. Export already compresses images to a byte budget for social formats, and publish already offers several providers with confirmation steps. Redesign concepts and before/after pages exist for client work.

## Goals / Non-Goals

**Goals:** a correct, private-enough version for one situation in minutes; no NDA or internal material leaving through the wrong door; limits met before the designer uploads.

**Non-Goals:** applicant tracking, sending emails or applications, tracking who opened a link, adding passwords on hosts that don't support them, rewriting a résumé.

## Decisions

### A target is data, outputs stay recipes

Targets only pick, order, limit and restrict. The site, PDF and deck are the same recipes with `target` passed in, so a fix to the case-study layout reaches every version.

### Suggested order is simple and visible

Word overlap between the notes and each project's tags, decisions and outcomes, with the matched words returned. It is a starting order the agent shows, not a hidden ranking.

### Limits per kind

Defaults: job PDF 10 MB; client PDF 10 MB; school image 5 MB, PDF 10 MB and the piece count the designer enters (SlideRoom's documented limits as the default); promotion none. The designer can change any limit. Size is met by lowering image quality step by step; if the lowest quality still exceeds the limit, the export fails and says which pages are heaviest.

### Privacy is checked twice

At export (any file) and at publish (any provider). The check walks the output's images and text blocks for library ids (`data-od-project`, `data-od-asset`), so a copied image without ids is not caught. The recipes always tag library content, and the portfolio checks warn about untagged images in a portfolio design.

### Promotion evidence stays honest

The criteria map uses the same outcome sources as the library. A criterion with no matching project stays visible and empty, so the designer sees the gap before a committee does.

## Risks / Trade-offs

- **Untagged content slips past.** Mitigated by recipe tagging and the untagged-image warning; stated in the docs.
- **Password support varies by host and plan.** Not verified per provider; the publish step tells the designer to add a password on the host and doesn't claim one was set.
- **School rules vary.** Only SlideRoom's documented limits are defaults; the designer enters each school's own.
