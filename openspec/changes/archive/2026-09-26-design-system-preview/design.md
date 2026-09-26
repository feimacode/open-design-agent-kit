## Context

### Upstream
- The preview modal (`apps/web/src/components/DesignSystemPreviewModal.tsx`) has three tabs (Visualize, Showcase, Tokens) plus a DESIGN.md side panel.
- **The packaged `system/kit.html` / `kit.dark.html` are not hand-made.** `scripts/generate-design-system-system-assets.ts` renders them from one ~100-line template (`renderKitHtml(manifest, tokens, mode)`) fed by each system's `tokens.css` (+ `design-tokens.json`). Dark mode keeps the accent and swaps neutrals to fixed dark values.
- **`tokens.css` is the canonical token source.** It follows a formal contract, `packages/contracts/src/design-systems/token-schema.ts` (287 lines, no imports). The contract has four layers:
  - A1-identity: `--bg --surface --fg --muted --border --accent --font-display --font-body`, …
  - A1-structure: type scale, container, section spacing
  - A2: required, with schema fallbacks mirrored in `_schema/defaults.css`
  - B-slot: aliasable richer tiers such as `--fg-2 → var(--fg)`
  
  `_schema/AGENTS.md`: every bundled system ships `tokens.css`, and DESIGN.md-only discovery is "solely a compatibility path for older or user-installed folders".
- `renderDesignSystemShowcase(id, designMd)` (`apps/daemon/src/design-systems/showcase.ts`, no imports) builds a rich product page but picks its colours heuristically from DESIGN.md prose. `parseDesignMd` (`apps/web/src/runtime/design-md-parse.ts`, no imports) extracts identity, palette, typography, voice, imagery and layout.

