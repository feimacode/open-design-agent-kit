# Eval results

One section per run, newest last, appended by `npm run evals` (see [README.md](README.md)). Tick the "must" notes after looking at the contact sheet. Compare a PR's run against the section before it.

## 2026-10-25 — baseline, before add-taste-checks

- Kit: 0.3.0 (claude/project-thread-9q7zoa 9f26cff)
- Mode: agent claude (2.1.310 (Claude Code)), repeat 2, model claude-sonnet-5-5
- Run folder (not committed): `runs/2026-10-25-08-05-40/`
- Contact sheet: [runs/2026-10-25-08-05-40/contact-sheet.png](runs/2026-10-25-08-05-40/contact-sheet.png)

- Designs: 24 from 16 run(s); runs with no design: 0.
- Check errors by repeat: #1 0, #2 0.
- Distinct look signatures: 16 of 24 (read from the HTML; variety memory not recorded).
- Critic: n/a (no critique recorded).
- Agent cost: $6.70.

| Brief | # | Design | Skill | Errors | Error codes | Warnings | Critic | Questions | Assumptions | Tool calls | Time | Signature (accent / display / body / theme) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| analytics-dashboard | 1 | .open-design/analytics-dashboard-for-a-customer-support-team-for-this-wee/support-team-dashboard.html | od:prototype:dashboard | 0 | — | 0 (—) | n/a | 0 | 1 | 11 | 139s | #eab308 / - / - / light |
| analytics-dashboard | 2 | .open-design/support-analytics/support-analytics.html | od:prototype:dashboard | 0 | — | 0 (—) | n/a | 0 | 0 | 15 | 142s | #e0a21f / -apple-system / -apple-system / light |
| card-set | 1 | .open-design/recipe-cards/recipe-cards.html | od:prototype:magazine-poster ⚠ | 0 | — | 0 (—) | n/a | 0 | 0 | 12 | 118s | #b83a26 / Iowan Old Style / Avenir Next / light |
| card-set | 2 | .open-design/a-set-of-12-printable-recipe-cards-for-grandma-s-sunday-dinn/recipe-cards.html | od:prototype:card-set | 0 | — | 0 (—) | n/a | 0 | 0 | 19 | 113s | #a63a28 / Georgia / Georgia / light |
| gig-poster | 1 | .open-design/jazz-night-blue-room/jazz-night-blue-room.html | od:prototype:poster-hero | 0 | — | 0 (—) | n/a | 1 | 0 | 8 | 47s | #e0a93b / Georgia / Georgia / dark |
| gig-poster | 2 | .open-design/jazz-night-blue-room/jazz-night-blue-room.html | od:prototype:poster-hero | 0 | — | 0 (—) | n/a | 2 ⚠ | 0 | 10 | 52s | #1d4fa3 / Georgia / Helvetica Neue / dark |
| pitch-deck | 1 | .open-design/tidepool-seed-pitch-deck/tidepool-seed-pitch-deck.html | od:deck:html-ppt-pitch-deck | 0 | — | 0 (—) | n/a | 0 | 0 | 11 | 77s | #312c85 / Inter / Open Sans / dark |
| pitch-deck | 2 | .open-design/tidepool-seed-pitch-deck/tidepool-seed-pitch-deck.html | od:deck:html-ppt-pitch-deck | 0 | — | 0 (—) | n/a | 0 | 0 | 12 | 81s | #c9822f / Poppins / Poppins / dark |
| saas-landing | 1 | .open-design/ledgerly-landing/ledgerly-landing.html | od:prototype:saas-landing | 0 | — | 5 (overlap×5) | n/a | 0 | 0 | 11 | 97s | #d97706 / Inter / Inter / light |
| saas-landing | 2 | .open-design/ledgerly-landing/ledgerly-landing.html | od:prototype:saas-landing | 0 | — | 0 (—) | n/a | 0 | 0 | 11 | 83s | #eab308 / Inter / Inter / light |
| shop-pack | 1 | .open-design/ember-wick/banner.html | — | 0 | — | 0 (—) | n/a | 4 ⚠ | 0 | 24 | 105s | #b4631b / - / - / - |
| shop-pack | 1 | .open-design/ember-wick/care-card.html | — | 0 | — | 0 (—) | n/a | 4 ⚠ | 0 | 24 | 105s | - / - / - / - |
| shop-pack | 1 | .open-design/ember-wick/collection.html | — | 0 | — | 0 (—) | n/a | 4 ⚠ | 0 | 24 | 105s | - / - / - / - |
| shop-pack | 1 | .open-design/ember-wick/icon.html | — | 0 | — | 0 (—) | n/a | 4 ⚠ | 0 | 24 | 105s | #b4631b / - / - / - |
| shop-pack | 1 | .open-design/ember-wick/launch-post.html | — | 0 | — | 0 (—) | n/a | 4 ⚠ | 0 | 24 | 105s | #b4631b / - / - / - |
| shop-pack | 1 | .open-design/ember-wick/product.html | — | 0 | — | 0 (—) | n/a | 4 ⚠ | 0 | 24 | 105s | - / - / - / - |
| shop-pack | 2 | Open Design/ember-wick-etsy/listing-tiles.html | — | 0 | — | 0 (—) | n/a | 4 ⚠ | 0 | 31 | 151s | #d9822b / Georgia / Georgia / light |
| shop-pack | 2 | Open Design/ember-wick-etsy/master.html | — | 0 | — | 0 (—) | n/a | 4 ⚠ | 0 | 31 | 151s | #d9822b / Georgia / Georgia / light |
| shop-pack | 2 | Open Design/ember-wick-etsy/shop-banner.html | — | 0 | — | 0 (—) | n/a | 4 ⚠ | 0 | 31 | 151s | #d9822b / Georgia / Georgia / light |
| shop-pack | 2 | Open Design/ember-wick-etsy/shop-icon.html | — | 0 | — | 0 (—) | n/a | 4 ⚠ | 0 | 31 | 151s | #d9822b / Georgia / Georgia / light |
| vague-bakery | 1 | .open-design/sourdough-saturdays-poster/sourdough-saturdays-poster.html | od:prototype:poster-hero | 0 | — | 0 (—) | n/a | 1 | 0 | 9 | 57s | #c2531b / Georgia / Georgia / light |
| vague-bakery | 2 | .open-design/sourdough-saturdays-poster/sourdough-saturdays-poster.html | od:prototype:poster-hero | 0 | — | 0 (—) | n/a | 5 ⚠ | 1 | 10 | 63s | #bd5b34 / DM Serif Display / Inter / light |
| vague-launch | 1 | .open-design/fernway-landing/fernway-landing.html | od:prototype:web-prototype | 0 | — | 3 (overlap×3) | n/a | 6 ⚠ | 0 | 13 | 87s | #ff6b00 / Noto Serif Display / Noto Serif Display / light |
| vague-launch | 2 | .open-design/fernway-landing/fernway-landing.html | od:prototype:web-prototype | 0 | — | 4 (overlap×4) | n/a | 6 ⚠ | 0 | 14 | 109s | #ff6b00 / Noto Serif Display / Noto Serif Display / light |

