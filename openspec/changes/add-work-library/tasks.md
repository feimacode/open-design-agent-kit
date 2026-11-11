## 1. Library

- [ ] 1.1 `portfolio/library.ts`: schema for `library.json` and `project.json`, read/write, reserved `portfolio/` folder, privacy order and the asset-not-looser rule
- [ ] 1.2 Completeness report per project (missing role, dates, problem, decisions, outcomes, alt text)
- [ ] 1.3 Redaction boxes stored per asset and applied by a shared render helper

## 2. Import

- [ ] 2.1 `import_open_design_work` with file, Figma, URL and design sources
- [ ] 2.2 EXIF and location stripping, resize, WebP variants (800/1400/2800) and the kept original; narrow-image flag
- [ ] 2.3 Alt text drafts, marked as drafts until confirmed through `save_open_design_project`

## 3. Tools and guidance

- [ ] 3.1 `save_open_design_project` and `get_open_design_library` in MCP and VS Code; `write_open_design_file` refuses `portfolio/`
- [ ] 3.2 Hosted gateway: hide URL capture, Figma through the connector only
- [ ] 3.3 Brief guidance: ask for missing facts, never invent them; outcome sources shown as written, "about", or without a number
- [ ] 3.4 Library style: name a design system; recipes offer extraction from the designer's site, Figma, Canva or screenshots

## 4. Docs and tests

- [ ] 4.1 `guides/portfolio.md` (library), `reference/tools.md`, CHANGELOG
- [ ] 4.2 Unit tests (schema, privacy, variants, EXIF) and a three-project eval fixture
