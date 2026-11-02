## Why

Extracting a brand is only the first step. The person wants every later design to use it, to be checked against it, and to carry it into Claude Design. The audit (2026-11-02) found the rest of the kit treats an extracted brand like any other custom system, and in places works against it:

- **DESIGN.md says "Inspired by" for your own brand.** `customDesignSystemInstructions.ts` always writes the heading `# Design System Inspired by <Name>`, so the person's own brand is labelled as a look-alike of itself, and that heading becomes the display name.
- **The recommender doesn't know it's yours.** User systems have no descriptor, so they rank on token facets and brief words only, as a generic web system, against 198 bundled ones. Someone who extracted their brand and asks for "a launch poster" can be recommended Stripe.
- **The check can fight the brand.** `slop-glow` warns when `--accent` is a Tailwind indigo, even when the active system is the person's own brand and that indigo is their colour. Nothing does the opposite: a design that drifts off the brand's palette, or sets body text in a font the brand doesn't use, gets no finding (`type-scale` covers only `h1` and `h2`).
- **The critic judges fit from prose.** Its input is the brief and DESIGN.md; it never sees the site the brand came from or the brand's measured components, so "fit" is judged against the model's own reading of the Markdown.
- **The review page is hand-written each time.** The skill describes a sample page for the model to write. The kit already has a deterministic showcase renderer (`renderDesignSystemShowcase`, used by VS Code's preview); the review doesn't use it, and the "does it match?" step has no measurement, only the model's eye.
- **Claude Design needs a checkout.** Exporting a custom system to Claude Design's format is `npx tsx scripts/claude-design-system.ts export`, which only works in a clone of this repository. Plugin, Desktop and hosted users can't run it. The exporter also drops logos ("No components or assets").
- **Root DESIGN.md is not offered.** `set_active_design_system` can write a project-root `DESIGN.md` that Impeccable, Stitch and Cursor rules read, but the extraction skill never offers it, so other tools in the project don't see the brand.
- **Not on the online gallery.** "Open in Claude" exists only for bundled systems; a team has no page to share their extracted brand with.
- **No refresh.** Re-running the extraction overwrites the evidence and starts from scratch; there's no "what changed on our site since we saved this".

## What Changes

- **Own brand vs reference in the files.** The DESIGN.md template's heading depends on `brand.json`'s kind (from `add-brand-kit-capture`, or a `kind` input on `create_open_design_design_system` when it isn't there): `# <Name> Design System` for own brands, `# Design System Inspired by <Name>` for references.
- **Recommender prefers your brand.** User systems with `brand.json` kind `own` rank first when the profile names no other brand and doesn't ask to avoid it; their descriptor (moods, industries, surfaces) is read from `brand.json`, which the skill fills from the site. `prepare_open_design_brief` adds a note when an own-brand system exists but a different one, or none, is active.
- **Brand checks.** When the active system is an own brand: `brand-off-palette` warns when a colour covering more than 1% of the rendered page is not close (CIELAB ΔE over 6) to any colour token of the system or a tint of one; `brand-font` warns when body or heading text uses a family outside the system's stacks; `slop-glow`'s indigo rule is skipped when the indigo is the system's own `--accent`. For posters, social posts and decks, `brand-mark-missing` is an info note when the brand has a logo and the design shows none.
- **Critic sees the brand.** For own-brand systems the critic's input adds the site's desktop screenshot (kept as `reference.png` in the system folder), the component specs and voice facts, and its `fit` score is judged against them.
- **Review from the showcase, with a fidelity check.** The review page's right column is the showcase renderer's output for the draft, using the measured component specs. `check_open_design_artifact` on a review page (marked `data-od-brand-review`) re-measures the showcase with the extraction's own script and reports `brand-fidelity` findings for roles, fonts, radii and button size that differ from the evidence.
- **Claude Design export as a tool.** A new `export_open_design_design_system` tool writes a design system in Claude Design's `project/` format into the output folder (the code in `claudeDesignSystem.ts`, which the script also keeps using), with logos and icons in `project/assets/` and a fonts note, and returns the file list for the agent's Artifact tool to publish. Works locally and on the hosted gateway.
- **Root DESIGN.md offered.** At save, for own brands, the skill offers `set_active_design_system` with `writeProjectDesignMd: true`, saying which tools read it.
- **A brand page to share.** The export also writes `brand.html` (showcase, marks, voice and do and don't from DESIGN.md) as a registered artifact, so `publish_open_design_artifact` can share it like any design.
- **Refresh.** `extract_open_design_design_system` takes `compareTo: "user:<id>"`: it extracts from the URLs in that system's `brand.json` and returns a diff (tokens, fonts, components and marks added, changed or removed) without changing the system; the skill applies only what the person accepts.

## Capabilities

### New Capabilities
- `brand-design-systems`: own-brand naming, recommender preference and active-system note, brand checks, critic brand input, showcase review with fidelity findings, the export tool with assets and brand page, root DESIGN.md offer, and refresh.

### Modified Capabilities
None. Recommendation, checks and critique keep their requirements; these are additions that apply when the active system is an own brand.

## Impact

- `generation/customDesignSystemInstructions.ts` (heading by kind, `kind` input); `content/designSystemMatching.ts` and `contentIndex.ts` (descriptor from `brand.json`, own-brand preference); `composeInstructions.ts` (active-system note).
- `poster/pageScripts.ts` and `export/checkArtifact.ts` (`brand-off-palette`, `brand-font`, `brand-mark-missing`, indigo exemption, `brand-fidelity` on review pages); `workspace/critique.ts` and the `design-critic` agent (brand input).
- `generation/claudeDesignSystem.ts` (assets), new MCP and VS Code tool `export_open_design_design_system`, gateway allow-list; `designSystemPreview.ts` reused for the review and `brand.html`.
- `siteExtraction.ts` (`compareTo` diff).
- Skill `design-system-from-url.md`; docs `design-systems.md` (Your own brand), `reference/tools.md` (new tool, new findings), `remix-and-gallery.md`.
- Depends on `add-brand-kit-capture` for `brand.json`; works with a `kind` input before it lands.
