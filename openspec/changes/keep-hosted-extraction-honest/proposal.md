## Why

The same hosted test (2026-11-22) produced a design system that works but misleads in three ways:

- **Estimates were written in.** The agent filled tokens it never measured with guesses: two type steps (24px and 48px), a "roughly 24px" panel radius, motion timings and an input focus style. It did say so in its reply, but the files don't. The local skill already says "never make one up". That rule lives in the step that follows an extraction, though, and this run had no extraction draft, so nothing caught the guesses.
- **A server path was shown to the user.** `/data/anon/odp_…/files/design-systems/feimacode/` means nothing to someone in claude.ai, although the gateway's own instructions say "give links, not paths". The save result gives the agent only paths, so it repeated one.
- **Defaults weren't named.** "Success, warning and error use generic defaults" doesn't tell the user which tokens those are, or what to send to fix them.

## What Changes

- **No estimates, on any route.** These say that a token nobody measured is left to the contract fallback and listed under "Not measured":
  - the hosted refusal text;
  - the create instructions;
  - the skill's hand-reading branch, for when the agent reads a page itself.

  A value derived from a measured one (`color-mix()` of `--accent`, a step of a measured scale) is fine, and so is one the user states. A literal value invented by the agent is not.
- **The review flags invented values.** When a design system is saved with `evidenceDir`, the review's check compares `tokens.css` with the draft. A literal value for a token the draft lists as `unmeasured` raises an info finding, `brand-unmeasured`: "`--radius-lg: 24px` wasn't measured on the site. Remove it to use the default, or confirm it." Derived values (`var()`, `color-mix()`, `calc()`) and values from a stated source don't raise it.
- **DESIGN.md lists what wasn't measured.** The create instructions write a short "Not measured" line under the tokens, naming each fallback token with its default value. That covers the status colours, the type steps the page didn't show, and motion.
- **Links, not paths, on the hosted server.** Hosted results for `create_open_design_design_system` and `export_open_design_design_system`:
  - carry no server paths in their user-facing fields;
  - add the review and brand pages as viewer links, and the Claude Design export as a download link;
  - add a `next` line: show the links, offer the Claude Design export, never the folder path.

  Local results stay as they are.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `design-system-extraction`: unmeasured tokens are never estimated, are flagged when they are, and are listed in DESIGN.md; hosted results give links instead of paths.

## Impact

- `packages/mcp-server/src/remote.ts`: refusal text; path-free hosted results with viewer and download links (it reuses the hosted design viewer).
- `packages/core/src/generation/customDesignSystemInstructions.ts`: the "Not measured" line and the no-estimates rule.
- `packages/core/src/export/brandReview.ts` or `brandChecks.ts`: the `brand-unmeasured` finding.
- Skill `design-system-from-url.md` and gateway guidance: the hand-reading branch, and the reply naming fallback tokens.
- Tests: the finding on a literal unmeasured value but not on a derived one; hosted results contain no `/data/` paths; instructions include the "Not measured" line.
- Docs: `tools.md`, `remote-server.md`, the design systems guide.
