## 1. Library

- [x] 1.1 `portfolio/library.ts`: schema for `library.json` and `project.json`, read/write, reserved `portfolio/` folder, privacy order and the asset-not-looser rule
- [x] 1.2 Completeness report per project (missing role, dates, problem, decisions, outcomes, alt text)
- [x] 1.3 Redaction boxes stored per asset and applied by a shared render helper

## 2. Import

- [x] 2.1 `import_open_design_work` with file, Figma, URL and design sources
- [x] 2.2 EXIF and location stripping, resize, WebP variants (800/1400/2800) and the kept original; narrow-image flag
- [x] 2.3 Alt text drafts, marked as drafts until confirmed through `save_open_design_project`

## 3. Tools and guidance

- [x] 3.1 `save_open_design_project` and `get_open_design_library` in MCP and VS Code; `write_open_design_file` refuses `portfolio/`
- [x] 3.2 Hosted gateway: hide URL capture, Figma through the connector only
- [x] 3.3 Brief guidance: ask for missing facts, never invent them; outcome sources shown as written, "about", or without a number
- [x] 3.4 Library style: name a design system; recipes offer extraction from the designer's site, Figma, Canva or screenshots

## 4. Docs and tests

- [x] 4.1 `guides/portfolio.md` (library), `reference/tools.md`, CHANGELOG
- [x] 4.2 Unit tests (schema, privacy, variants, EXIF) and a three-project eval fixture

## Notes from implementation

- Import takes images (PNG, JPEG, WebP, GIF) and MP4 video. PDF pages are not split into assets; export them as images first.
- GIFs are kept as they are, without WebP copies, so their animation survives. MP4 files are stored without variants and keep their container metadata; the import result warns about it.
- When a redaction changes and no browser is available, the asset is marked `copiesStale` and every output refuses it until its copies are rebuilt.
