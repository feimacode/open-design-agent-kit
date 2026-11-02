## 1. Shells

- [ ] 1.1 `deviceShells.ts`: sizes and markup for `iphone`, `android`, `tablet` (both orientations), `desktop-app` (mac, windows), light and dark status bars; shell marked `data-od-preview-only`
- [ ] 1.2 Apply the shell wherever `data-od-include` is resolved (static server, VS Code srcdoc preview, MCP App, one-file prototype); unit tests with fixed-position tab bars
- [ ] 1.3 `device-double-frame` warning when a design has the attribute and draws a frame

## 2. Brief and templates

- [ ] 2.1 `screenDecisions.ts`: platform specs name the attribute; drop the "no Android frame" note; desktop app platform
- [ ] 2.2 App-screens and flow templates, mobile templates and the mobile-app overlay use the attribute instead of drawing frames

## 3. Check and export

- [ ] 3.1 Device screens checked at the device size (tablet in both orientations); app screens without a device add 1024 and 768 px within the image budget
- [ ] 3.2 Large-text pass at 20 px root font, `large-text-overflow`
- [ ] 3.3 `shell` option for PNG and PDF exports (default on for device screens); site export and promote never include it

## 4. Docs and evals

- [ ] 4.1 `app-screens.md`, `generate-a-design.md`, `reference/tools.md`
- [ ] 4.2 Eval brief for an Android screen and a tablet screen; one live run
