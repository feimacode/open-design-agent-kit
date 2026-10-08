## Why

Often a generated design is right except for the last 20%: the accent is a little loud, the type a step too big, the spacing too tight. Today the only way to adjust that is another chat round-trip, or hand-editing CSS. Claude Design offers live tweak controls. The vendored `tweaks` template does too, but it builds the panel into the artifact itself (it persists to localStorage and ships to viewers), which pollutes the deliverable. In VS Code we already have a live preview with WYSIWYG editing that writes back to the file (`apply-patch`), and every design-system artifact styles itself through a known token contract. That's enough to add native tweak controls in the preview that edit the source, without touching the artifact's markup.

## What Changes

- **A Tweaks panel in the VS Code artifact preview** lists the artifact's tweakable custom properties. Each one gets a control matching its type:
  - colors: swatch plus picker;
  - lengths: slider and number;
  - font families: a list drawn from the design system's fonts and the faces already loaded;
  - unitless numbers (scales, line heights): a slider.
- Changes apply instantly in the preview iframe, without reloading.
- **Where knobs come from:**
  1. Design-token contract variables declared on `:root` are typed and labelled from the vendored token schema.
  2. An optional `<script type="application/od-tweaks+json">` block in the artifact can add variables, label them, group them, and set ranges or option lists.
  3. Other `:root` variables are offered under "More" when their type can be inferred.
- **Write back:**
  - **Apply** writes the chosen values into the artifact's `:root` declarations, editing only those values in the source, through the same workspace edit as WYSIWYG editing (so it's undoable).
  - **Reset** restores the file's values.
  - **Save as variant** writes a copy (`<name>-<label>.html`), registers it in the same collection, and leaves the original untouched.
- **Ask the agent:** "Send to chat" hands the current tweak values to chat as a change request ("set `--accent` to #E4572E and the type scale to 1.2"), for changes that should spread beyond token values.
- **Design-system awareness:** when the artifact uses the active design system, a note says that applying edits only this artifact, and offers "Apply to design system" for token-contract variables. That writes the custom design system's `tokens.css` (for custom systems only; bundled systems are read-only) and asks before doing so.
- The `tweaks` design template stays in the catalog for its own use case: an artifact whose viewers should be able to play with it.

## Capabilities

### New Capabilities
- `preview-tweaks`: knob discovery and typing, the declaration block, live application, apply/reset/variant write-back, send-to-chat, and apply-to-design-system.

### Modified Capabilities
<!-- None: the WYSIWYG and comment requirements are unchanged; tweaks are an additional preview panel. -->

## Impact

- `packages/core`: `generation/tweaks.ts`, a pure module that extracts `:root` variables from HTML (cheerio + postcss), types them through `TOKEN_SCHEMA`, and rewrites their values in place. The VS Code host and tests use it.
- `packages/vscode`: a preview webview panel (UI plus a live `style.setProperty` on the iframe's root), new message types (`tweaks-apply`, `tweaks-variant`, `tweaks-to-chat`, `tweaks-apply-ds`) in `artifactEditorProvider.ts`.
- VS Code only, like comments and WYSIWYG editing. No new dependencies.
