---
name: 3d-object
zh_name: "3D 物体"
en_name: "3D Object"
emoji: "🧊"
description: "A product or object in 3D — built from shapes, extruded from a logo, or loaded from your own .glb — lit like a studio shot, turning on a turntable, ready to export as a still, a transparent cut-out or a turntable video."
zh_description: "3D 产品或物体:用基本形体搭建、由 Logo 挤出, 或载入你自己的 .glb 模型;摄影棚光照与转台, 可导出静帧、透明抠图或转台视频"
en_description: "A product or object in 3D — built from shapes, extruded from a logo, or loaded from your own .glb — lit like a studio shot, turning on a turntable, ready to export as a still, a transparent cut-out or a turntable video."
category: 3d
scenario: marketing
tags: ["3d", "three.js", "webgl", "product shot", "turntable", "glb", "gltf", "logo", "3D 模型", "产品图"]
triggers:
  - "3d"
  - "3d object"
  - "3d model"
  - "product shot"
  - "turntable"
  - "glb"
  - "gltf"
  - "3d logo"
  - "hero render"
  - "3D 模型"
  - "产品渲染"
od:
  mode: prototype
  platform: desktop
  scenario: marketing
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  example_prompt: "Make a 3D hero shot of our speaker, a soft cylinder with a glowing ring on top, in our brand colors, turning slowly — then export a transparent PNG and a turntable MP4."
---

# 3D Object

**Intent.** One object, shown well: a product, a logo or a simple form, lit like a studio photo, on a quiet stage, turning slowly. The page is a single self-contained three.js scene. People use it as a hero visual, export a still or a transparent cut-out for slides and pages, or a turntable clip for social.

This is not a 3D editor, a game scene or text-to-3D generation. If the user wants a model of something that doesn't exist yet and can't be built from simple shapes, say so and offer a procedural stand-in.

## 1. Pick the object path

