## 1. Script

- [x] 1.1 `browserMeasure.ts`: bundle the page measurement, roles, brand kit and a 2-second motion watch into one function string, with `scriptVersion` and a content hash; minify; size test under 60 KB
- [x] 1.2 Pseudo-states from same-origin stylesheet rules (hover, active, focus-visible on the primary button and input), marked `declared`
- [x] 1.3 Element boxes for crops; one scroll pass

## 2. Source and server

- [x] 2.1 `measured` source kind in `sourceDraft.ts`: validate, version check, adapt to `PageEvidence`, run `evidenceToTokens`; crops from the screenshot
- [x] 2.2 Schema in `session.ts`; `browserMeasure` block in the hosted `url` refusal (`remote.ts`)
- [x] 2.3 Gateway route serving the script by hash (cache forever, CORS `*`); local server embeds the same string (the local server builds it from the same page functions; it has no url refusal, so it doesn't hand it out)

## 3. Agent guidance

- [x] 3.1 Skill and gateway guidance: on the hosted server, with a browser tool, measure in the browser; never estimate
- [ ] 3.2 Probe Claude in Chrome's `javascript_tool` on two strict-CSP sites; record which route works and set the default (needs a real browser with the extension; the refusal offers the loader and the inline script until then)

## 4. Tests and docs

- [x] 4.1 Parity test: bundled script under `page.evaluate` vs local extraction on the fixtures
- [x] 4.2 Refusal includes `browserMeasure`; stale version refused; over-limit sources refused
- [x] 4.3 Docs: tools reference, remote server, design systems guide; CHANGELOG
