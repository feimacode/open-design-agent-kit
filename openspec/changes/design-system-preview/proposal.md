## Why

Today a user can only choose a design system from a text list (the `Browse Design Systems` QuickPick). They commit to it without seeing what it looks like. Upstream Open Design has a visual preview. Porting it showed a deeper gap: upstream's previews are driven by each system's curated **`tokens.css`**, which follows a formal token contract (`packages/contracts/src/design-systems/token-schema.ts`). Upstream calls DESIGN.md-only folders "solely a compatibility path for older or user-installed folders", and that is exactly what this extension's custom design systems are. Measured over all 152 bundled systems, deriving tokens from DESIGN.md prose alone matches the curated `tokens.css` only ~⅓ of the time (accent 50/143, background 50/151, text 51/148). A preview built on that would be wrong for most systems. Custom ones would always be worse than built-in ones.

So this change does two things together: it adds the preview, and it makes `tokens.css` a first-class part of every design system, custom ones included, so one rendering pipeline gives built-in and custom systems the same quality.

## What Changes

- **Design Systems tree view** in the Open Design activity-bar container, alongside Gallery and Collections. Built-in and custom systems are grouped by category, the active one is marked, and the view live-refreshes. Click opens the preview. Inline actions: Use in chat, Set as active, Preview.
- **Design System Preview** webview panel with **two tabs** (cut down from upstream's three):
  - **Visualize**: identity, typography specimens, palette, voice, imagery & layout, and an embedded **component kit** with a Light/Dark toggle.
  - **Showcase**: a full product page (nav, hero, features, pricing…) styled by the system.
  - A collapsible side panel switching between **DESIGN.md** and **tokens.css** source.
  - Header actions: Set as active, Use in chat.
- **One token pipeline for every system**: `tokens.css` + local override → DESIGN.md heuristics (gap-fill only) → schema defaults, resolved at render time. The component kit is rendered at runtime from upstream's kit template instead of vendoring upstream's pre-rendered `kit.html` files. Upstream's Showcase generator is given the resolved tokens instead of guessing colours from prose.
- **Content sync vendors `tokens.css`** (0.93 MB for 152 systems) instead of `kit.html` / `kit.dark.html` (1.96 MB). The content overlay gains additive per-system token overrides. These are used to fix 8 upstream systems (including Application) whose `tokens.css` still carries a placeholder accent that contradicts their own DESIGN.md.
- **Custom design systems get a `tokens.css`**:
  - `create_open_design_design_system` instructs the model to author `tokens.css` to the token contract alongside DESIGN.md.
  - The deterministic import writes `tokens.css` whenever the source already declares contract tokens (and pulls a sibling `tokens.css` from GitHub repositories).
  - An existing custom system without one shows an "approximated from DESIGN.md" notice with a **Generate tokens.css** action. That action opens a prefilled chat request, and the model writes the file.
- A `OpenDesign: Preview Design System` command for keyboard users.

## Capabilities

### New Capabilities
- `design-system-preview`: the Design Systems tree view, the two-tab preview panel, token resolution for previews, the tokens.css vendoring and override overlay, and the Generate tokens.css action.

### Modified Capabilities
- `open-design-tools`: **Custom Design Systems (Model-Authored)**: the create tool's instructions now cover a contract-conforming `tokens.css` next to DESIGN.md, and the tool can compose tokens-only instructions for an existing custom system. **Custom Design Systems (Deterministic Import)**: the import also writes `tokens.css` when the source declares contract tokens verbatim, and GitHub imports pick up a sibling `tokens.css`.

## Impact

- **Content** (`packages/content`): `sync-open-design-content.mjs` copies `tokens.css`. The overlay (`apply-local-overlay.mjs`, `local/`) supports `design-systems/<id>/tokens.override.css`. The drift check covers both. There are 8 override files.
- **Core** (`packages/core`):
  - newly vendored, pure modules: token schema, DESIGN.md parser, kit template, Showcase generator (small documented deviation: accepts resolved tokens)
  - new token resolver
  - Visualize and DESIGN.md/tokens.css panel renderers
  - `ContentIndex` exposes each system's `tokens.css` and override
  - custom-system instruction and import changes
- **VS Code** (`packages/vscode`): tree provider, preview panel and webview entry, new commands, `package.json` contributions, import command change, create tool input (`existingDesignSystemId`).
- **Docs**: design-systems guide, tools and commands reference (enforced by `scripts/check-docs.mjs`).
- **Not changed**: `prepare_open_design_brief` still feeds the model DESIGN.md only. Tokens are used for human previews in this change. No new runtime dependencies, no daemon, no MCP, no network in the preview.
