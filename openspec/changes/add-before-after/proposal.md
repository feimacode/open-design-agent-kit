## Why

In the sales call, the designer has to show why the new site is better. A link to the concept alone makes the client compare it from memory with a site they're used to. The post that started this study ("Simple Way to Get Web Design Clients") puts it plainly: "instead of asking someone to imagine how much better their website could be, I can actually show them". The kit already keeps the "before" (redesign base screens in `.bases/`) and the evidence (audit findings, copy edits), but it has no page that puts them side by side.

This is the third pick of the web design client workflow study (2026-11-03). It builds on add-site-audit and add-redesign-from-url, and works with base screens alone when neither is installed.

## What Changes

- **New MCP tool `compare_open_design_before_after`.** Takes a design's entry path, or a collection for a multi-page redesign. Writes `before-after.html` beside the design. For each page, the result has:
  - the base screen and a fresh capture of the design, at desktop and phone sizes;
  - a drag slider and a side-by-side toggle;
  - the audit findings for that page, each paired with what the new design does about it, and a re-check of the same rule on the design (contrast 2.4:1 → 7.1:1);
  - the list of copy edits with the original text, from `data-od-copy-edit`.
- **Fixed means re-checked.** A finding counts as fixed only when the same check passes on the design at the same size. Otherwise it is listed as "still open", never hidden.
- **Ready for the call and after it.** The page works offline as one HTML file, and it publishes with the design (share link, Netlify, Vercel, Claude artifact) so the client can open it after the meeting. A PDF export gives one page per screen for email.
- **A pitch summary at the top.** Up to three short lines written by the agent from the fixed findings: what was wrong and what changed. The page shows where each line came from, so nothing in the summary goes beyond the evidence.
- **Skill.** The redesign recipe ends with this page. The `open-design-preview` and `open-design-publish` skills offer it when a design has a base screen.

## Capabilities

### New Capabilities
- `before-after`: the comparison page, re-checked fixes, the copy edit list, the summary rule and its exports.

### Modified Capabilities
None. Base screens, publishing and export keep their requirements; this change reads from them.

## Impact

- New `packages/core/src/export/beforeAfter.ts` (page render, captures, re-check through `checkArtifact` passes), sharing slider and layout code with `workspace/explorationCompare.ts`.
- MCP `tools.ts`, VS Code tool, `exportArtifact.ts` (PDF of the comparison), publish of the page with its design or flow.
- Skills: redesign recipe, preview and publish.
- Docs `guides/redesign-a-website.md` (pitch section), `reference/tools.md`, CHANGELOG; eval check on the redesign brief's run.