Must notes (ticked by the reviewer from the contact sheet):

- [ ] analytics-dashboard: Has an empty state
- [ ] analytics-dashboard: The overloaded agents stand out without reading every number
- [ ] analytics-dashboard: Sample data is labelled as sample data
- [ ] card-set: Every card has the dish name, ingredients and steps
- [ ] card-set: Text fits on every card at print size
- [ ] card-set: The set looks like one family
- [ ] gig-poster: Date, time and venue readable from 3 m
- [ ] gig-poster: One clear focal image or type
- [ ] gig-poster: Price or how to get in is on it
- [ ] pitch-deck: Problem, solution, market, traction, team and ask each have a slide
- [ ] pitch-deck: No slide has more than about 40 words
- [ ] pitch-deck: Placeholder numbers are marked as placeholders
- [ ] saas-landing: Says what it does and for whom above the fold
- [ ] saas-landing: One primary call to action, repeated at the end
- [ ] saas-landing: Works at phone width without sideways scrolling
- [ ] shop-pack: Shop banner and listing images at Etsy's sizes
- [ ] shop-pack: Shop name readable at thumbnail size
- [ ] shop-pack: Missing product photos are placeholders, not invented products
- [ ] vague-bakery: Asked what to make before building
- [ ] vague-bakery: Asked at most three questions, in one message
- [ ] vague-launch: Asked what is launching and what to make
- [ ] vague-launch: Stated its assumptions once before or after building

