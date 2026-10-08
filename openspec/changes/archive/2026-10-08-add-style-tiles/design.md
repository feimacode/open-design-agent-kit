## Context

`explorationTools.ts` already plans `visual`, `structure` and `custom` axes, writes sketches, compares them on a contact sheet, and on `save-design-system` returns instructions that ask the agent to read the chosen sketch's `:root` and write `DESIGN.md` plus `tokens.css`. `TOKEN_SCHEMA` (vendored) defines the token contract, and `designSystemTokens.ts` resolves and validates tokens for previews.

## Goals / Non-Goals

**Goals:** fast, comparable pairing options; a chosen tile becomes the active design system with no loss; evolving an existing system as well as inventing one.

**Non-Goals:**
- Color-science tooling (palette generation algorithms, APCA).
- Font licensing checks beyond preferring Google Fonts.
- Logo generation.

## Decisions

### D1. A skill plus exploration mode, not a new tool
The exploration flow already does planning, divergence, comparison and choosing. A tile is just a different sketch shape, selected by `skillId`. *Alternative:* `prepare_open_design_style_tiles`, which would duplicate the exploration machinery.

### D2. Tokens are the tile's contract
The skill requires the tile's `:root` to define every A1 token (`TOKEN_SCHEMA` layers `A1-identity` and `A1-structure`) and to style the tile only through them. The visual check can verify this (see D4). Saving then reads values instead of interpreting a design.

### D3. Lossless save path
For a style-tile direction, `save-design-system` extracts the `:root` declarations from the sketch file in core (postcss, already a dependency), validates them against `TOKEN_SCHEMA` (missing A1 tokens are reported), and writes them into the instructions as the exact `tokens.css` body. The agent still writes `DESIGN.md` prose and registers the system, as today.

### D4. Token completeness as a check
`check_open_design_artifact` on a style-tile artifact reports `token-missing` (error) for each required token not declared on `:root`, so the tile is fixed before anyone picks it.

### D5. Evolving uses the custom axis
With an active design system and `axis: "custom"`, each direction's instructions include the current tokens as the starting point and the user's requested change as the only variable. The tile's swatches mark the tokens that changed.

## Risks / Trade-offs

- [Tiles look too alike when only the accent changes] → the divergence guidance for tile mode requires each tile to differ in at least two of: accent hue family, neutral temperature, display face classification (serif, sans, mono, display), radius scale.
- [Google Fonts availability offline] → the check's existing `broken-asset` and font-readiness warnings apply.

## Migration Plan

Additive. Existing explorations are unchanged.

## Open Questions

- Should a chosen tile also generate a one-page brand sheet (the design-system Visualize view as an exportable artifact)? Likely a small follow-up, since `designSystemVisualize.ts` already renders it.
