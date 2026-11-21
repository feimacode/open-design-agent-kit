## 1. Script

- [ ] 1.1 `browserMeasure.ts`: bundle the page measurement, roles, brand kit and a 2-second motion watch into one function string, with `scriptVersion` and a content hash; minify; size test under 60 KB
- [ ] 1.2 Pseudo-states from same-origin stylesheet rules (hover, active, focus-visible on the primary button and input), marked `declared`
- [ ] 1.3 Element boxes for crops; one scroll pass

## 2. Source and server

- [ ] 2.1 `measured` source kind in `sourceDraft.ts`: validate, version check, adapt to `PageEvidence`, run `evidenceToTokens`; crops from the screenshot
- [ ] 2.2 Schema in `session.ts`; `browserMeasure` block in the hosted `url` refusal (`remote.ts`)
- [ ] 2.3 Gateway route serving the script by hash (cache forever, CORS `*`); local server embeds the same string

## 3. Agent guidance

- [ ] 3.1 Skill and gateway guidance: on the hosted server, with a browser tool, measure in the browser; never estimate
- [ ] 3.2 Probe Claude in Chrome's `javascript_tool` on two strict-CSP sites; record which route works and set the default

## 4. Tests and docs

- [ ] 4.1 Parity test: bundled script under `page.evaluate` vs local extraction on the fixtures
- [ ] 4.2 Refusal includes `browserMeasure`; stale version refused; over-limit sources refused
- [ ] 4.3 Docs: tools reference, remote server, design systems guide; CHANGELOG
