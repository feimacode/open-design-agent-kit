## 1. Runtime

- [x] 1.1 `generation/diagramRuntime.ts`: the runtime as a string constant (grid placement, gap routing with spreading, arrowheads, labels, groups, sequence mode, re-render on fonts/resize, `window.odDiagram`)
- [x] 1.2 `insertDiagramRuntime`: insert or replace the versioned block, byte-for-byte elsewhere, html-only; unit tests
- [x] 1.3 Browser tests: flow placement, rank-skipping route avoids nodes, backward and same-rank links, groups, sequence mode, unknown-id errors
- [x] 1.4 `add_open_design_diagram_runtime` on VS Code (tool + package.json) and MCP; publish-test tool count

## 2. Renderer and checks

- [x] 2.1 `diagram` renderer in export's and check's renderable sets (html vs svg by extension); export test
- [x] 2.2 Diagram geometry page script (`node-overlap`, `edge-through-node`, `group-overlap`, `diagram-error`) with the ready wait, run by the check; browser tests

## 3. Sources

- [x] 3.1 Hash-only code sources in registration (limits 10 documents / 50 files); `stale-sources` in the check; tests

## 4. Content and instructions

- [x] 4.1 `local/skills/diagram/SKILL.md` (types, repo-grounding workflow, contract, ranks/lanes guidance, styling hooks) plus an example diagram of this repo that passes the check
- [x] 4.2 Instructions on every host: diagrams of code go through the `diagram` skill and the runtime tool; offer a redraw on `stale-sources`; regenerate host content

## 5. Docs and verification

- [x] 5.1 Guide "Diagrams of your code", tools reference; docs check
- [ ] 5.2 Manual: an architecture diagram of this repo's packages and an ERD from a sample schema, in Copilot and Claude Code
