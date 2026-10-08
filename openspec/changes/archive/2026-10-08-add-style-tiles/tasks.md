## 1. Skill

- [x] 1.1 `local/skills/style-tile/SKILL.md` (sections, token contract, divergence rules) with an example tile whose `:root` covers every required token
- [x] 1.2 Color + type surface → `ready` with `style-tile`; regenerate host content

## 2. Core

- [x] 2.1 Tile mode in exploration planning: default count 4, range 2–6, divergence guidance, side-by-side contact sheet layout; tests
- [x] 2.2 Lossless save: postcss extraction of the sketch's `:root`, validation against `TOKEN_SCHEMA`, exact `tokens.css` in the instructions, missing-token report; tests
- [x] 2.3 `token-missing` check in `checkArtifact` for style-tile artifacts (manifest `sourceSkillId`); browser test
- [x] 2.4 Custom-axis evolve mode: active tokens as the base, changed-token marking guidance; tests

## 3. Instructions and docs

- [x] 3.1 Instructions: palette/pairing requests → style-tile exploration; "use this one" → save-design-system
- [x] 3.2 Guide "Pick a color and type pairing" (or a section in design-systems.md); reference; docs check
- [ ] 3.3 Manual: four fintech tiles → pick one → generate a landing page with the saved system, in VS Code and Claude Code
