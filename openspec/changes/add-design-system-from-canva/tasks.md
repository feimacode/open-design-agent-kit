## 1. Links and fetch

- [ ] 1.1 `canvaLink.ts`: parse design, template and short links; tests with real link shapes
- [ ] 1.2 Canva `exportHosts` in `integrations.json`; host check after redirects; 20 MB and 30 s limits; tests
- [ ] 1.3 `fileUrl` on `template` and `screenshot` sources (local and gateway); gateway still refuses other URLs; gateway tests

## 2. Extraction

- [ ] 2.1 `needs-canva-export` result and instructions (connector check, short link, export formats, PPTX + up to 4 PNG pages, call back)
- [ ] 2.2 Template reader Canva mode: stock theme to candidates, fonts from slide runs by use, repeated page images as marks; fixture from a real Canva PPTX export
- [ ] 2.3 Brand Kit guidance (name or "my Canva brand"); `source: canva` recorded in draft and saved system

## 3. Skill and docs

- [ ] 3.1 Brand skill: "from my Canva" option and what Canva can't give; regenerate copies
- [ ] 3.2 `docs/guides/design-systems.md`, `docs/reference/tools.md`, hosted connector docs
- [ ] 3.3 Live check with a real Canva design in Claude (connector) and through the hosted gateway
