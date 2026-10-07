## 1. Core

- [ ] 1.1 `generation/tweaks.ts`: extract base `:root` variables from `<style>` blocks (cheerio + postcss), resolve `var()` chains, type them via `TOKEN_SCHEMA` and value parsing, read the `od-tweaks` declaration block
- [ ] 1.2 In-place value rewriter (only the changed declarations; byte-for-byte elsewhere) for HTML and `tokens.css`; tests with real vendored examples

## 2. VS Code preview

- [ ] 2.1 Tweaks panel UI (typed controls, groups, "More", default ranges), live `setProperty` in the iframe, Reset
- [ ] 2.2 Host messages: `tweaks-apply` (via `applyPatch`), `tweaks-variant` (copy, register in a collection, open), `tweaks-to-chat` (chat prefill), `tweaks-apply-ds` (confirm, custom systems only)
- [ ] 2.3 Few-variables empty state with a "tokenize" send-to-chat

## 3. Docs and verification

- [ ] 3.1 Section in "Preview, comments and edit"; docs check
- [ ] 3.2 Manual: tweak a design-system landing page, apply, undo, save a variant, and apply to a custom design system
