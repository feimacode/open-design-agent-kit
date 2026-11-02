## Why

An app screen is designed for a device, and the kit only knows one device well. The mobile surface draws an iPhone 15 Pro frame. The app-screens work (PR #88) stopped "Android" from getting an iPhone, but it gets a frameless 412 px screen and a note telling the user it has no frame. Tablet answers become "1024 px landscape and 768 px portrait" in the brief, yet the check renders only 1440 and 390 px, so nothing at tablet width is ever looked at. Desktop apps (Electron, Tauri, a native Mac or Windows app) get a web page with no window around it.

The agent also draws every frame itself, in every screen. Frames drift between screens of a flow the same way the shared navigation did, and they cost tokens on every screen.

This is the first "Next" item of the UI design use case study (2026-11-02), gap R5. It takes XIAS's `verify_responsive` idea (check the widths people actually use, and a larger root font size, because a layout that fits only at 16 px fits by luck) and OpenPencil's status-bar and bottom-nav cleanup.

## What Changes

- **Kit-drawn device shells.** A screen declares its device with `data-od-device` on `<body>`: `iphone`, `android`, `tablet` (with `data-od-orientation="landscape|portrait"`) or `desktop-app` (with `data-od-window="mac|windows"`). The kit draws the shell around the page wherever it serves it (preview, check, export, MCP App), the same way it fills in `data-od-include`: status bar, Dynamic Island or punch-hole camera, home indicator or gesture bar, rounded corners, or a window title bar with traffic lights or caption buttons. The screen's own HTML is only the app. Shells take `data-od-theme="light|dark"` for the status bar colour.
- **Android (Material 3) shell.** 412 by 915 px, Android status bar (time left, icons right), gesture handle, 48 px touch targets in the brief. The `screenDecisions` note that says "no Android frame yet" goes.
- **Tablet shell.** 1024 by 768 landscape or 768 by 1024 portrait, with iPad-style rounded bezel.
- **Desktop app shell.** A window at 1280 by 800 with a Mac or Windows title bar holding the app's name; the brief asks the agent not to draw its own.
- **Viewports follow the device.** A page with `data-od-device` is checked at its device size (both orientations for a tablet), not at 1440 and 390. A web app with no device gains a 768 px and a 1024 px viewport in the check when it is an app screen (`surface: app-screens`), within the image budget.
- **Large-text pass.** App screens are also rendered once with the root font size at 20 px; text that escapes its box or overlaps is reported as `large-text-overflow`.
- **Exports keep the shell optional.** PNG and PDF exports of a device screen include the shell by default (`shell: false` leaves it out); the site export and promote to code never include it.

## Capabilities

### New Capabilities
- `platform-shells`: `data-od-device` and its options, the shells the kit draws, where they are drawn, and the brief's device instructions.

### Modified Capabilities
- `artifact-visual-check`: "Page Checks Across Viewports" checks device screens at the device size and app screens at tablet widths too, and adds the large-text pass.

## Impact

- New `packages/core/src/export/deviceShells.ts` (shell markup and CSS, sizes), applied where `flowIncludes` is applied: `staticServer`, the VS Code srcdoc preview, `mcpApp.packForPreview`, the one-file prototype.
- `checkArtifact.ts` viewport selection and the large-text pass; `exportArtifact.ts` `shell` option for PNG and PDF.
- `screenDecisions.ts` (platform specs name the shell attribute), the app-screens and mobile templates (`packages/content/local/skills/app-*`, `flow-*`), the mobile-app overlay so the upstream iPhone frame markup is replaced by the attribute.
- Docs: `app-screens.md`, `reference/tools.md` (`large-text-overflow`, `shell`), `generate-a-design.md`.
