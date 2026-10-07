## Context

The artifact preview (`artifactEditorProvider.ts` and `webview/dom/*`) renders the artifact in an iframe, supports comments and WYSIWYG edits, and writes full-source patches through `applyPatch` (a `WorkspaceEdit`, so undo works). Design-system artifacts declare token-contract variables on `:root` (`TOKEN_SCHEMA`: `--bg`, `--fg`, `--accent`, fonts, radii…). Core already depends on cheerio and postcss.

## Goals / Non-Goals

**Goals:** adjusting tokens instantly without the agent; precise, minimal source edits; variants without overwriting; a handoff to the agent when tokens aren't enough.

**Non-Goals:**
- Tweaking arbitrary per-element CSS (that's WYSIWYG's job).
- Tweaks in MCP or CLI hosts.
- Animation or motion knobs.
- Shipping a panel inside the artifact (the `tweaks` template does that).

## Decisions

### D1. Host-side, in-place value rewriting
The webview only previews: it calls `document.documentElement.style.setProperty` in the iframe. Apply sends `{ values }` to the host. `tweaks.ts` then finds the `:root` rules in the source's `<style>` blocks with postcss and replaces only the matching declaration values, keeping formatting, comments and order. The result goes through `applyPatch`.
*Alternative:* the webview serializes the DOM, as WYSIWYG does. That reformats the file and loses the authoring structure.

### D2. Knob discovery in three tiers
1. Contract tokens, labelled and typed from `TOKEN_SCHEMA`.
2. Entries in the declaration block, which can override labels and ranges, and group knobs.
3. Other `:root` variables whose values parse as a color, a length or a number, shown collapsed under "More".

Variables defined with `var(...)` show their resolved value and are edited at their source variable.

### D3. Ranges default around the current value
Lengths get 0.5×–2× of the current value, rounded to px or rem steps. Unitless scales get 0.8–1.6. Colors get a picker plus the design system's palette swatches. The declaration block can set explicit ranges and option lists.

### D4. Variants are registered siblings
"Save as variant" copies the entry file with the new values, registers it with the original's collection (it creates one if needed, `screenRole: "variant"`), and opens it. The exploration preview's Prev/Next navigation then works across the variants.

### D5. Apply to design system: custom systems only, with confirmation
Bundled systems are vendored and read-only. For a custom system (`user:*`), the host shows a modal confirmation and then rewrites the matching declarations in its `tokens.css` with the same in-place rewriter.

## Risks / Trade-offs

- [Artifacts that hard-code values instead of using tokens get few knobs] → the panel says "This design uses few variables. Ask the agent to tokenize it." with a send-to-chat button.
- [`:root` declared in several `<style>` blocks or media queries] → only base (non-media) `:root` rules are edited. Dark-mode overrides are shown read-only with a note.

## Migration Plan

Additive UI. Rollback: hide the panel.

## Open Questions

- Should knobs also appear for `[data-theme="dark"]` overrides (a light/dark toggle in the panel)? A likely follow-up.
