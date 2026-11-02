## ADDED Requirements

### Requirement: App Scan Tool

The kit SHALL provide a read-only `scan_open_design_app` tool that returns the workspace app's framework and styling method, its tokens with source file and line, its light and dark themes, an inventory of exported components with known props and variants, and its routes or screens; the scan SHALL read at most 2,000 files and 1 MB, accept an optional `root`, never read `.env*` files and never change a file.

#### Scenario: Tailwind app
- **WHEN** the workspace is a Next.js app with a Tailwind theme and a `components/ui/button.tsx` exporting `Button` with a `variant` prop
- **THEN** the profile lists the Tailwind colours with `tailwind.config.ts` line numbers and a `Button` component with its variants

#### Scenario: No app
- **WHEN** the workspace has no `package.json` and no style files
- **THEN** the tool returns an empty profile and says no app was found

### Requirement: App Design System

On the user's approval, the agent SHALL be able to save an app profile as a design system whose DESIGN.md and tokens.css agree with the app's tokens and whose `components.json` holds the component vocabulary; a later scan SHALL report tokens and components added, changed or removed since it was saved.

#### Scenario: Re-scan after a colour change
- **WHEN** the app's primary colour changes in its Tailwind config after the design system was saved
- **THEN** a new scan reports that token as changed, with old and new values

### Requirement: Build From the App's Components

When the active design system has a component vocabulary, the instructions SHALL list at most 60 components with purpose, variants and known props, and tell the agent to build each part from a listed component marked `data-od-component="<Name>"`, or mark a part with no match `new:<Name>` and list it in the reply.

#### Scenario: Proposed new component
- **WHEN** a design needs a stepper and the vocabulary has none
- **THEN** the stepper is marked `data-od-component="new:Stepper"` and the reply lists Stepper as a proposed component

### Requirement: Redesign Base Screen

`prepare_open_design_brief` SHALL accept a `baseScreen` (a workspace image path or a URL); the instructions SHALL treat it as the current screen to change, and the check's review sheet SHALL show it beside the new design; captured bases SHALL be stored under `.open-design/.bases/` and never published.

#### Scenario: Redesign from a URL
- **WHEN** the brief has `baseScreen` set to the app's settings page URL
- **THEN** the page is captured, the instructions call it the current screen, and the review sheet shows it next to the result

### Requirement: Token Findings

For a design on an app design system, the check SHALL report `token-undefined` for a CSS variable used but defined nowhere in the page or design system, and `token-hardcoded` for a raw colour, length or radius equal to a token's value, naming the token and its source.

#### Scenario: Hard-coded brand colour
- **WHEN** a button uses `#2563eb` and the app defines `--brand-600: #2563eb` in `tailwind.config.ts`
- **THEN** the check reports `token-hardcoded` suggesting `--brand-600` and its source line

### Requirement: Promote Reuses Marked Components

Promote to code and component sets SHALL import the app's component for every part marked with a listed `data-od-component`, and SHALL only generate components for `new:` marks and unmarked parts.

#### Scenario: Button reused
- **WHEN** a settings design marked with `data-od-component="Button"` is promoted
- **THEN** the generated code imports the app's `Button` and creates no new button component
