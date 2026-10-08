# Export animations

Turn an animated design (a title card, a logo reveal, an animated chart, a sprite or WebGL animation, a storyboard of timed frames) into an MP4, a WebM or a GIF, frame-exact and the same on every run.

## Before you start

- An installed Chrome, Edge or Chromium ([why](export-images.md#before-you-start)).
- An installed **ffmpeg** with the encoder for your format. A full build does everything; Playwright's bundled copy only makes WebM. Check with `ffmpeg -version`, and see [`OPEN_DESIGN_FFMPEG_PATH`](../reference/settings-and-env.md#open_design_ffmpeg_path) if it's somewhere unusual.

## Start

> Export the logo reveal as an MP4.

> Make a 3-second GIF of the animated chart for our README, under 5 MB.

Any animated design works: the motion templates in the gallery's **Animation** tile, or anything you've built with CSS animations, `requestAnimationFrame` or timers.

## How it works

1. **The agent checks a few moments first.** [`check_open_design_artifact`](../reference/tools.md#check_open_design_artifact) with `at`, for example `[0, 1.5, 3]`, returns screenshots of those moments, so it can see the start, middle and end before exporting.
2. **The page runs on a virtual clock.** Before any page script runs, the exporter takes over time: `performance.now`, `Date`, `requestAnimationFrame`, timers, and CSS and Web Animations. It then advances exactly one frame at a time. A slow machine produces the same frames as a fast one, and two exports of the same design are identical.
3. **The length comes from the page.** In order:
   - the `duration` you ask for;
   - the sum of the frames' `data-duration` values (storyboards);
   - the longest CSS or Web animation;
   - 6 seconds, for designs that only loop.

   The maximum is 60 seconds. The result says which rule was used.
4. **Frames are encoded with ffmpeg** to `exports/<name>.mp4` (H.264), `.webm` (VP9, or VP8) or `.gif` (two-pass palette, looping by default). The size comes from `width`/`height`, a canvas `preset` such as `story` or `ig-square`, or the design's own size.

| Option | Meaning |
|---|---|
| `format` | `mp4`, `webm` or `gif` |
| `fps` | 1–60. Default 30 (15 for GIF) |
| `duration` | Seconds, 0.5–60 |
| `loop` | GIF only. Default true |
| `maxBytes` | Re-encode smaller to fit a platform limit: lower bitrate for video; fewer frames, then a narrower image, for GIF |

Capturing takes roughly 8 frames per second on a laptop, so a 30-second, 30 fps MP4 takes a couple of minutes.

## Limits

- **Web Workers** keep real time, and `<video>` elements show whatever frame they're on. The export warns when a page has either.
- **WebGL** renders in software (SwiftShader) during export, so it works without a GPU, just more slowly.
- **HyperFrames compositions** built with the HyperFrames framework render with its own CLI; see [YouTube videos](youtube-video.md).

> **From the CLI:** `npx @feimacode/open-design-agent-kit export .open-design/outro/outro.html --format gif --fps 15 --duration 3 --max-bytes 5000000`

## Related

- [Export images](export-images.md)
- [Social media posts](social-posts.md), for still versions of the same design
