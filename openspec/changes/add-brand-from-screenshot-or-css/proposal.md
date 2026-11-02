## Why

The extraction only works where the kit's own server can open the brand's site in a local Chrome. Many people who want their brand in their designs can't get there:

- **Hosted hosts have no extraction at all.** The hosted gateway hides `extract_open_design_design_system` ("rendering any website from the server") and refuses `sourceUrl` on `create_open_design_design_system`. So in claude.ai, Claude Desktop chat with the hosted connector, and ChatGPT, the only route is describing the brand in words.
- **Blocked pages dead-end.** On a bot check or login wall, the skill asks the person for "the site's CSS or a screenshot", but no tool takes either. The model then reads hex values off a screenshot by eye, which is exactly the guessing the extraction exists to avoid.
- **The brand isn't always a website.** Teams have a brand guidelines PDF, a `tokens.json`, a Tailwind config, a Figma style page screenshot, or an app that isn't public yet (an intranet, a staging site, a native app). The VS Code import command reads token files but never assigns roles, and it is VS Code only.
- **No browser.** Without Chrome, Edge or Chromium the tool falls back to `brandExtraction.ts`: up to 8 hex colours and 6 font names by regex, no roles.

## What Changes

- **More sources for the same tool.** `extract_open_design_design_system` accepts `sources` alongside or instead of `url`: `screenshot` (a workspace image path, or image data up to 4 MB on the hosted gateway), `css` (a workspace file or pasted text: CSS, a Tailwind config, `tokens.json` in W3C design tokens format), `html` (page source the host fetched itself) and `brandGuide` (a PDF or document path, read through the existing `read_open_design_source` conversion). Up to 6 sources per call.
- **Same draft shape, honest confidence.** Every source produces the same `draft` and `sources` map as a URL extraction, and each token's source says how it was found: `measured` (rendered page), `declared` (a stylesheet or token file names it for that role), `stated` (a brand guide labels it, such as "Primary: #0B1F3A"), or `sampled` (pixels of a screenshot). When sources disagree, the order is measured, declared, stated, sampled, and the losers are listed under `conflicts`.
- **Screenshot sampling.** A deterministic palette from the image: background from the dominant colour at the edges and largest regions, text colours from small high-contrast clusters, accent from the most saturated colour with a meaningful area, each with its area share and a crop. Fonts are never guessed from pixels; the result says fonts need confirming.
- **CSS and token files with roles.** Declarations are read with a CSS parser, not regex: `:root` and theme-scoped custom properties, `body`, `a`, `button` and `.btn`/`.button` rules, Tailwind `theme.extend` colours and fonts, and W3C token files. Roles are assigned only when a selector or token name says what it is (`body { background }` is `--bg`; `--color-primary` is `--accent`); everything else stays a candidate.
- **Brand guides.** Colour codes (hex, RGB, CMYK with a computed sRGB value, Pantone names recorded as given) and font names are read with the label next to them; "Primary", "Secondary", "Background" and "Text" map to roles, others stay candidates.
- **On the hosted gateway.** The tool is offered in sources-only mode: `url` is refused there as today, but `screenshot` data, `css`, `html` and `brandGuide` work, and the skill tells hosts that can fetch pages themselves (claude.ai, ChatGPT) to fetch the page and its stylesheets and pass them as `html` and `css`. Nothing is fetched by the server.
- **Skill.** `open-design-design-system-from-url` becomes the brand skill for all of these ("from my site, my brand guide, this screenshot"); its first question offers the sources the host can use. A blocked page now goes straight to "send me a screenshot or the CSS", and the tool takes it.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `design-system-extraction` (from `add-design-system-from-url`, not yet archived): extraction from screenshots, stylesheets and token files, page source and brand guides; source confidence; sources-only mode on the hosted gateway. Added as new requirements.

## Impact

- New `packages/core/src/generation/sourceExtraction.ts` (CSS, Tailwind, W3C tokens, HTML, brand guide text) and `screenshotPalette.ts` (pixel sampling with the image decoder the kit already ships for checks); `siteExtraction.ts` merges sources by confidence.
- `packages/mcp-server/src/session.ts` and `tools.ts`: `sources` input; `remote.ts` offers the tool in sources-only mode and keeps refusing `url`.
- `brandExtraction.ts` is replaced as the no-browser fallback by fetching the page and its stylesheets into `html` and `css` sources (local server only).
- VS Code **Import Design System** reuses the role assignment, so imports get roles too.
- Skill and docs: `local/prompts/design-system-from-url.md`, `docs/guides/design-systems.md`, `docs/reference/tools.md`, `docs/guides/hosted` pages that say what works where.
