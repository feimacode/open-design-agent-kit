## 1. Shells

- [x] 1.1 `deviceShell.ts`: sizes and markup for `iphone`, `android`, `tablet` (both orientations), `desktop-app` (mac, windows), light and dark status bars; drawn outside the design's iframe, so never saved
- [x] 1.2 Apply the shell in every preview host (browser shell, VS Code webview, MCP App) from the bridge's `ready` message, and in the one-file prototype; unit tests
- [x] 1.3 `device-double-frame` warning when a design has the attribute and draws a frame

## 2. Brief and templates

- [x] 2.1 `screenDecisions.ts`: platform specs name the attribute; drop the "no Android frame" note; desktop app platform
- [x] 2.2 App-screens and flow templates, mobile templates and the mobile-app overlay use the attribute instead of drawing frames

## 3. Check and export

- [x] 3.1 Device screens checked at the device size (tablet in both orientations); app screens without a device add 1024 and 768 px within the image budget
- [x] 3.2 Large-text pass at 20 px root font, `large-text-overflow`
- [x] 3.3 `shell` option for PNG and JPEG exports (PDF stays bare) (default on for device screens); site export and promote never include it

## 4. Docs and evals

- [x] 4.1 `app-screens.md`, `generate-a-design.md`, `reference/tools.md`
- [x] 4.2 Eval brief for an Android screen and a tablet screen; one live run
