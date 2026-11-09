## Why

People ask for "my brand from Canva" more than any other design tool. Their brand often lives only in Canva: a Brand Kit plus a few designs and templates made with it. Today the kit can't take it in:

- **The Canva connector can't read a Brand Kit.** Canva's MCP `list-brand-kits` returns only `id`, `name`, `thumbnail` and `icon_id`. No Canva tool returns a kit's colours, fonts or logos. Canva applies the kit on its own side when it generates a design, so Claude and ChatGPT stay on brand inside Canva but never see the values. Claude Design's design-system import needs a connector with structure, variables and code calls, which Canva doesn't have.
- **A Canva design is text plus pictures to an agent.** `read-design` returns text, page metadata, thumbnails and presenter notes. `export-design` returns PDF, PNG, JPG or PPTX download links.
- **Our extractor already reads both outputs.** `extract_open_design_design_system` takes a PowerPoint `template` source (theme colours, fonts, master, logo images: `declared`) and `screenshot` sources (pixel palette: `sampled`), merges them by confidence and lists conflicts. Nothing connects a Canva link to it, so an agent has to find this route on its own, and on the hosted gateway it can't pass a Canva download link at all.

No tool we surveyed (Claude Design, Lovable, Bolt, v0, Figma Make) builds a design system from Canva.

## What Changes

- **Canva links on the extract tool.** `extract_open_design_design_system` accepts a Canva design, template or short link in `url` (`canva.com/design/<id>/…`, `canva.com/templates/…`, `canva.link/…`). The server never contacts Canva. It returns `status: "needs-canva-export"` with instructions: check the Canva connector via `list_open_design_integrations`, resolve a short link with `resolve-shortlink`, call `get-export-formats`, export the design as **PPTX** (whole design) and **PNG** (up to 4 pages: cover plus the three pages with the most text and colour), then call the tool again with those files as `template` and `screenshot` sources.
- **Canva export links as sources.** A `template` or `screenshot` source may give `fileUrl` instead of a path or data, accepted only when its host is a Canva export host (an allowlist in `integrations.json`, not a pattern the caller supplies). The server downloads it once (20 MB limit, 30 s timeout), on the local server and on the hosted gateway alike. This is the only fetch the gateway makes, and it never reaches an arbitrary site.
- **Canva-aware reading of the template.** A Canva PPTX export often carries a generic Office theme even when the slides are branded. The template reader already flags stock themes; for a Canva export it then drops the theme to candidates and lets the sampled pixels and the fonts actually used on slides decide. Fonts come from the runs on the slides (by use count), not only from the theme's major and minor fonts. Images placed on every page (logo, footer mark) become marks in the evidence bundle.
- **Brand Kit links and names.** Given a Brand Kit (by name from `list-brand-kits`, or "use my Canva brand"), the instructions say plainly that the connector can't read kit values. They ask once for a design or brand template made with the kit (a brand template is the best sample), then follow the design route. As an alternative they accept the brand guide PDF or pasted hex codes and font names, which the tool already takes.
- **Source label.** The draft and the saved system record `source: canva` with the design link, export date and page numbers, so the review page and a later refresh know where it came from.
- **Skill.** The brand skill (`open-design-design-system-from-url`) adds "from my Canva" to its first question. It names what Canva can't give us: kit values directly, font files, and hover or focus states.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `design-system-extraction` (from `add-design-system-from-url` and `add-brand-from-screenshot-or-css`, not yet archived): Canva link handling, Canva export URLs as sources, Canva-aware template reading, Brand Kit guidance.

## Impact

- `packages/core/src/generation/siteExtraction.ts`: Canva link detection and the `needs-canva-export` result; `templateExtraction.ts`: Canva export mode (slide font use counts, repeated images as marks); new `canvaLink.ts` (link parsing and the export-host check).
- `packages/content/assets/open-design/integrations.json`: Canva `exportHosts` allowlist, `design.export` tool list.
- `packages/mcp-server/src/session.ts`, `tools.ts`: `fileUrl` on sources; `remote.ts`: allow `url` when it is a Canva link and `fileUrl` from export hosts, keep refusing other URLs.
- Skill, `docs/guides/design-systems.md`, `docs/reference/tools.md`, the hosted connector docs.
- Not in this change: turning a Canva design into an Open Design artifact (`add-canva-design-import`, which needs one real design to test `read-design` element data first), and syncing back to the Canva Brand Kit.
