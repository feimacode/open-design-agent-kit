## 1. Formats

- [x] 1.1 Where Impeccable keeps `PRODUCT.md` and `DESIGN.md` and how `DESIGN.md` is shaped (from impeccable.style/docs/context and the repo's own DESIGN.md, 2026-10-31: root, then `.agents/context/`, then `docs/`; YAML front matter `name`/`description`/`colors`/`typography`/`rounded`/`spacing`/`components` that the detector checks; numbered prose sections)
- [x] 1.2 Our design systems' `DESIGN.md` has no front matter, so the writer adds front matter from resolved tokens instead of a heading map (running `/impeccable audit` against it is part of 5.1)

## 2. Read

- [x] 2.1 Brief: "Product context" from root `PRODUCT.md`, capped at about 1,500 characters; unit tests (missing, short, long)
- [x] 2.2 Brief: notice when root `DESIGN.md` exists and no design system is active; unit test
- [x] 2.3 Overview skill: offer to make the root `DESIGN.md` the active design system through `create_open_design_design_system`

## 3. Write

- [x] 3.1 `set_active_design_system` `writeProjectDesignMd`: exclusive create of the reconciled `DESIGN.md`; returns `written` or `kept-existing`; unit tests
- [x] 3.2 Overview skill: offer it once in code projects

## 4. Handoff and docs

- [x] 4.1 Overview skill: after `port_open_design_artifact_to_app`, if `impeccable` is in the agent's skills, suggest `/impeccable polish` or `/impeccable audit` on the ported component
- [x] 4.2 Regenerate skill copies; drift checks pass
- [x] 4.3 `docs/guides/impeccable.md`; link from `docs/guides/design-systems.md`

## 5. Verification

- [ ] 5.1 Claude Code with both installed: brief picks up `PRODUCT.md`; root `DESIGN.md` written once and kept on a second ask; handoff line appears after porting
