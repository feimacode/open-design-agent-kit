## 1. Links and fetch

- [x] 1.1 `canvaLink.ts`: parse design, template and short links; tests with real link shapes. Also parses `canva.com/d/<code>` share links, which is what Canva's `search-designs` returns
- [x] 1.2 Canva `exportHosts` in `integrations.json`; host check after redirects; 20 MB and 30 s limits; tests. Host confirmed from a live `export-design` call (2026-11-09): `export-download.canva.com`
- [x] 1.3 `fileUrl` on `template` and `screenshot` sources (local and gateway); gateway still refuses other URLs; gateway tests

## 2. Extraction

- [x] 2.1 `needs-canva-export` result and instructions (connector check, short link, export formats, PPTX + up to 4 PNG pages, call back)
- [x] 2.2 Template reader Canva mode: stock theme to candidates, fonts from slide runs by use, repeated page images as marks. Deviation: the fixture is built in the test like the other template fixtures, not taken from a real Canva export (the build container can't reach Canva's export host), so the real file layout is still to be confirmed in 3.3. Display font = the font with the most characters set at 1.5× the body's median size or larger
- [x] 2.3 Brand Kit guidance (name or "my Canva brand"); `source: canva` recorded in draft and saved system (evidence.json, brand.json, the review page; page 1 is the reference image)

## 3. Skill and docs

- [x] 3.1 Brand skill: "from my Canva" option and what Canva can't give; regenerate copies
- [x] 3.2 `docs/guides/design-systems.md`, `docs/reference/tools.md`, hosted connector docs (`remote-server.md`), `brand-json.md`, CHANGELOG
- [ ] 3.3 Live check with a real Canva design in Claude (connector) and through the hosted gateway. Not run: needs a machine that can reach `export-download.canva.com`