## 2026-11-02 — app screens first live run

- Kit: 0.4.0-beta.2 (claude/project-thread-fldkhh 5a2dd5a, local changes)
- Mode: agent claude (2.1.316 (Claude Code)), repeat 1, model claude-sonnet-5-5
- Run folder (not committed): `runs/2026-11-02-21-20-56/`
- Contact sheet: [runs/2026-11-02-21-20-56/contact-sheet.png](runs/2026-11-02-21-20-56/contact-sheet.png)

- Designs: 5 from 2 run(s); runs with no design: 0.
- Check errors by repeat: #1 0.
- Distinct look signatures: 2 of 5.
- Critic: n/a (no critique recorded).
- Agent cost: $1.24.

| Brief | # | Design | Skill | Errors | Error codes | Warnings | Critic | Questions | Assumptions | Tool calls | Time | Signature (accent / display / body / theme) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| settings-screen | 1 | .open-design/notification-settings/notification-settings.html | od:prototype:web-prototype ⚠ | 0 | — | 1 (overlap) | n/a | 0 | 5 | 14 | 122s | #2f6feb / - / - / light |
| sign-in-flow | 1 | .open-design/habit-sign-in-flow/check-email.html | od:prototype:flow-sign-in | 0 | — | 0 (—) | n/a | 0 | 1 | 21 | 182s | - / - / - / - |
| sign-in-flow | 1 | .open-design/habit-sign-in-flow/forgot-password.html | od:prototype:flow-sign-in | 0 | — | 2 (intent×2) | n/a | 0 | 1 | 21 | 182s | - / - / - / - |
| sign-in-flow | 1 | .open-design/habit-sign-in-flow/home.html | od:prototype:flow-sign-in | 0 | — | 4 (stress-overflow×4) | n/a | 0 | 1 | 21 | 182s | - / - / - / - |
| sign-in-flow | 1 | .open-design/habit-sign-in-flow/sign-in.html | od:prototype:flow-sign-in | 0 | — | 0 (—) | n/a | 0 | 4 | 21 | 182s | - / - / - / - |

Must notes (ticked by the reviewer from the contact sheet):

- [ ] settings-screen: No hero, tagline or marketing copy: the first thing is the settings
- [ ] settings-screen: Settings are grouped under short headings, each with a label and a one-line explanation
- [ ] settings-screen: Has a saved, a saving and an error state for the save action
- [ ] sign-in-flow: Four screens in one collection, planned as a flow, that link to each other with real links
- [ ] sign-in-flow: The collection check reports no flow-broken-link or flow-dead-end
- [ ] sign-in-flow: Sign in shows its error state (wrong password) and a way to reset it

## 2026-11-02 — after routing fix

- Kit: 0.4.0-beta.2 (claude/project-thread-fldkhh 5a2dd5a, local changes)
- Mode: agent claude (2.1.316 (Claude Code)), repeat 1, model claude-sonnet-5-5
- Run folder (not committed): `runs/2026-11-02-21-27-38/`
- Contact sheet: [runs/2026-11-02-21-27-38/contact-sheet.png](runs/2026-11-02-21-27-38/contact-sheet.png)

