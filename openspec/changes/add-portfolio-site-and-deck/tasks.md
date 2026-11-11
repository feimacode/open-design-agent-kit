## 1. Surface and recipes

- [x] 1.1 `portfolio` surface, questions and "Get hired" goal in `surfaces.json`; content sync passes
- [x] 1.2 `portfolio-site` recipe: collection plan with home, case studies and about; home as `index.html`, map preview-only
- [x] 1.3 Case-study outline and length range in the recipe; images from library variants with `srcset`, confirmed alt text and redaction
- [x] 1.4 `portfolio-interview-deck` recipe: structure, presenter notes, `data-od-minutes`, backup slides; editable PPTX and PDF export checked

## 2. Brief and process story

- [x] 2.1 Brief inputs `portfolio: { projects, length? }` reading the library and its style
- [x] 2.2 `designs` list on projects; process story built from exploration, comparison, steering, revision and before/after records; left out when none

## 3. Checks

- [x] 3.1 `portfolio` group: first screen at phone and desktop, case-study length and summary card, alt text, page weight, live links, no `internal` content
- [x] 3.2 Deck timing check

## 4. Docs and evals

- [x] 4.1 `guides/portfolio.md` (site, interview), `reference/tools.md`, CHANGELOG
- [x] 4.2 Eval briefs: product designer site and 45-minute deck from the fixture library; sameness comparison of two fixture designers

## Notes from implementation

- The process story counts resolved review comments as revisions; checked steering edits only (not dropped or undone ones).
- Live link checks fetch at most 12 links with a 5 s timeout and are off on the hosted server.
- The editable PPTX and PDF exports use the existing deck export; presenter notes go into PowerPoint from `aside.notes`.
