## Context

`screenDecisions.ts` turns the platform answer into widths, touch targets and navigation in the brief. The upstream `mobile-app` skill has the agent draw an iPhone 15 Pro frame in HTML, and `mockup-device-3d` draws devices for marketing. `flowIncludes.ts` already rewrites served HTML (shared navigation) in every place a design is shown, with inserted nodes marked `data-od-preview-only` so saves keep the source.

## Goals / Non-Goals

**Goals:** one attribute gives every screen of a flow the same correct device; checks look at the sizes the screen is meant for; Android, tablet and desktop apps look as considered as iPhone.

**Non-Goals:** pixel-exact vendor frames or trademarked device art (shells are generic: no logos, no named models in the drawing); foldables and watches; rendering platform widgets (a Material date picker is the design's job, not the shell's).

## Decisions

### The kit draws the shell, the design is only the app

Drawing the frame at serve time removes drift and token cost, and lets promote and the site export drop it cleanly. The served page wraps `<body>` content in a shell element sized to the device, scales it to fit the preview, and marks the shell `data-od-preview-only`. The design's CSS sees a viewport of the device size, so media queries behave as on the device.

### Check at the device size, not "desktop and mobile"

A device screen at 1440 px is meaningless. The check uses the device size as its only viewport (two for a tablet). Web app screens without a device keep 1440 and 390 and add 1024 and 768, but only the first viewport is captured by default; the others add captures only when they have findings, as with state frames.

### Large text at 20 px, once

One extra render of the first viewport at `html { font-size: 20px }` catches layouts that only fit at the default size. It uses the same overflow measurement as the stress pass, so findings read alike.

### Migration of the iPhone frame

Existing designs that draw their own iPhone frame keep working: no attribute, no shell. The mobile templates switch to the attribute, and the overlay replaces the upstream frame instructions. A design with both (an attribute and a drawn frame) gets a `device-double-frame` warning.

## Risks / Trade-offs

- **Fixed-position elements.** A bottom tab bar with `position: fixed` must sit inside the shell. The shell is a containing block (`transform: translateZ(0)`), so fixed elements attach to it; the check covers it in a test.
- **Screenshots get bigger.** A tablet in two orientations is two captures; the budget rules above keep the total as today.
