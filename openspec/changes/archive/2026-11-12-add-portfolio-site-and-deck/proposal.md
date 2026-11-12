## Why

Two moments decide whether a designer gets hired: the hiring manager's first look at the portfolio site, and the portfolio interview. Both are clear and well documented (portfolio study, 2026-11-07):

- **The site.** The homepage is judged in 10 to 15 seconds, and the whole review takes 2 to 3 minutes. Reviewers want 3 to 5 case studies that trace decisions and trade-offs to an outcome, not a process diagram. They now mark down portfolios that look AI-made and alike, and reward signs of how the designer works with AI.
- **The interview.** A panel of designers, a PM and an engineer gives about 45 minutes for one or two projects, then questions. They look for context, the options that were rejected, collaboration and impact.

The kit makes strong web pages and decks, but has nothing aimed at either. The prototype surface's "A portfolio or event" option only changes a landing page's sections, and no recipe turns a project into a talk. This change adds both outputs on top of add-work-library, plus the checks for these two situations.

## What Changes

- **New "Portfolio" surface.** Listed in the picker and first under the "Get hired" goal. Questions: discipline (product or UX, brand or visual, illustration or motion, other), who it's for (employers, clients, both) and how many projects (3, 4 or 5).
- **Portfolio site recipe (`portfolio-site`).** A linked collection: home, one page per case study, and about/contact, published as one site through the existing collection export. Everything comes from the library:
  - Home: name, role, a one-line pitch, contact, and the project cards, written so the first screen works on a phone.
  - Case study: a summary card at the top (role, team, dates, outcome), then the problem, constraints, two or three key decisions with the options rejected, the outcome, and what the designer would do next. About 500 to 800 words of body text.
  - Images use the library's variants with `srcset` and confirmed alt text, and redaction is applied.
- **Process story, optional.** A "How I worked" block for a case study, built only from the kit's own records for that project (exploration directions, comparisons, steering edits, revisions, before/after pages), plus a note the designer writes about how they used AI. The block never claims work the records don't show.
- **Interview deck recipe (`portfolio-interview-deck`).** The designer picks one or two projects and a length (30, 45 or 60 minutes). The deck has an intro, the current role and company, and for each project: context, problem, artifacts including rejected options, collaboration, and impact; then a close, and backup slides for likely questions ("what would you change", "how did you measure it", "where did the team disagree"). Each slide has presenter notes and a minute budget. It exports as editable PowerPoint and PDF through the existing deck exports.
- **Portfolio checks.** A `portfolio` check group, run by `check_open_design_artifact` on designs made by these recipes:
  - first screen at phone (390 x 844) and desktop sizes shows the name, role, a contact link and the first project;
  - case study body length, and a summary card with role and outcome;
  - confirmed alt text on every image;
  - page weight per page;
  - links to live products resolve (local server only);
  - no `internal` project or asset in the site;
  - for the deck, the minute budgets add up to within 10% of the chosen length.

## Capabilities

### New Capabilities
- `portfolio-site`: the surface, the site recipe and the process story block.
- `portfolio-interview-deck`: the deck recipe, its structure, notes and timing.
- `portfolio-checks`: the portfolio check group for the site and the deck.

### Modified Capabilities
None. Linked flows, collection export, deck export and the check engine keep their requirements.

## Impact

- `packages/content/assets/open-design/surfaces.json`: `portfolio` surface and the "Get hired" goal; new `skills/portfolio-site` and `skills/portfolio-interview-deck` recipes; `check-content-sync` passes.
- `packages/core/src/generation`: brief inputs `portfolio: { projects, length? }` reading the library; process story assembly from exploration, steering, revision and before/after records.
- `packages/core/src/check`: `portfolio` check group; deck timing read from `data-od-minutes` on slides.
- Docs `guides/portfolio.md` (site and interview), `reference/tools.md`, CHANGELOG; eval briefs: a product designer site and a 45-minute interview deck from the fixture library.
- Depends on add-work-library.
