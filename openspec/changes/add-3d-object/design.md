## Context

The vendored WebGL examples import `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`. Export launches headless Chromium with fixed args through `openArtifactPage`. Headless Chromium on machines without a GPU (CI, WSL, many laptops in headless mode) may fail to create a WebGL context unless SwiftShader is allowed. `loadPage` waits for network idle and fonts, but has no hook for "the scene finished loading".

## Goals / Non-Goals

**Goals:** good-looking product and object scenes from a brief or a user's GLB; reliable headless capture; transparent stills; turntable video via motion export.

**Non-Goals:**
- Text-to-3D model generation (the stubbed fal-3d workflow).
- A 3D editor, or physics.
- Bundling three.js into the extension.
- AR/USDZ export.

## Decisions

### D1. three.js from a pinned CDN, like the existing examples
This matches vendored practice and keeps the extension small. The `standalone` export notes that the CDN is still required to view the file. *Alternative:* copy `three.module.js` into each artifact's assets (about 670 KB per artifact, and it needs a tool to write library files). This is left as an open question for offline users.

### D2. A ready contract instead of fixed waits
The skill sets `window.odScene = { ready: Promise }`, resolving after the GLB or textures load and the first frame renders. `loadPage` waits for `window.odScene?.ready`, capped by the existing readiness timeout, then stops auto-rotation for stills by setting `odScene.rotate = false` when it exists, so stills are framed at the authored angle.

### D3. SwiftShader only when needed
Detection: a `[data-od-webgl]` element, or a `three` module import in the entry. Only then are `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` added to the launch args. That keeps other exports on default flags. It's slower, but deterministic.

### D4. `webgl` finding
In the page: for each `[data-od-webgl]` canvas, report an error if the WebGL context failed, and a warning if a sampled read of the canvas's pixels is uniform, which means a blank render. It's reported in both export and the visual check.

### D5. Transparent capture is generic
`transparent: true` uses puppeteer's `omitBackground` and forces PNG. The renderer and page must be transparent; the skill's "transparent" option sets `alpha: true` and clears the scene background. If every pixel of the capture is opaque, a warning says the background isn't transparent.

### D6. User GLB files stay local
The skill copies or references the user's model under the artifact's `assets/` and loads it with GLTFLoader from the same pinned CDN version. Draco-compressed models use the pinned Draco decoder path. Models over 50 MB get a warning suggesting `gltf-transform` compression.

## Risks / Trade-offs

- [SwiftShader rendering is slow for heavy scenes] → stills are fast enough; turntables are capped by motion export's 60 s limit, and the skill keeps polygon budgets modest.
- [The CDN is unavailable] → `broken-asset` reports it; offline vendoring is the open question.

## Migration Plan

Additive. Launch flags only change for WebGL artifacts.

## Open Questions

- Offline use: should the extension ship a pinned `three` build that the skill can reference from the artifact's assets (via a small "add library" tool), at the cost of extension size?
