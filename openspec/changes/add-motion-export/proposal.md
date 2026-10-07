## Why

"Animation" is a Claude Design surface, and motion is what marketing actually posts: Reels and Stories, animated banners, GIFs for README and Slack. We vendor about 15 real motion templates: the `frame-*` set, `motion-frames`, `sprite-animation`, `vfx-text-cursor`, `video-hyperframes` and the `webgl-*` heroes. None of them can leave the preview. Only the HyperFrames framework template has an MP4 path, through its own CLI. The templates are driven by the wall clock (`requestAnimationFrame`, CSS animations, `data-duration` timers), so naive screen recording in a headless browser drops frames and isn't repeatable.

## What Changes

- **New export formats `mp4`, `webm` and `gif`** for html, mini-app and svg artifacts. They're written as `exports/<name>.<ext>` at the export's size (`preset`, `width`/`height`, or the skill's aspect), with `fps` (default 30, or 15 for GIF), `duration` (in seconds) and `loop` (GIF; for MP4 and WebM, a loop-friendly ending).
- **Deterministic frame capture with a virtual clock.** Before any page script runs, the export replaces `performance.now`, `Date.now`, `requestAnimationFrame`, `setTimeout` and `setInterval` with a controlled clock, and pauses CSS and Web Animations. It then steps the clock one frame at a time, setting every animation's `currentTime`, and captures each frame. The output is identical on every run, whatever the machine's speed.
- **Automatic duration.** The export uses, in order:
  1. an explicit `duration`;
  2. the sum of `data-duration` on frames, for HyperFrames-style storyboards;
  3. the longest finite CSS or Web animation;
  4. 6 seconds, with a note, for infinite animations. A cap of 60 seconds applies.
- **ffmpeg discovery** works like browser discovery: an explicit path (setting or `OPEN_DESIGN_FFMPEG_PATH`), then `PATH`, then well-known locations, including Playwright's cache. ffmpeg is never downloaded.
  - The export probes the encoders it needs: H.264 for MP4, VP9 or VP8 for WebM, the GIF palette filters for GIF.
  - It reports `no-ffmpeg` or `ffmpeg-missing-encoder`, saying what to install. Playwright's own ffmpeg can only make WebM (VP8).
- **Size budgets.** With `maxBytes`, MP4 and WebM are re-encoded at a lower bitrate, and GIFs at a lower fps, then a smaller size, until they fit.
- **Motion check.** `check_open_design_artifact` gains `at` (seconds, a list of up to 6 timestamps). It captures those moments on the virtual clock, so the agent can see the start, the middle and the end of an animation.
- **CLI:** `export --format mp4|webm|gif --fps --duration`.
- **The Animation surface** lists the motion templates that can now be exported.

## Capabilities

### New Capabilities
- `motion-export`: the video and GIF formats, the virtual clock, duration resolution, ffmpeg discovery and encoder probing, size budgets, and timestamped checks.

### Modified Capabilities
<!-- None: the HyperFrames CLI path for the hyperframes template is unchanged. -->

## Impact

- `packages/core`: `export/motion/virtualClock.ts` (an init script), `export/motion/captureFrames.ts`, `export/motion/ffmpeg.ts` (discovery, probing, piping frames over stdin), the new formats in `EXPORTS_BY_KIND`, and `at` in `checkArtifact`.
- `packages/vscode`: an `openDesign.export.ffmpegPath` setting and tool schemas. `packages/mcp-server` and the CLI: schemas and flags.
- No npm dependencies; ffmpeg stays an external program, like the browser.
