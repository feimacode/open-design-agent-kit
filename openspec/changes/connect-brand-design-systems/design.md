## Context

User design systems live under `<output>/design-systems/<slug>/` as `user:<slug>`, are loaded on every call, and have no descriptor row (descriptors are curated for bundled systems in `design-system-descriptors.json`). The check's taste detectors run in the page through `collectPreflight` and read the page's own tokens. The critic is a subagent fed by `get_open_design_artifact` with `critique: true`. `claudeDesignSystem.ts` is pure; only the script calls it today.

## Goals / Non-Goals

**Goals:** once a brand is saved, the kit uses it by default, checks designs against it, and carries it to Claude Design without a repository checkout.

**Non-Goals:** enforcing the brand (all brand findings are warnings or notes); syncing with Claude Design after export; per-team brand permissions; listing user systems on the public online gallery.

## Decisions

### `brand.json` kind is the switch

Every behaviour here keys off "the active system is an own brand". Reading it from `brand.json` (or the `kind` given to `create_open_design_design_system`, written into `brand.json` then) keeps bundled and reference systems exactly as today.

### Preference, not lock-in

The recommender adds a fixed boost to own-brand systems instead of filtering, so a brief that names another look ("in the style of Linear") still wins, and the existing `avoid` list can exclude the brand. The brief note only informs; it never switches the active system.

### Off-palette by area and distance

Counting every off-palette colour would flag photos, shadows and antialiasing. The detector samples painted backgrounds, text and borders (not images, video or canvas), weights by area, and accepts tints: any colour on the line between a token colour and white or black within ΔE 6. 1% of the page is the floor, so a single badge doesn't trigger it. Opt-out through the existing `data-od-allow` attribute.

### Fidelity by re-measuring

The best judge of "does the sample match the site" is the same measurement on both. The showcase is rendered from the draft with fixed markup, so the extraction script finds its button, card and text roles reliably; the differences become findings with both values. The model and the person still decide.

### Export as a tool, publishing stays with the host

There is no public API for Claude Design. The tool writes files; in Claude hosts the agent publishes them with its Artifact tool, as the docs already describe for bundled systems. On the hosted gateway the files go to the project store with a download link.

### Refresh never writes

`compareTo` returns a diff only. Applying a change is the skill's job, one confirmed group at a time, so a site redesign can't silently restyle every future design.

## Risks / Trade-offs

- Brand checks on designs that are meant to be off-brand (a partner co-brand). Mitigation: warnings only, `data-od-allow`, and the brief can name another system.
- Reference screenshots in the system folder add weight (about 300 KB). Mitigation: one desktop screenshot only, JPEG at quality 80.
- Logos in exports may be trademarks. Mitigation: assets are exported only for own-brand systems.