- Designs: 1 from 1 run(s); runs with no design: 0.
- Check errors by repeat: #1 0.
- Distinct look signatures: 1 of 1.
- Critic: n/a (no critique recorded).
- Agent cost: $0.41.

| Brief | # | Design | Skill | Errors | Error codes | Warnings | Critic | Questions | Assumptions | Tool calls | Time | Signature (accent / display / body / theme) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| settings-screen | 1 | .open-design/notification-settings/notification-settings.html | od:prototype:app-settings | 0 | — | 0 (—) | n/a | 0 | 5 | 12 | 110s | #2f6feb / - / - / light |

Must notes (ticked by the reviewer from the contact sheet):

- [ ] settings-screen: No hero, tagline or marketing copy: the first thing is the settings
- [ ] settings-screen: Settings are grouped under short headings, each with a label and a one-line explanation
- [ ] settings-screen: Has a saved, a saving and an error state for the save action

## 2026-11-02 — design from app first live run

- Kit: 0.4.0-beta.2 (claude/project-thread-fldkhh d1e5bd3)
- Mode: agent claude (2.1.316 (Claude Code)), repeat 1, model claude-sonnet-5-5
- Run folder (not committed): `runs/2026-11-02-22-01-24/`
- Contact sheet: [runs/2026-11-02-22-01-24/contact-sheet.png](runs/2026-11-02-22-01-24/contact-sheet.png)

- Designs: 1 from 1 run(s); runs with no design: 0.
- Check errors by repeat: #1 0.
- Distinct look signatures: 1 of 1.
- Critic: n/a (no critique recorded).
- Agent cost: $0.62.

| Brief | # | Design | Skill | Errors | Error codes | Warnings | Critic | Questions | Assumptions | Tool calls | Time | Signature (accent / display / body / theme) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| billing-from-app | 1 | Open Design/billing-settings-screen-for-our-app-current-plan-with-usage-/billing-settings.html | od:prototype:app-settings | 0 | — | 1 (stress-overflow) | n/a | 0 | 3 | 23 | 165s | - / - / - / - |

Must notes (ticked by the reviewer from the contact sheet):

- [ ] billing-from-app: Uses the app's green brand colour and IBM Plex Sans, not the kit's defaults
- [ ] billing-from-app: Parts built from the app's components carry data-od-component marks (Button, Card, Badge, Switch, Input); anything new is marked new:<Name>
- [ ] billing-from-app: No raw hex colours where the app has a token (no token-hardcoded warnings)

## 2026-11-02 — add-platform-shells

- Kit: 0.4.0-beta.2 (claude/project-thread-fldkhh 82037c2, local changes)
- Mode: agent claude (2.1.316 (Claude Code)), repeat 1, model claude-sonnet-5-5
- Run folder (not committed): `runs/2026-11-02-22-45-44/`
- Contact sheet: [runs/2026-11-02-22-45-44/contact-sheet.png](runs/2026-11-02-22-45-44/contact-sheet.png)

- Designs: 2 from 2 run(s); runs with no design: 0.
- Check errors by repeat: #1 0.
- Distinct look signatures: 2 of 2.
- Critic: n/a (no critique recorded).
- Agent cost: $1.10.

| Brief | # | Design | Skill | Errors | Error codes | Warnings | Critic | Questions | Assumptions | Tool calls | Time | Signature (accent / display / body / theme) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| android-screen | 1 | .open-design/android-habit-tracker-home-screen-today-s-habits-with-streak/android-habit-tracker-home-screen-today-s-habits-with-streak.html | od:prototype:mobile-app ⚠ | 0 | — | 4 (stress-overflow×4) | n/a | 0 | 5 | 14 | 97s | #1a73e8 / - / - / light |
| tablet-screen | 1 | .open-design/design-the-orders-screen-of-our-restaurant-ipad-app-a-list-o/orders-screen.html | od:prototype:app-table | 0 | — | 0 (—) | n/a | 0 | 5 | 13 | 156s | #9b5b32 / - / - / light |

