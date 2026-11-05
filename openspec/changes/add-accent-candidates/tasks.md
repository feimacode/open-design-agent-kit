## 1. Ranking

- [x] 1.1 Group filled controls by colour (OKLab distance < 0.05, about ΔE 4, cheap enough to run in the page); count controls and links per colour
- [x] 1.2 Score: best control's area and fold, count, OKLCH chroma, declared-name vote, logo-colour vote; vouching rule
- [x] 1.3 Crops for the top 4 candidates

## 2. Draft and skill

- [x] 2.1 `sources['--accent'].choiceConfidence` and `.candidates`; one-line summary in the formatted result
- [x] 2.2 Skill: below 0.5, show the candidates with crops and ask; `sync-content`

## 3. Tests

- [x] 3.1 Fixtures: dark sign-in vs green CTA, declared `--brand` on a small button, near-black button, decorative blob
- [ ] 3.2 Benchmark before and after, pasted into the PR (needs a machine with network access; the fixtures cover the scenarios)
- [x] 3.3 Docs: tools reference