### Measured (spike over all 152 bundled systems, heuristic pick vs curated `tokens.css`)
- accent 50/143 match, background 50/151, text 51/148, radius 1/152
- Errors run both ways (Airbnb heuristic → maroon instead of Rausch red; Ant's `tokens.css` accent is red, its brand is blue). DESIGN.md heuristics are therefore unfit as the primary token source.
- **8 systems** (`application`, `bento`, `contemporary`, `corporate`, `flat`, `perspective`, `professional`, `simple`) have the placeholder `--accent: #2563eb` in `tokens.css`, while their DESIGN.md states an explicit different `**Primary:**` hex (e.g. Application: `#9333EA`).

### This extension
- The content sync vendors only `DESIGN.md` + `manifest.json` per system.
- Custom `user:*` systems are DESIGN.md-only folders under `<workspace>/<outputDirectory>/design-systems/`. They are written by the model (`create_open_design_design_system` instructions) or by the deterministic `Import Design System` command (`buildDesignSystemMarkdown`).
- The content overlay (`packages/content/local/`, `apply-local-overlay.mjs`) layers extension-owned content onto the vendored tree and **never shadows upstream files** (a collision fails loudly).
- Webview precedent: `ExamplePreviewProvider` is a singleton panel with a `ready` handshake, posted HTML strings, `srcdoc` iframe, nonce CSP and shared `openDesignTheme.ts` styling.

## Goals / Non-Goals

**Goals:**
- See any design system before committing to it, with built-in and custom systems rendered at the same quality by the same pipeline.
- Make `tokens.css` a first-class part of custom design systems, following upstream's contract.
- Fewer, non-overlapping preview tabs.
- A persistent sidebar list of design systems.
- Fully offline and in-process.

**Non-Goals:**
- Feeding tokens to the model (`prepare_open_design_brief` stays DESIGN.md-only). Human-facing only for now.
- Porting upstream's React `DesignKitView`, brand.json/logo/imagery-sample/asset modules, or edit/upload affordances.
- Upstream's Tokens tab (`preview.ts`). It overlaps Visualize and the side panel.
- Vendoring `kit.html`, `components.html`, `design-tokens.json`, `tailwind-v4.css`, `system/artifacts/*`, `preview/*`.
- Validating custom `tokens.css` against the full contract (a guard/linter). Missing tokens are filled by resolution, not rejected.
- Share/export/fullscreen from upstream's modal.

## Decisions

### 1. Two tabs + source side panel
**Visualize** (default) answers "what is this system". **Showcase** answers "what does it look like in use".

```
┌ header: name · summary/category · [active] · Set as active · Use in chat ┐
├ [Visualize] [Showcase]                           ┌ side panel (toggle) ──┤
│ Visualize: identity · typography · palette ·     │ [DESIGN.md|tokens.css]│
│   voice · imagery & layout · component kit       │ syntax-coloured,      │
│   (Light/Dark toggle)                            │ escaped source        │
│ Showcase: product page                           │                       │
└──────────────────────────────────────────────────┴───────────────────────┘
```

- The component kit lives in Visualize, not Showcase. The Showcase product page already exercises the same components, so this avoids showing the kit twice (upstream embeds it in both places).
- *Alternative*: keep upstream's three tabs. Rejected at the user's request. The Tokens tab duplicated palette/typography, and its prose rendering duplicated the side panel.

### 2. One token pipeline: `resolveDesignSystemTokens()`
A pure core function:

```
resolveDesignSystemTokens({ tokensCss?, overrideCss?, designMd, schema })
  → { tokens: Map<name, value>, source: 'tokens' | 'approximated', filledFromDesignMd: string[], filledFromDefaults: string[] }
```

Per-token precedence:
1. `overrideCss` (extension overlay, built-in only)
2. `tokensCss`
3. DESIGN.md heuristics, **A1-identity colours and fonts only**, via `parseDesignMd` + the vendored Showcase colour pickers
4. schema A2 fallbacks
5. B-slot aliases resolved to their sibling

`source` is `approximated` when no `tokensCss` exists. The UI shows this as a notice.

- Every renderer consumes only the resolved map. Built-in and custom systems therefore differ only in where `tokens.css` came from, never in rendering.
- *Alternative*: DESIGN.md-first. Rejected by the measurement above.
- *Alternative*: vendor upstream's pre-rendered `kit.html`. Rejected: 2× the bytes of `tokens.css`, frozen with upstream's placeholder-accent bugs, and not reproducible for custom systems.

### 3. Vendor near-verbatim into `packages/core/src/vendored/`
| Upstream | Local | Deviation |
|---|---|---|
| `packages/contracts/src/design-systems/token-schema.ts` | `designTokenSchema.ts` | none |
| `apps/web/src/runtime/design-md-parse.ts` | `designMdParse.ts` | none |
| `scripts/generate-design-system-system-assets.ts` (`renderKitHtml`, `baseStyle`, token helpers only) | `designSystemKit.ts` | extracted from a CLI script into pure exports; takes a token map + identity instead of reading files |
| `apps/daemon/src/design-systems/showcase.ts` | `designSystemShowcase.ts` | adds an optional `resolvedTokens` argument. When given, it overrides the heuristic bg/fg/accent/muted/border/surface/font picks; the heuristics remain as fallback |

Provenance and the deviations go in `vendored/SOURCE.md` (Apache-2.0 attribution), following the `artifactManifest.ts` precedent.

### 4. Content: vendor `tokens.css`; additive overrides for upstream data bugs
- `copyDesignSystems()` also copies `tokens.css` (0.93 MB total).
- The overlay gains `local/design-systems/<id>/tokens.override.css`: a `:root { … }` fragment copied beside the vendored `tokens.css`. The override is **additive**: the resolver applies it after `tokens.css`, and the upstream file is never modified or shadowed, consistent with the overlay's no-shadowing rule. The overlay fails loudly if `<id>` doesn't exist upstream.
- Ship 8 overrides (the placeholder-accent systems listed above), each setting `--accent` (and `--meta`, which mirrors it in these files) to the DESIGN.md-stated primary. Record them in `local/README.md` and report them upstream. Once upstream fixes them, the drift check flags an override that equals the upstream value, so it can be deleted.

### 5. Custom systems produce `tokens.css`
- **Model-authored** (`composeCustomDesignSystemInstructions`): the instructions add a second file, `<dir>/tokens.css`. They give a compact rendering of the contract generated from the vendored schema, so it can't drift: A1-identity and A1-structure names with descriptions are required, and A2/B-slot names are optional (with the note that omitted ones fall back to schema defaults). The model is told to keep hexes consistent with DESIGN.md.
- **Tokens-only mode**: new optional `existingDesignSystemId` input on `create_open_design_design_system`. It returns instructions to write only `tokens.css` for that existing custom system, including its current DESIGN.md as the source of truth. The **Generate tokens.css** action (preview notice + tree context menu) opens a prefilled, unsent chat message that invokes this. The model does the authoring, using native mechanisms only.
- **Deterministic import** (`buildDesignSystemTokensCss`, new, pure): writes `tokens.css` only from tokens it can take **verbatim**:
  - (a) the source is CSS declaring any contract token names (`--bg`, `--accent`, …): copy those declarations as-is
  - (b) the source is a GitHub repo with a root `tokens.css` next to `DESIGN.md`: fetch and use it verbatim
  
  It does not map ranked hex tallies to roles. That would be guessing, and the import's whole promise is never to invent. When nothing verbatim exists, no `tokens.css` is written and the preview shows the approximated notice with Generate tokens.css.
- *Alternative*: have the extension derive `tokens.css` from DESIGN.md heuristically. Rejected: ~⅓ accuracy, and it would silently freeze wrong values into a file the user trusts.

### 6. Preview panel
`DesignSystemPreviewProvider` follows `ExamplePreviewProvider`:
- one reusable panel (`openDesign.designSystemPreview`)
- `ready` handshake
- all HTML built in the host and posted as strings
- new webview entry `src/webview/designSystem/main.ts`

Details:
- Tab content renders in `srcdoc` iframes with `sandbox=""` (no scripts). The embedded kit inside Visualize is a nested `srcdoc` iframe, also `sandbox=""`.
- Tab HTML is generated lazily on first view and memoized per `(id, tab, mode, contentVersion)`. `contentVersion` bumps when the watcher sees the system's DESIGN.md or tokens.css change, so an open preview of a custom system updates live while the model writes `tokens.css`.
- The side panel (`renderSourceView(text, 'markdown' | 'css')`) escapes all text and adds class-tagged spans. The Markdown classifier is ported from upstream `DesignSpecView`, and a small CSS classifier handles `--name: value` lines. It is injected as trusted markup, not an iframe, because everything is escaped.
- Header actions reuse `setActiveDesignSystemId` and the Browse command's chat-prefill text (extracted into a shared helper), and the header updates via `onActiveDesignSystemChanged`.

### 7. Visualize content sources
- **Identity**: manifest name/category/description, else DESIGN.md heading/blockquote.
- **Typography**: `--font-display/--font-body/--font-mono` from resolved tokens, with weights from DESIGN.md when stated. Specimens use the family names only; fonts not installed fall back to their stack, since there's no network font loading.
- **Palette**: resolved colour tokens (A1-identity + status colours) labelled with schema descriptions, followed by any additional named colours `parseDesignMd` finds that aren't among them.
- **Voice / imagery / layout**: `parseDesignMd` prose fields. Spacing/radius/elevation come from resolved tokens.
- **Kit**: `renderKitHtml(identity, tokens, mode)`.

Empty modules are omitted.

### 8. Tree view
- `openDesign.designSystemsView`, after Gallery.
- Categories, with a synthetic "Custom" first (custom systems have no category).
- Item: `check` icon when active. Description `active` / `custom` / `no tokens` (custom without `tokens.css`).
- **Click opens the preview.** This differs deliberately from Gallery's click-to-chat: preview has no side effects, while set-active-on-click would be a surprising persistent change.
- Inline actions: Use in chat, Set as active (hidden when active), Preview. The context menu adds Generate tokens.css for `user:*` items.
- Title actions: Import, Refresh.
- Refresh on: a watcher for `<outputDir>/design-systems/*/{DESIGN.md,tokens.css}`, `onActiveDesignSystemChanged`, and `openDesign.refreshDesignSystems`.
- Also `OpenDesign: Preview Design System` (optional id; otherwise the Browse picker's grouped items → preview).

## Risks / Trade-offs

- **[The model writes a partial or off-contract `tokens.css`]** → Resolution fills gaps from defaults and aliases, and the side panel shows exactly what was written. A contract linter is a possible follow-up (non-goal here).
- **[The upstream kit template is plain]** → It is exactly what upstream shows for built-in systems today, so parity is the goal. It's owned locally now, so it can be enriched later for all systems at once.
- **[Local change to the vendored Showcase generator complicates re-syncs]** → The change is one optional parameter, applied at a single point where colours are picked, and documented in `SOURCE.md`.
- **[Override files go stale when upstream fixes the data]** → The drift check reports overrides equal to upstream values.
- **[Fonts named in tokens aren't installed]** → Specimens and kit fall back through the declared stack. Acceptable offline behaviour, and upstream behaves the same without its font files.
- **[Gallery and Design Systems trees click differently]** → Documented. "Use in chat" is an inline action on both.

## Open Questions

- Should tokens later feed `prepare_open_design_brief` (e.g. paste the resolved `:root` block into briefs)? Deferred; the resolver lives in core so this stays cheap.