Must notes (ticked by the reviewer from the contact sheet):

- [ ] android-screen: data-od-device="android" on <body>, and no status bar, notch or phone frame drawn by the design
- [ ] android-screen: Material patterns: top app bar, a floating action button for adding a habit, 48 dp touch targets
- [ ] android-screen: Has an empty state for a first-day user with no habits
- [ ] tablet-screen: data-od-device="tablet" on <body> with landscape orientation, and no frame or status bar drawn by the design
- [ ] tablet-screen: List and detail side by side in landscape; still usable in portrait (checked at 768 × 980)
- [ ] tablet-screen: Touch targets at least 44 px

## 2026-11-02 — add-sample-data

- Kit: 0.4.0-beta.2 (claude/project-thread-fldkhh 53438ce, local changes)
- Mode: agent claude (2.1.316 (Claude Code)), repeat 1, model claude-sonnet-5-5
- Run folder (not committed): `runs/2026-11-02-23-03-53/`
- Contact sheet: [runs/2026-11-02-23-03-53/contact-sheet.png](runs/2026-11-02-23-03-53/contact-sheet.png)

- Designs: 1 from 1 run(s); runs with no design: 0.
- Check errors by repeat: #1 0.
- Distinct look signatures: 1 of 1.
- Critic: n/a (no critique recorded).
- Agent cost: $0.72.

| Brief | # | Design | Skill | Errors | Error codes | Warnings | Critic | Questions | Assumptions | Tool calls | Time | Signature (accent / display / body / theme) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| orders-table | 1 | .open-design/orders-list/orders-list.html | od:prototype:app-table | 0 | — | 15 (stress-overflow×15) | n/a | 0 | 5 | 14 | 184s | #000000 / - / - / light |

Must notes (ticked by the reviewer from the contact sheet):

- [ ] orders-table: Rows come from a data file (data-od-repeat), at least 12 orders
- [ ] orders-table: One very long customer name, a £0.00 order and a very large total, shown without breaking the row
- [ ] orders-table: Dates and money formatted for en-GB (4 Mar 2026, £1,240.00)

## 2026-11-02 — add-sample-data (after wording fix)

- Kit: 0.4.0-beta.2 (claude/project-thread-fldkhh 53438ce, local changes)
- Mode: agent claude (2.1.316 (Claude Code)), repeat 1, model claude-sonnet-5-5
- Run folder (not committed): `runs/2026-11-02-23-12-34/`
- Contact sheet: [runs/2026-11-02-23-12-34/contact-sheet.png](runs/2026-11-02-23-12-34/contact-sheet.png)

- Designs: 1 from 1 run(s); runs with no design: 0.
- Check errors by repeat: #1 0.
- Distinct look signatures: 1 of 1.
- Critic: n/a (no critique recorded).
- Agent cost: $0.72.

| Brief | # | Design | Skill | Errors | Error codes | Warnings | Critic | Questions | Assumptions | Tool calls | Time | Signature (accent / display / body / theme) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| orders-table | 1 | .open-design/orders-list/orders.html | od:prototype:app-table | 0 | — | 3 (stress-overflow×3) | n/a | 0 | 4 | 17 | 191s | #2f6feb / - / - / light |

Must notes (ticked by the reviewer from the contact sheet):

- [ ] orders-table: Rows come from a data file (data-od-repeat), at least 12 orders
- [ ] orders-table: One very long customer name, a £0.00 order and a very large total, shown without breaking the row
- [ ] orders-table: Dates and money formatted for en-GB (4 Mar 2026, £1,240.00)

## 2026-11-03 — add-task-walkthrough

- Kit: 0.4.0-beta.2 (local/sample-data 843c15c, local changes)
- Mode: agent claude (2.1.317 (Claude Code)), repeat 1, model claude-sonnet-5-5
- Run folder (not committed): `runs/2026-11-03-02-15-20/`
- Contact sheet: [runs/2026-11-03-02-15-20/contact-sheet.png](runs/2026-11-03-02-15-20/contact-sheet.png)

