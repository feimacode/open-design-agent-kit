# App screens and flows

Design the screens people use to get something done in your app: a settings page, a customers table, a search screen, a sign-in or onboarding flow. App screens are built for the task, not for a pitch: no hero, real-looking data, one main work area, and every list or form designed empty, loading and with an error as well as filled in.

## Before you start

- An agent with Open Design set up ([Getting started](../getting-started/README.md)).
- If you have an app already, scan it first so the screens use its tokens and components: see [Design from your app](design-from-your-app.md).

## Steps

1. Ask:

   > Design the settings screen for our invoicing app.

   or start from the menu: `/open-design-new` (Copilot: `/open-design-new`) → **Build an app** → **App screens**.
2. The agent asks what it doesn't know yet, at most three questions: what the screen is for, the **platform** (Web app, iPhone, Android, Tablet or Desktop app) and the **density** (Compact, Medium or Airy). The answers become exact numbers in the brief: compact controls are 32 to 36 px high with 13 to 14 px text, airy ones 48 px with 16 px text; iPhone is 390 px wide with 44 px tap targets, Android 412 px with 48 dp targets.
3. The agent picks a pattern (shell, form, table, detail, settings or search), writes the screen and checks it. Data surfaces get their states as frames: `<section data-od-state="default">`, `<section data-od-state="empty" hidden>` and so on.
4. The check renders every state on its own and puts a **states board** with all of them second among its screenshots. It reports a table or form with no empty, loading or error state (`state-missing`), a toggle or tab that does nothing when clicked (`dead-control`), and, with very long names and numbers swapped in, text that spills or is cut with no way to read it (`stress-overflow`, `stress-truncation`). See [the checks](../reference/tools.md#app-screens-flows-and-app-tokens).

> **In the preview:** a states bar above the design switches between its states, and **All states** lays them out side by side. Saving from the preview never writes the bar into your file.

## Device frames

A screen for a phone, tablet or desktop app says so on its `<body>`: `data-od-device="iphone"`, `"android"`, `"tablet"` (with `data-od-orientation="portrait"` or `"landscape"`) or `"desktop-app"` (with `data-od-window="mac"` or `"windows"`). The agent adds it from your platform answer. The kit then draws a plain device frame around the screen everywhere you see it: a status bar, the camera cutout and the home indicator for phones and tablets, a title bar with the app's name and window buttons for a desktop app. The design itself is only the app, so the frame never ends up in your code, and a tab bar fixed to the bottom sits right above the home indicator.

- The previews (browser, VS Code, Claude and ChatGPT) and the clickable prototype show the frame. The bars take the screen's background colour.
- The check renders the screen at the device's screen size (390 × 763 px for iPhone, 412 × 867 for Android, both orientations for a tablet, 1280 × 800 for a desktop app) and warns when the design also draws a status bar or frame of its own (`device-double-frame`).
- PNG and JPEG exports include the frame. Ask for the screen without it (`shell: false`) for app store screenshots or handoff.

Web app screens have no frame; the check adds tablet widths (1024 and 768 px) to the usual three and shows those screenshots only when something is wrong there. Every app screen also gets a **large-text pass**: the text size goes up to 20 px, as with a larger system text setting, and text that no longer fits its box is reported (`large-text-overflow`).

## Linked flows

For several screens that link to each other, ask for the flow:

> Design the sign-in flow for our app: sign in, forgot password, check your email, and the home screen.

The agent plans the flow once before the first screen: the screens, the links between them ("Continue" on welcome opens goals) and, when there is one, the navigation every screen shares (a tab bar or a sidebar). Each screen's brief gets the whole plan and its own links, written as real links (`<a href="goals.html" data-od-goto="goals">`), so you can click through in the preview. The shared navigation is written once, to `_shared/nav.html` in the collection's folder, and each screen includes it with `<template data-od-include="_shared/nav.html"></template>`, so it can't drift from screen to screen. `data-od-current="<screen>"` on a screen's `<body>` marks its tab as the current one.

Five flow packs come ready: **sign-in**, **onboarding**, **paywall**, **settings** and **AI chat**, each with its screens, links and the states each screen needs.

## Check a flow

> Check the onboarding flow.

The agent checks the whole collection at once (`check_open_design_artifact` with `collectionId`): every screen as above, with findings naming their screen, plus the links between them. It reports links to screens that don't exist (`flow-broken-link`), screens with no way on (`flow-dead-end`; a screen where the flow really ends says so with `data-od-end`), planned screens not built yet (`flow-unfilled`), planned links missing (`flow-unlinked`) and a screen with its own navigation instead of the shared one (`flow-nav-drift`).

Sign-up and paywall flows also get **store rules**: a way to delete the account, a paywall with "Restore purchases", the price and period, and Terms and Privacy links, and a reason before any permission request. They are notes, or warnings when your brief says the app ships to the App Store or Google Play.

Each check writes the **flow map**, `flow.html` in the collection's folder: every screen as a live thumbnail, with an arrow for each link, and planned links that aren't built yet drawn dashed in red.

> **In VS Code:** the **Collections** view lists the screens of each collection and **Open flow map in browser**. Clicking a link in the preview opens the screen it goes to.

## Share a clickable prototype

> Export the onboarding flow as a clickable prototype.

You get one HTML file, `exports/<collection>-prototype.html`, with every screen, its styles and images inside it and the shared navigation filled in. Open it in any browser, offline too: links move between the screens, and a small menu in the corner jumps to any screen or back.

> Publish the onboarding flow.

Publishing any screen of a flow publishes the whole flow ([Share and publish](share-and-publish.md)). On Netlify, Vercel, Cloudflare Pages or GitHub Pages, the site holds every screen, with the shared navigation filled in, and the flow map as its home page, so each screen is one click away and links between screens work. As a Claude artifact, which is one page, it is the clickable prototype above.

## What you get

```
.open-design/onboarding/welcome.html            ← a screen (and its .artifact.json)
.open-design/onboarding/goals.html
.open-design/onboarding/_shared/nav.html        ← the shared navigation
.open-design/onboarding/flow.html               ← the flow map, rewritten by each collection check
.open-design/onboarding/exports/onboarding-prototype.html
```

## Related

[Design from your app](design-from-your-app.md) · [Generate a design](generate-a-design.md#collections) · [Promote to app code](promote-to-app-code.md) · [Share and publish](share-and-publish.md)
