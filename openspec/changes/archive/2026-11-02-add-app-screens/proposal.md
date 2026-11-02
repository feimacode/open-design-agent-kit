## Why

The kit can make a good single screen, but it has no place to design an app's interface. The "Prototype" surface lists eight entries, and seven of them are marketing pages (landing, pricing, waitlist, three taste variants, web-prototype); only `dashboard` is an app screen. Its questions ("What is the page for? Sign-ups or a waitlist, selling a product…") assume a marketing page. Upstream skills that do fit app work (`login-flow`, `paywall-upgrade-cro`, `shadcn-ui`, `platform-design`, `apple-hig`) and the `kanban-board` template exist, but no surface or goal routes to them. There are no templates for forms, tables, settings, detail, search or app shells, and nothing makes a whole product flow (sign-in with its reset, verify and error branches) in one ask.

This is the first "Now" item of the UI design use case study (2026-11-02). It draws on XIAS `components/templates.md` and its console examples, OpenPencil's `web-app`, `form-ui` and `dashboard` domain skills (density modes, entity surfaces, data-surface states), and the getdesign.md starter kits, which ship whole flows with every branch and "permission gates designed to pass review".

## What Changes

- **"App screens" surface.** A new ready surface `app-screens` ("Screens people use to get a task done in your app or web product") routing to new local pattern templates and the existing app-fit skills. `dashboard` moves here from Prototype, so Prototype becomes plainly web pages. Questions: which task the screens serve, which platform (web app, iPhone, Android, tablet), and data density (compact, medium, airy).
- **Pattern templates** in `packages/content/local/skills/`: `app-shell` (sidebar or top bar or tab bar shells), `app-form`, `app-table` (list with search, filter, pagination on its own rows), `app-detail`, `app-settings`, `app-search`, each with a seed `template.html` that already has the shell, tokens hooks and state slots.
- **Flow packs.** Templates that make a collection of linked screens in one ask, each with its branches: `flow-sign-in` (sign in, sign up, reset, verify, magic link or code, error), `flow-onboarding` (welcome, goals, permissions, optional paywall), `flow-paywall` (standard, trial, upgrade, restore), `flow-settings` (profile, notifications, billing, delete account), `flow-ai-chat` (empty, streaming, error, result). They use collections today and the flow map once `add-linked-flows` lands.
- **Product UI craft.** A local craft doc `product-ui.md` (one main work area per screen, record surfaces carry name, status, key fields and one action, density modes with exact paddings and control heights, every data surface designed populated plus empty or loading), required by every app-screens entry through `craft-requires.json`.
- **"Build an app" goal** routing to app-screens, mobile and wireframe.
- **Store-rules findings.** For mobile designs in a collection, the check adds `store-rules` findings: no reachable account deletion when the flow has sign-up, a paywall with no restore or terms link, a permission screen with no reason shown before the system prompt. Notes, not errors, and only when the brief says the app ships to a store.

## Capabilities

### New Capabilities
- `app-screens`: the surface, its questions and goal, pattern templates, flow packs, product UI craft and store-rules findings.

### Modified Capabilities
None. `design-surfaces` keeps its catalog requirements; moving `dashboard` and adding a surface and goal are content changes it already allows.

## Impact

- `packages/content/local/surfaces.json`, `craft-requires.json`, new `local/skills/app-*` and `local/skills/flow-*`, `local/craft/product-ui.md`; `scripts/check-content-sync.mjs` passes for the new entries.
- `packages/core/src/export/checkArtifact.ts` (store-rules pass, collection-aware), `composeInstructions.ts` (density and platform answers).
- Skills `open-design-new` and the overview skill list the new surface; docs `docs/guides/app-screens.md` (new), `generate-a-design.md`, `reference/tools.md`.
- Evals: two new briefs in `evals/` (a settings screen, a sign-in flow).