- **Procedural:** build the object from three.js geometry: `LatheGeometry` for anything turned (bottles, speakers, cups, lamps), `ExtrudeGeometry` for flat shapes with depth, boxes and cylinders with bevels (`RoundedBoxGeometry` from the addons) for devices. Combine a few parts in a `Group`. Aim for the silhouette and proportions first; small details (a groove, a light ring, a seam) make it read as a product.
- **Extruded logo:** parse the brand's SVG with `SVGLoader`, turn each filled path into shapes (`SVGLoader.createShapes`), and extrude with a bevel. Flip y (SVG's y points down), center the geometry, and scale it to a fixed size. Strokes aren't extruded; ask for a filled version of the mark if that's all there is.
- **The user's model (`.glb` / `.gltf`):** load it with `GLTFLoader`. Copy the file under `assets/` next to the design (with a shell copy: it's binary) and load `assets/<name>.glb`; if you can't copy it, use its path relative to the design. Set up `DRACOLoader` with the pinned decoder path (below) so Draco-compressed models work. Never assume the model's units, origin or orientation: measure its bounding box, rest it on the ground, center it, and frame the camera from its size (the GLB example's `stage()` does exactly this). If the file is over 50 MB, tell the user it will load slowly and suggest `npx @gltf-transform/cli optimize in.glb out.glb --compress draco` first.

## 2. Build the scene

Use exactly these pinned URLs, through an import map:

```html
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
} }
</script>
```

Draco decoder path: `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/`.

Don't write three.js script tags from memory: `build/three.min.js` no longer exists (removed in r160), nor does `examples/js/…` (removed in r148), so `<script src=".../three.min.js">` 404s, `THREE` is undefined and the page shows nothing. Use the import map above and `import * as THREE from 'three'` in a `<script type="module">`, with addons from `three/addons/…`.

- **Canvas:** one full-bleed `<canvas id="stage" data-od-webgl>` passed to `WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })`. Size it from the canvas's CSS box on load and on `resize`, and keep the whole object in frame on tall, narrow canvases (move the camera back when the aspect is below 1).
- **Color:** `outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmicToneMapping`.
- **Materials:** physically based (`MeshStandardMaterial` / `MeshPhysicalMaterial`), with colors read from the design system's tokens (`getComputedStyle(document.documentElement).getPropertyValue('--accent')`) so the object matches the page: the body from `--surface` or `--fg`, one detail from `--accent`. Choose roughness and metalness for the real material (matte plastic 0.6–0.9 rough, brushed metal metalness 1 at 0.25–0.4 rough, glossy paint with `clearcoat`). Keep a user model's own materials unless asked to recolor it.
- **Light:** studio light from a generated room: `scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture`, plus one shadow-casting key `DirectionalLight` (soft shadows: `PCFSoftShadowMap`, `shadow.radius` about 6). No HDR files.
- **Stage:** a large ground plane with `ShadowMaterial` (opacity 0.12–0.2) under the object, nothing else. `scene.background` is the `--bg` color, or `null` for a transparent cut-out.
- **Controls:** `OrbitControls` with damping, no pan for single objects, `maxPolarAngle` just under 90° so the camera never goes below the floor, and min/max distance around the framed distance.
- **Budget:** at most about 200k triangles and 2048 px textures, so it stays smooth in software rendering. Lathe and torus segments of 64–160 are plenty.
- **Transparent option:** a `TRANSPARENT` constant at the top. When true: `alpha: true` on the renderer, `scene.background = null`, and a class on `<html>` that makes the page background transparent and hides any caption.
- **Page:** the scene fills the window. A short caption (product name, one line) in the design system's type is fine; keep it in a corner and out of the object's way.

## 3. The ready contract (required)

Exports, the visual check and motion export rely on it:

```js
const start = performance.now();
window.odScene = { rotate: true, rotationSeconds: ROTATION_SECONDS, ready: undefined };
function pose(now) {
  const turn = window.odScene.rotate ? (((now - start) / 1000) / ROTATION_SECONDS) * Math.PI * 2 : 0;
  product.rotation.y = AUTHORED_ANGLE + turn;
}
window.odScene.ready = (async () => {
  await loadEverything();            // the model, textures, fonts for 3D text
  pose(performance.now());
  renderer.render(scene, camera);    // a direct render, not inside requestAnimationFrame
})();
renderer.setAnimationLoop((now) => { pose(now); controls.update(); renderer.render(scene, camera); });
```

- `ready` resolves only after every asset has loaded and one frame has been drawn **with a direct `render()` call**. Motion export runs the page on a virtual clock where animation frames only advance on its schedule, so a `ready` that waits for an animation frame would never resolve there.
- The turntable angle is computed from time (`performance.now()` or the loop's timestamp), never incremented per frame, so a rotation takes exactly `ROTATION_SECONDS` at any frame rate.
- `rotate = false` returns the object to `AUTHORED_ANGLE`. Still exports set it, so choose the authored angle as the best three-quarter view.

## 4. Register, check, export

1. `register_open_design_artifact` with kind `html` and this skill as the source.
2. `check_open_design_artifact`, and look at the screenshot. Exports and the check switch on software WebGL for pages with `data-od-webgl` or a three.js import, so this works without a GPU. Fix every `webgl` finding: an error means no WebGL context (a script error before the renderer was made, or a canvas without the attribute's renderer); a warning means the canvas is a flat color (the model didn't load: see `broken-asset`; the camera is inside or away from the object; or `ready` resolved before anything was drawn).
3. Exports:
   - **Still:** `export_open_design_artifact` with `format: "png"` (or a preset). Add `selector: "#stage"` to capture only the scene.
   - **Transparent cut-out:** set `TRANSPARENT = true` in the file (or make a copy that does), then export with `format: "png"`, `transparent: true`. A warning that no pixel is transparent means the page or scene still paints a background.
   - **Turntable:** `format: "mp4"` (or `"gif"` for a small loop, `"webm"`) with `duration` set to exactly `ROTATION_SECONDS`, so the last frame meets the first and the loop is seamless. Keep `ROTATION_SECONDS` between 6 and 12; a GIF loops best at 6–8 seconds and 480–720 px wide.
   - The scene loads three.js from the CDN, so viewers need a connection, including for `standalone` exports.
