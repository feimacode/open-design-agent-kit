## Why

"Color + type pairing" is a Claude Design surface, and it's where a brand starts: before anyone builds a page, they want to see a palette and a type pairing together and pick one. We already have most of the machinery. Visual explorations generate deliberately different directions, and `choose_open_design_direction` with `next: "save-design-system"` turns a chosen sketch into a custom design system by reading its `:root` custom properties. But the sketches are whole pages, which is slow to generate and makes a pairing hard to judge. And nothing guarantees that a sketch's custom properties use the design-token contract names, so saving can lose information. The catalog's color and theme skills (`color-expert`, `theme-factory`) are catalog stubs.

## What Changes

- **New local skill `style-tile`** (`od:design-system:style-tile`), a single compact artifact showing one visual direction:
  - palette swatches with their token role and hex value, plus the contrast ratio of each text-on-background pair;
  - a type specimen: the display and body faces, the scale from h1 down to caption, and a paragraph in context;
  - core components (a primary and a secondary button, an input, a card, a tag);
  - a short mood line and a radius/spacing/shadow sample.
- **The tile's `:root` must declare the design-token contract variables** (`--bg`, `--surface`, `--fg`, `--muted`, `--border`, `--accent`, `--accent-on` and the rest of the required identity tokens, plus font and radius tokens), so saving it is lossless.
- **`prepare_open_design_exploration` with the style-tile skill** produces tiles instead of page sketches:
  - the default axis is `visual`;
  - the default count is 4 (2–6 allowed for this skill, versus 2–4 for others);
  - the contact sheet lays the tiles out side by side.
- **Saving a chosen tile:** `choose_open_design_direction` with `next: "save-design-system"` on a style-tile exploration copies the tile's `:root` values straight into `tokens.css` and checks them against the token contract. It reports any required token that's missing and doesn't make the agent re-derive the values from prose.
- **"Evolve my current design system":** a style-tile exploration with the `custom` axis and an active design system starts every tile from that system's tokens and varies only what the user asked for (for example "warmer accent" or "a serif display face").
- **The Color + type surface** becomes `ready` and points at `style-tile`.

## Capabilities

### New Capabilities
- `style-tiles`: the style-tile skill and its token contract, tile-mode explorations, lossless saving, and evolving an active system.

### Modified Capabilities
<!-- None: exploration and choosing requirements are unchanged for other skills; tile behavior is specified in style-tiles. -->

## Impact

- `packages/content/local/skills/style-tile/` with an example.
- `packages/core/src/generation/explorationTools.ts` / `explorationPlan.ts`: tile mode (count range, contact-sheet layout), and the lossless save path using `designSystemTokens.ts` and `TOKEN_SCHEMA`.
- Instructions, and the Color + type surface. No new dependencies.
