## Context

The kit's server can't call another MCP server; only the host agent can. So every connector route in the kit is "the server composes instructions, the agent calls the connector, the agent calls us back" (`pull_open_design_figma_frame`, `publish_open_design_artifact_to_canva`). `extract_open_design_design_system` already merges `template` and `screenshot` sources by confidence (`add-brand-from-screenshot-or-css`).

Canva MCP facts this depends on (tool schemas read 2026-11-08): `export-design` takes `design_id` plus `format.type` in `pdf | png | jpg | gif | pptx | mp4 | csv` with `pages`, and returns a download URL. `get-export-formats` says which types and pages a design supports. `list-brand-kits` returns id, name, thumbnail and icon id only. Export calls are limited to 20 a minute.

## Goals / Non-Goals

**Goals:** one Canva link becomes a reviewed Open Design system on every host where the Canva connector is connected, including claude.ai and ChatGPT through the hosted gateway. Every value says whether it was declared by the export or sampled from pixels.

**Non-Goals:** reading Brand Kit values (no tool exposes them); font files (Canva doesn't export them, so we note them as needed); importing a design as an editable artifact; writing back to Canva.

## Decisions

### PPTX plus PNG, not PDF

A PPTX export is a zip the template reader already parses: theme, master, slide text runs with fonts and sizes, and placed images. A PNG gives the pixels that ship. A PDF would need a second parser and adds nothing the two don't already give. Up to 4 PNG pages keeps the call count at 2 exports regardless of design length.

### Fonts from slide runs

Canva writes each text run's font on the run, and its theme fonts are often defaults. Counting fonts by characters set on slides (headings vs body by size rank) gives the fonts the design really uses. The theme fonts stay as candidates.

### Allowlisted export hosts, server downloads

On claude.ai and ChatGPT the agent can't save a download link to a workspace file, and base64 through the conversation is too large for a PPTX. So the server downloads the file itself, but only from Canva's export hosts listed in `integrations.json`. The host is checked after redirects too, with no cookies or credentials sent. This keeps the gateway's "no arbitrary fetch" rule: a caller can't point it anywhere else.

### Brand Kit: say so, ask once

Guessing kit values from the kit thumbnail would be sampling a tiny image of swatches; it misleads more than it helps. The instructions say why, and ask for a design made with the kit.

## Risks / Trade-offs

- Export host names could change. Mitigation: a failed host check returns a clear message naming the host, and the allowlist is content, not code, so a fix is a content release.
- Canva's PPTX may flatten text into images on some designs. Then the screenshot sources carry the result and fonts are marked as needing confirmation, same as a screenshot-only extraction.
