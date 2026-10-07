## Context

The motion examples schedule work with `requestAnimationFrame`, CSS animations, and `setTimeout` chains keyed on `data-duration`. Headless screencast (`page.screencast`) records in real time and drops frames under load. Export already has an `openArtifactPage` session and size resolution. The repo's HyperFrames requirement already treats ffmpeg as a user-installed prerequisite.

## Goals / Non-Goals

**Goals:** frame-exact, repeatable MP4, WebM and GIF from existing templates without rewriting them; bounded size; clear errors when ffmpeg is missing.

**Non-Goals:**
- Audio.
- A timeline editor.
- Replacing the HyperFrames CLI for the HyperFrames framework.
- Video inputs inside artifacts (`<video>` elements are captured at their current frame, with a warning).

## Decisions

### D1. Virtual clock by init script (the timesnap approach)
`page.evaluateOnNewDocument` installs a clock before any artifact script runs:
- `performance.now` and `Date.now` return virtual time.
- `requestAnimationFrame` queues callbacks that run once per step.
- `setTimeout` and `setInterval` fire when virtual time passes their deadline.

Each step advances by 1/fps, runs the due timers and the rAF callbacks, sets `currentTime` on every `document.getAnimations()` animation, waits for two compositor frames, and takes a screenshot.

*Alternative:* the CDP `Emulation.setVirtualTimePolicy`. It's less predictable with modern Chromium compositing, and it doesn't control CSS animations.

### D2. Frames piped to ffmpeg's stdin
JPEG frames (PNG when transparency is requested) go to ffmpeg through `image2pipe`, so nothing is written to disk.
- **MP4:** `libx264 -pix_fmt yuv420p -movflags +faststart`.
- **WebM:** `libvpx-vp9`, falling back to `libvpx` (VP8).
- **GIF:** two passes, `palettegen` then `paletteuse` with dithering.

### D3. Discovery and probing like the browser
An explicit path, then `PATH`, then the Playwright cache (`ffmpeg-*/ffmpeg-<os>`) and Homebrew/winget locations. `ffmpeg -hide_banner -encoders` is probed once per run. Playwright's build has only VP8, so the error says "WebM works; install a full ffmpeg for MP4 and GIF".

### D4. Duration resolution order
`duration` > the sum of `data-duration` on `section.frame`/`[data-duration]` > the longest finite `getAnimations()` end time, measured after load > 6 s for infinite-only animations. Capped at 60 s, so 1,800 frames at 30 fps, to bound export time. The result reports which rule applied.

### D5. Budgets by re-encoding
For MP4 and WebM, a budget-derived bitrate (two attempts). For GIF: fps 15 → 12 → 10, then width × 0.8 per step, up to three steps. A miss keeps the smallest result and warns, as for images.

### D6. Timestamped checks reuse the clock
`check_open_design_artifact` with `at: [0, 2.5, 6]` installs the same clock, steps to each time, and adds one image per timestamp, labelled `t=2.5s`, within `maxImages`.

## Risks / Trade-offs

- [Scripts that read the clock in unusual ways (Web Workers, `requestIdleCallback`, audio clocks)] → workers aren't patched. The export warns when a page creates a Worker, and the frames may be off for that content.
- [WebGL content in headless Chromium without a GPU] → launch with SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader`) for motion exports; slow, but correct.
- [Long exports] → 60 s cap; progress in the VS Code tool's invocation message; cancellation honoured between frames.

## Migration Plan

Additive. The HyperFrames template keeps its CLI path; its brief may mention the new formats for non-framework motion only.

## Open Questions

- Transparent WebM (VP9 alpha) for overlays. Proposed as an option (`transparent: true`), since VP9 supports alpha and the frames would be PNG with `omitBackground`.
