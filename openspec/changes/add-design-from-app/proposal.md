## Why

Builders design the next screen of an app that already exists, and the design must look like the rest of it. Today the kit only knows the app is there: `appDetection.ts` reads `package.json` for a framework and nudges the agent to "check the app's conventions". It never reads the app's tokens (Tailwind config, CSS variables, a theme file), its components or its routes, and it can't start from a screenshot or URL of the current screen. So designs use a design system's tokens, never the team's real components, and promote to code then has to map a made-up button onto the real one. Claude Design reads a company's codebase for exactly this reason.

This is the second "Now" item of the UI design use case study (2026-11-02). It draws on OpenUI (`library.prompt()` writes the model's instructions from the allowed component library, so it can only use those components), XIAS's redesign-audit workflow (scan framework, tokens and components first; tokens before components; keep behaviour) and its `validate_theme_refs` and `lint_hardcodes` gates.

## What Changes

- **`scan_open_design_app` tool.** Reads the workspace (read-only) and returns an app profile: framework and styling (Tailwind, CSS Modules, CSS-in-JS, NativeWind), tokens found (Tailwind theme, `:root` and `[data-theme]` variables, MUI or shadcn theme files) with their source file and line, a component inventory (exported components under the usual folders with their props and variants where TypeScript or a story says so), routes or screens (Next.js, React Router, Expo Router file routes) and the app's light and dark themes. Bounded to 2,000 files and 1 MB read.
- **App design system.** With the user's go-ahead the agent saves the profile as a design system named "<app> (from code)": DESIGN.md and tokens.css that agree with the app, plus `components.json`, the component vocabulary. Its files come from one scan, so they agree by construction; what can go wrong is drift from the code, so the check notes when the files it was read from changed since (`app-design-system-stale`), and a re-scan shows what changed.
- **Only the app's components.** When the active design system has a component vocabulary, the instructions list it, OpenUI style (name, purpose, variants, props), and tell the agent to build each part from a listed component and mark it with `data-od-component="<Name>"`; a part with no match is marked `data-od-component="new:<Name>"` and listed in the reply as a proposed new component.
- **Redesign from a screenshot or URL.** `prepare_open_design_brief` accepts `baseScreen`: a workspace image path or a URL (captured with the existing browser capture). The instructions treat it as the current state to change, not a style reference, and the check's review sheet puts it beside the new design.
- **Token findings.** For designs with an app design system, the check adds `token-undefined` (a CSS variable used but defined nowhere) and `token-hardcoded` (a raw colour, size or radius where a token with that value exists).
- **Promote uses the real components.** Promote to code and component sets read `data-od-component` marks and import the app's component instead of making a new one.

## Capabilities

### New Capabilities
- `app-context`: the scan tool and app profile, the app design system with its component vocabulary, building from listed components, the redesign base screen, token findings and promote reuse.

### Modified Capabilities
None. Design system storage and reconcile, and the component-library port, keep their requirements; this change adds a manifest mark they read.

## Impact

- New `packages/core/src/workspace/appScan.ts` (extends `appDetection.ts`), `packages/core/src/generation/appDesignSystem.ts`; MCP tool in `packages/mcp-server/src/tools.ts` and VS Code tool; hosted gateway: not offered (needs a workspace).
- `composeInstructions.ts` (component vocabulary, `baseScreen`), `checkArtifact.ts` (token findings, base beside new on the review sheet), `componentLibrary.ts` and promote instructions (reuse marks).
- Docs `docs/guides/design-from-your-app.md` (new), `design-systems.md`, `promote-to-app-code.md`, `reference/tools.md`.
