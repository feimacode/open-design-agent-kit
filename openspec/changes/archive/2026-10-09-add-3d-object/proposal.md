## Why

"3D object" is a Claude Design surface, and product teams want it for hero shots, feature visuals, app-store art and turntable clips. They'd much rather show *their own* product model than a stock render. We have no 3D object content: `threejs` and `fal-3d` are catalog stubs, the `webgl-*` examples are full-screen shader backgrounds, and `mockup-device-3d` is CSS 3D. Exports of WebGL content also run in a headless browser with no GPU flags, so whether a canvas renders at all depends on the machine.

## What Changes

- **New local skill `3d-object`** (`od:prototype:3d-object`): one self-contained three.js scene (pinned `three@0.160.0` from jsDelivr, the version the vendored examples already use) with:
  - **the object:** either built procedurally (primitives, lathe and extrude shapes, or an SVG logo extruded into 3D), or loaded from a user-supplied `.glb`/`.gltf` in the workspace;
  - **materials:** physically based, taken from the design system's palette;
  - **light:** studio lighting from a generated room environment (no HDR files);
  - **the stage:** a ground shadow, orbit controls, and an auto-rotating turntable driven by `requestAnimationFrame`, so it works with motion export;
  - **a transparent background**, optional.

  It marks the canvas with `data-od-webgl` and exposes `window.odScene.ready` (a promise that resolves after the first frame with all assets loaded).
- **WebGL-aware rendering:**
  - Export, the visual check and motion export launch the browser with software WebGL (SwiftShader) when the artifact has a `[data-od-webgl]` canvas or a `three` import, and wait for `odScene.ready` when it exists.
  - A new `webgl` finding reports a canvas that failed to create a WebGL context, or that rendered blank.
- **Transparent images:** image export gains `transparent: true` (a PNG with no background, for pasting product shots onto slides and pages). It needs the scene or page to have a transparent background, and warns when the capture comes out fully opaque.
- **Turntable presets:** the skill documents `format: "mp4"`/`"gif"` turntable export with `duration` set to one full rotation. That relies on add-motion-export.
- **The 3D object surface** becomes `ready`.

## Capabilities

### New Capabilities
- `3d-objects`: the 3D object skill and its ready contract, WebGL-aware rendering and the `webgl` check, transparent image export, and the turntable guidance.

### Modified Capabilities
<!-- None: transparent capture is an additive export option specified here. -->

## Impact

- `packages/content/local/skills/3d-object/`, with examples (procedural object, extruded logo, GLB product).
- `packages/core`: browser launch flags in `artifactPage.ts` (opt-in per artifact), a ready-promise wait in `loadPage`, the `webgl` page check, and the `transparent` option in image export.
- Tool schemas and CLI (`--transparent`), the surface, docs.
- Depends on: add-visual-check (done) and add-motion-export (turntables). No new npm dependencies; three.js loads from a pinned CDN URL at view time.
