## Context

`appDetection.ts` returns framework names from `package.json`. `projectContext.ts` reads PRODUCT.md and DESIGN.md (Impeccable interop). Design systems are folders with DESIGN.md and tokens.css; sources are reconciled by `reconcile-design-system-sources`. `componentLibrary.ts` generates MUI or shadcn components from a design, and promote to code turns one design into app code. Browser capture exists for `extract_open_design_design_system`.

## Goals / Non-Goals

**Goals:** a design for an existing app uses that app's tokens and components, so promote to code is reuse, not translation; redesigns start from what is on screen now.

**Non-Goals:** running the app or its build; reading component source to render it in the preview (designs stay plain HTML that imitates the components, marked by name); non-JavaScript apps beyond tokens (SwiftUI and Compose get tokens only, from asset catalogs and theme files, in a later change); changing any app file.

## Decisions

### Deterministic scan, agent judgement after

The tool collects facts with parsers we already ship or can cheaply add (PostCSS for CSS variables, a TypeScript AST pass for exported components and their prop unions, file-route conventions). It does not guess which tokens matter; the agent proposes the design system and the user approves it, like the URL extraction flow.

### Vocabulary in the instructions, not a DSL

OpenUI constrains output with its own language and renderer; we keep HTML and constrain with instructions plus a mark. The list is capped at 60 components (most used first, by import count) so it fits a brief. The mark makes the constraint checkable: the check can count unmarked interactive elements and `new:` marks.

### Tokens: file and line kept

Each token keeps where it came from, so `token-hardcoded` can say "use `--brand-600` (tailwind.config.ts:14)" and a re-scan diffs cleanly.

### Base screen is a role, not a reference

A reference image says "look like this"; a base screen says "this is the screen, change it". The instructions say which. Captured bases are stored under `.open-design/.bases/` and never published.

## Risks / Trade-offs

- Large monorepos: bounded scan, with a `root` input to point at one app.
- Component props from untyped code are partial. Mitigation: props are "known" or "unknown"; the instructions only list known ones.
- Secrets in config files: the scan reads only style, component and route files by pattern, never `.env*`, and reports paths, not values, for anything else.
