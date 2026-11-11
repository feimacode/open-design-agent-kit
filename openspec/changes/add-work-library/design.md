## Context

Designs live in the designs folder (`.open-design/` in the classic layout, `Open Design/` or the managed folder in the visible layout). The site audit captures live pages with `export/livePage.ts`. Extraction builds design systems from a URL, CSS, screenshots, Figma files and Canva designs. The questions picker (`show_open_design_questions`) asks the person plain-language questions. None of these keeps facts about a person's past work.

## Goals / Non-Goals

**Goals:** enter each project once; bring real work in from where it already lives; keep facts and privacy consistent in every output; never invent facts.

**Non-Goals:** a portfolio CMS or editor UI, syncing with Behance, Dribbble or LinkedIn, storing résumés, analytics, video editing.

## Decisions

### Files in the designs folder, not a database

The library is JSON and image files beside the designs, so it works the same in Claude Code, Desktop, VS Code and the hosted server, is easy to back up, and can sit in git. `portfolio/` is a reserved folder name; a design can't be registered inside it.

### Facts have sources

Outcomes carry `source: measured | estimated | qualitative`. Outputs show measured values as written, add "about" to estimates, and never show a number for qualitative outcomes. This keeps a case study honest without asking the designer to prove anything to the kit.

### Privacy is a ceiling per output, checked at export

Levels are ordered `public` < `unlisted` < `internal`. Each output later declares the highest level it may contain (add-tailored-portfolios). This change only stores the levels and the rule that an asset can't be looser than its project. Redaction boxes are stored in asset coordinates (0 to 1) and applied by a blur when an image is rendered or exported, so the original is never edited.

### One importer, four sources

`import_open_design_work` takes `{ project, sources: [{ kind: "file" | "figma" | "url" | "design", ... }] }` and returns each asset's id, sizes and the alt text draft. URL captures reuse the audit's browser and its rule of not using mobile emulation for the phone pass. Figma frames go through the Figma connector's screenshot when it is connected, else the stored token's image export, at 2x.

### Image variants

WebP at 800, 1400 and 2800 px wide covers the portfolio site's `srcset`, Behance (1400 shown, 2800 in the lightbox) and Dribbble (1600 minimum, taken from the 2800 variant). The original is kept for print and PDF. Images narrower than 1600 px are flagged, because Dribbble and Behance will show them small.

## Risks / Trade-offs

- **Library size.** Many 2800 px images add up. The tool reports the library's size and keeps one original per asset only.
- **Alt text drafts left unconfirmed.** Outputs can use draft alt text, but the portfolio checks (add-portfolio-site-and-deck) list drafts as warnings until confirmed.
- **Figma access.** Without a connector or token, Figma frames can't be imported; the tool says so and suggests exporting PNGs from Figma.
- **Hosted server limits.** No live URL capture there; the designer uploads screenshots instead.
