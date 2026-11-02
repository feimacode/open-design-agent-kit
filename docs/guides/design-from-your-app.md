# Design from your app

When the workspace has an app already, designs for it should use its colours, type and spacing and be built from its own components, so promoting a design is reuse, not translation. Open Design reads the app once, saves what it found as a design system, and builds from it.

## Before you start

- A JavaScript or TypeScript app in the workspace (React, Next.js, Vite, Expo; Tailwind, MUI, shadcn/ui, NativeWind or plain CSS variables). In a monorepo, name the app's folder.
- Nothing in the app is changed. The scan reads style, component and route files only, at most 2,000 files and 1 MB, and never opens `.env` files.

## Steps

1. Ask:

   > Scan our app so designs match it.

2. The agent calls [`scan_open_design_app`](../reference/tools.md#scan_open_design_app) and tells you what it found: the framework and styling, the tokens (each with the file and line it comes from), the light and dark themes, the components most used across the app with their variants, and the app's screens.
3. **You agree to save it.** The agent scans again with a name and writes a design system to `.open-design/design-systems/<name>/`: `DESIGN.md`, `tokens.css` (the app's own values, each with its source) and `components.json` (the component vocabulary). It makes it the active design system.
4. Ask for a screen or a flow as usual ([App screens and flows](app-screens.md)). The brief lists up to 60 of your components with their variants, and the agent builds each part from one of them, marking it `data-od-component="Button"`. A part with no match is marked `new:Stepper`, and the reply lists it as a proposed component.
5. The check reports a colour or radius pasted in that one of your tokens already has (`token-hardcoded`, naming the token and its file and line) and a `var(--x)` defined nowhere (`token-undefined`).

## Redesign a screen you have

> Redesign our settings page at http://localhost:3000/settings: group the notification options.

Give the agent the page's URL (with the app running) or a screenshot. It becomes the **base screen**: captured to `.open-design/.bases/`, given to the agent as the screen to change rather than a style to copy, and shown beside the new design on the check's screenshots. Bases are never published.

## When the app changes

Scan again any time. When a design system was already saved from the same folder, the result lists what changed since: tokens added, removed or changed (old and new value) and components added, removed or with new variants. Ask the agent to update the saved design system to match.

## Promote

When you [promote a design to code](promote-to-app-code.md) or [build a component set](component-library.md) from it, every part marked with one of your components imports that component. New components are written only for `new:` parts and unmarked ones.

## Related

[App screens and flows](app-screens.md) · [Design systems](design-systems.md) · [Promote to app code](promote-to-app-code.md) · [Build a component set](component-library.md)
