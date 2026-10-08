# 3D objects and product shots

Ask for a product, a logo or an object in 3D, and the agent builds a three.js scene: studio-lit, colored from your [design system](design-systems.md), resting on a soft shadow and turning slowly. Use it as a hero visual, or export a still, a transparent cut-out for slides, or a turntable video.

## Before you start

- Nothing to install to make or preview a scene. three.js loads from a pinned CDN build (`three@0.160.0` on jsDelivr), so viewing needs a connection.
- Checking and exporting need an installed Chrome, Edge or Chromium ([why](export-images.md#before-you-start)). No GPU is needed: exports render WebGL in software.
- Turntable videos need **ffmpeg** (see [Export animations](export-animations.md#before-you-start)).

## Start

> Make a 3D hero shot of our speaker: a soft cylinder with a glowing ring on top, in our brand colors.

> Turn `brand/logo.svg` into a brushed-gold 3D mark that turns slowly.

> A product shot of `models/headphones.glb` on a light stage. Then give me a transparent PNG and a 10-second turntable MP4.

In VS Code, the gallery's **New design → 3D object** tile asks what the object is and where it's going. To start from a working scene, remix one of the examples: `od:prototype:3d-object:example` (a speaker built from shapes), `od:prototype:3d-object-logo` (an extruded logo) or `od:prototype:3d-object-glb` (a model loaded from a `.glb`). See [Remix and the gallery](remix-and-gallery.md).

## What happens

1. **The agent picks how to make the object:**
   - **From shapes:** turned profiles for bottles, speakers and cups; extruded and bevelled shapes; rounded boxes for devices.
   - **From a logo:** your SVG mark, extruded with a bevel. It needs filled paths (outlines alone don't extrude).
   - **From your model:** a `.glb` or `.gltf`, copied under `assets/` next to the design. Draco-compressed models work. Whatever the model's size, units or origin, it's set on the ground and framed automatically. Models over 50 MB load slowly; the agent suggests compressing them first (`npx @gltf-transform/cli optimize in.glb out.glb --compress draco`).
2. **It builds the scene** as one HTML page: physically based materials in your design system's colors, studio lighting from a generated room (no image files), a ground shadow, orbit controls (drag to turn it, scroll to zoom), and a turntable that makes one full turn every 6–12 seconds.
3. **It checks the result** with [`check_open_design_artifact`](../reference/tools.md#check_open_design_artifact). Besides the screenshot, the check reports `webgl` when a scene couldn't render:
   - an **error** when the canvas has no WebGL context;
   - a **warning** when the canvas is one flat color, usually because the model didn't load (look for a `broken-asset` finding next to it).

## Exports

Ask for what you need, for example "export a transparent PNG and a turntable GIF". The agent calls [`export_open_design_artifact`](../reference/tools.md#export_open_design_artifact):

| You want | How it's exported |
| --- | --- |
| A still | `format: "png"`, at a preset or size. The turntable stops and the object returns to its best angle first. `selector: "#stage"` captures the scene without the caption. |
| A transparent cut-out | The scene's background is switched off, then `format: "png"` with `transparent: true`. You get a PNG of the object and its shadow on nothing, ready to drop onto a slide or page. |
| A turntable | `format: "mp4"`, `"webm"` or `"gif"`, with `duration` set to exactly one turn, so the loop is seamless. See [Export animations](export-animations.md). |

> **From the CLI:** `npx @feimacode/open-design-agent-kit export .open-design/bottle/bottle.html --format png --transparent`, or `--format mp4 --duration 12` for a turntable. See the [CLI reference](../reference/cli.md).

## How rendering works

Exports, checks and turntable videos open the page in a headless browser. For pages that use WebGL (a canvas marked `data-od-webgl`, or a three.js import), the browser starts with software WebGL (SwiftShader), so it works on machines without a GPU: CI, WSL, servers. It's slower than a GPU, so scenes keep to about 200,000 triangles.

Each scene tells the exporter when it's ready: it sets `window.odScene.ready`, a promise that resolves once the model and textures have loaded and the first frame is drawn. The exporter waits for it (within the usual 15-second limit), so a still never catches the scene half-loaded. For stills it then sets `odScene.rotate = false`, which puts the object back at its authored angle.

## Limits

- three.js comes from the CDN, including in `standalone` exports, so the scene needs a connection to display.
- No text-to-3D generation: objects are built from shapes, logos or your own models.

## Related

[Export images](export-images.md) · [Export animations](export-animations.md) · [Design systems](design-systems.md) · [Troubleshooting](../troubleshooting.md#a-3d-scene-is-blank-webgl)
