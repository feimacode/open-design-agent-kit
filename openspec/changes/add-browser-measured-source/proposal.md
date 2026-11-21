## Why

The hosted server can't open websites, so `extract_open_design_design_system` refuses a `url` there and asks the agent to fetch the page source and pass it as `html` and `css` sources. In a test on 2026-11-22 (Claude, hosted plugin) that broke down twice:

- The agent's own fetch was blocked too, so it had no page source to pass.
- It fell back to reading styles in the user's Chrome by hand (Claude in Chrome) and estimating the rest: two type steps, a panel radius, motion timings and the input focus style.

So the user got a design system with guessed values in it. They got none of what the local extraction gives: accent candidates with crops, coverage across pages, component specs, observed motion, `nearest`.

The local extraction already measures with self-contained page scripts: `measurePageInBrowser`, `measureRolesInBrowser`, `captureBrandKitInBrowser` and the motion recorder. They're injected with `toString()`. The agent's browser can run the same scripts. Only the transport is missing: getting the script to the page and the result back to the server.

## What Changes

- **The hosted tool hands out the measurement.** When the hosted server refuses a `url`, it returns a `browserMeasure` block alongside the current sources advice. The block holds a one-line loader for the agent's browser tool (for example Claude in Chrome's `javascript_tool`), the inline script as a fallback, and the exact call to make next.
  - The loader fetches the script from the gateway at a versioned, content-hashed URL.
  - The inline copy is minified and capped at 60 KB.
  - The text tells the agent to use it only if it has a browser tool. Otherwise it should fall back to `html`/`css` sources, or ask the user for a screenshot.
- **One bundled browser script.** `measureSiteInBrowser()` combines the page measurement, role measurement, brand-kit capture and a short motion watch into one self-contained function. It scrolls the page once, reads computed styles, and returns compact JSON stamped with `scriptVersion`.
  - Forced `:hover`/`:active`/`:focus-visible` states need CDP, which a page script doesn't have. Instead, the script reads the matching rules from same-origin stylesheets, so those values come back as `declared`, not `measured`.
  - Crops aren't possible in-page. The result carries element boxes, and the agent attaches one viewport screenshot so the server can cut crops from it.
- **A new `measured` source kind.** `extract_open_design_design_system` takes `{ kind: "measured", url, data, screenshot? }`.
  - The server validates `data` against the script version it serves. It refuses an unknown or stale version, and says to fetch the script again.
  - It then runs the same `evidenceToTokens` path as a local URL extraction, so accent candidates, coverage, consistency, components, motion and `nearest` all come back.
  - Values keep confidence `measured`. A note says the page was measured in the user's browser.
  - Up to 4 pages, each its own source, matching the local page limit. The agent may measure discovered nav pages the same way.
- **Local servers accept it too.** A local server whose own browser is blocked (a corporate proxy, a bot check that lets the user's real browser through) can take the same source. The hosted gateway serves the script. The local server embeds it.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `design-system-extraction`: a `measured` source produced by running the kit's page script in the agent's browser, and the hosted refusal that offers it.

## Impact

- `packages/core/src/generation/`: new `browserMeasure.ts`, which bundles the page functions into one string with a version and hash, and validates and adapts the returned JSON into `PageEvidence`. `sourceDraft.ts` gains the `measured` kind. `siteExtraction.ts` exports what it needs.
- `packages/mcp-server/src/remote.ts`: the refusal adds `browserMeasure`. `session.ts`: the `sources` schema adds `measured`.
- `packages/mcp-gateway`: a static route for the script by hash, with long cache and CORS `*`.
- Skill `design-system-from-url.md` and the gateway guidance: on the hosted server, run the browser route when a browser tool exists.
- Tests:
  - The bundled script runs under `page.evaluate` on the extraction fixtures and gives the same draft as the local path, within ΔE 2 and ±1 px.
  - A stale `scriptVersion` is refused.
  - The script stays under the size cap.
- Docs: `tools.md` (the source kind), `remote-server.md`, the design systems guide.

## Open questions

- Does Claude in Chrome's `javascript_tool` run in the page's world, under its CSP? If CSP blocks `fetch` or `eval`, the inline fallback is the route. The size cap keeps that workable. This needs a probe on two sites with strict CSP before the loader is the default.
- Is the 60 KB inline cap enough once minified? The current page functions are about 45 KB of TypeScript source.
