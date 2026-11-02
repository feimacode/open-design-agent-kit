## 1. Scan

- [ ] 1.1 `appScan.ts`: framework and styling, tokens with source file and line (Tailwind theme, CSS variables incl. `[data-theme]`, MUI and shadcn theme files), bounded reads, `.env*` excluded; tests on fixture apps (Next.js + Tailwind, Vite + MUI, Expo + NativeWind)
- [ ] 1.2 Component inventory (exported components, prop unions, stories) and file routes (Next.js, React Router, Expo Router); cap and ranking by import count
- [ ] 1.3 `scan_open_design_app` MCP and VS Code tool, read-only annotations; not on the hosted gateway

## 2. App design system

- [ ] 2.1 `appDesignSystem.ts`: DESIGN.md, tokens.css and `components.json` from the profile; source kind `app` in reconcile; re-scan diff
- [ ] 2.2 Component vocabulary section and `data-od-component` rule in `composeInstructions.ts`
- [ ] 2.3 `baseScreen` on `prepare_open_design_brief` (image path or URL, captured to `.open-design/.bases/`); base beside new on the review sheet

## 3. Check and promote

- [ ] 3.1 `token-undefined` and `token-hardcoded` findings for designs on an app design system
- [ ] 3.2 Promote and component sets reuse marked components; `new:` marks become proposed components

## 4. Docs

- [ ] 4.1 `docs/guides/design-from-your-app.md`, `design-systems.md`, `promote-to-app-code.md`, `reference/tools.md`; skill copies
