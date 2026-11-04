## 1. Page preparation

- [x] 1.1 Overlay marker list (consent managers, chat launchers, promo bars, 30% coverage rule); hide by injected style; record hidden selectors; exclude from scoring
- [x] 1.2 Scroll pass (12 steps or 8 s), animations and transitions off for measurement, full-page screenshot capped at 6,000 px

## 2. Measurement

- [x] 2.1 Measure at 390 px; gutters and section padding at both widths
- [x] 2.2 Forced `:focus-visible` for `--focus-ring`; status colours from alerts, badges, toasts and `[aria-invalid]`; `--fg-2`, `--meta`, `--border-soft`, `--elev-ring`
- [x] 2.3 Gradient and media backgrounds on primary control, hero and main surface
- [x] 2.4 Every page measured fully, dark theme per page

## 3. Draft

- [x] 3.1 Radius mapping per the contract; update unit tests; CHANGELOG note on swapped radii in older extractions
- [x] 3.2 Structure tokens, new roles, declared-property matching (value, then name), `conflicts`; `evidence.json` version 2
- [x] 3.3 Browser fixtures: consent banner, scroll reveal, gradient button, two pages with different accents

## 4. Skill and docs

- [x] 4.1 `design-system-from-url.md`: conflicts, gradient notes, hidden overlays; regenerate skill copies
- [x] 4.2 `docs/guides/design-systems.md`, `docs/reference/tools.md`
