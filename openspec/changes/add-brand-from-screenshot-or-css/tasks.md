## 1. Parsers

- [x] 1.1 `sourceExtraction.ts`: CSS (custom properties, `body`, `a`, `button` rules), Tailwind theme, W3C tokens, HTML (inline and `<style>` CSS, linked font hosts); roles from names only
- [x] 1.2 Brand guide: colour codes with labels, CMYK conversion, Pantone as given, font names, via `read_open_design_source`
- [x] 1.3 `templateExtraction.ts`: theme colour scheme and fonts (incl. `sysClr`), master and layout text sizes, margins, background, master images as marks; stock Office theme detection; `.ppt` refusal; fixtures (branded template, stock Office theme, two masters). Deviation: master text sizes and background only; layout sizes and margins are not read (the token contract has no slide-margin token)
- [x] 1.4 `screenshotPalette.ts`: CIELAB k-means, role rules, photo-region skip, crops; fixtures and unit tests

## 2. Tool

- [x] 2.1 `sources` input, limits, confidence order and `conflicts`; same draft and evidence bundle
- [x] 2.2 Replace the `brandExtraction.ts` fallback with page and stylesheet fetch into `html` and `css` sources (local only)
- [x] 2.3 Hosted gateway: offer the tool in sources-only mode, refusal text for `url`, no fetch; tests in the gateway suite
- [x] 2.4 VS Code Import Design System reuses role assignment

## 3. Skill and docs

- [x] 3.1 Skill: source question per host, blocked → screenshot or CSS, hosted hosts fetch page and CSS themselves; regenerate copies
- [x] 3.2 `docs/guides/design-systems.md`, `docs/reference/tools.md`, hosted connector docs (what works where)