- Designs: 5 from 1 run(s); runs with no design: 0.
- Check errors by repeat: #1 0.
- Distinct look signatures: 1 of 5.
- Critic: n/a (no critique recorded).
- Agent cost: $0.77.

| Brief | # | Design | Skill | Errors | Error codes | Warnings | Critic | Questions | Assumptions | Tool calls | Time | Signature (accent / display / body / theme) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sign-in-flow | 1 | .open-design/habit-sign-in/check-email.html | od:prototype:flow-sign-in | 0 | — | 1 (state-missing) | n/a | 0 | 1 | 19 | 219s | - / - / - / - |
| sign-in-flow | 1 | .open-design/habit-sign-in/forgot-password.html | od:prototype:flow-sign-in | 0 | — | 0 (—) | n/a | 0 | 1 | 19 | 219s | - / - / - / - |
| sign-in-flow | 1 | .open-design/habit-sign-in/home.html | od:prototype:flow-sign-in | 0 | — | 2 (stress-overflow×2) | n/a | 0 | 1 | 19 | 219s | - / - / - / - |
| sign-in-flow | 1 | .open-design/habit-sign-in/new-password.html | od:prototype:flow-sign-in | 0 | — | 0 (—) | n/a | 0 | 1 | 19 | 219s | - / - / - / - |
| sign-in-flow | 1 | .open-design/habit-sign-in/sign-in.html | — | 0 | — | 0 (—) | n/a | 0 | 5 | 19 | 219s | - / - / - / - |

Must notes (ticked by the reviewer from the contact sheet):

- [ ] sign-in-flow: Four screens in one collection, planned as a flow, that link to each other with real links
- [ ] sign-in-flow: The collection check reports no flow-broken-link or flow-dead-end
- [ ] sign-in-flow: The plan names the task "reset a forgotten password" from sign-in to home, and the check finds a path for it (no task-unreachable)
- [ ] sign-in-flow: Sign in shows its error state (wrong password) and a way to reset it

## 2026-11-03 — add-expo-nativewind-target

- Kit: 0.4.0-beta.2 (local/nativewind d506529)
- Mode: agent claude (2.1.317 (Claude Code)), repeat 1, model claude-sonnet-5-5
- Run folder (not committed): `runs/2026-11-03-02-40-36/`
- Contact sheet: [runs/2026-11-03-02-40-36/contact-sheet.png](runs/2026-11-03-02-40-36/contact-sheet.png)

- Designs: 2 from 1 run(s); runs with no design: 0.
- Check errors by repeat: #1 0.
- Distinct look signatures: 1 of 2.
- Critic: n/a (no critique recorded).
- Agent cost: $0.74.

| Brief | # | Design | Skill | Errors | Error codes | Warnings | Critic | Questions | Assumptions | Tool calls | Time | Signature (accent / display / body / theme) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| habits-expo | 1 | Open Design/the-today-screen-for-our-expo-habit-tracker-today-s-habits-w/today-android.html | od:prototype:app-shell | 0 | — | 10 (stress-overflow×9, overlap) | n/a | 0 | 0 | 27 | 199s | - / - / - / - |
| habits-expo | 1 | Open Design/the-today-screen-for-our-expo-habit-tracker-today-s-habits-w/today-iphone.html | od:prototype:app-shell | 0 | — | 10 (stress-overflow×9, overlap) | n/a | 0 | 4 | 27 | 199s | - / - / - / - |

Must notes (ticked by the reviewer from the contact sheet):

- [ ] habits-expo: Uses the app's green primary and warm off-white background from global.css, not the kit's defaults
- [ ] habits-expo: The component set targets NativeWind: Pressable-based components with pressed and disabled states, 44 pt targets, no web-only CSS
- [ ] habits-expo: The theme lands in global.css and tailwind.config.js, and a gallery screen lists the components
