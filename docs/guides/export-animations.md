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
   - a 3D scene's `window.odScene.duration`: a [camera flythrough](3d-scenes.md)'s length, or one full turn of a [3D object](3d-objects.md)'s turntable;
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
| `audio` | MP4 and WebM: a sound file in your workspace laid under the whole film, trimmed to it with a 0.5 s fade out |
| `audioVolume` | Volume of `audio`, 0 to 1. Default 1 |
| `captions` | An SRT or WebVTT file in your workspace |
| `burnCaptions` | `false` writes only the `.vtt` file, without drawing captions into the frames. Default true |

Capturing takes roughly 8 frames per second on a laptop, so a 30-second, 30 fps MP4 takes a couple of minutes.

## Sound

> Add the music in `assets/theme.wav` under the launch film and a whoosh when the logo lands.

A film can carry music, voice and sound effects. The kit uses only files you supply: it never downloads, generates or bundles music, and after an export with sound it reminds the agent to check that you may use the tracks where the film will be published.

Sound is placed in the page with the same markup as upstream Open Design, so its motion templates work unchanged:

```html
<meta name="od-motion-audio" content="required">
<audio src="assets/theme.wav" data-start="0" data-volume="0.3" data-fade-out="1"></audio>
<audio src="assets/whoosh.wav" data-start="4.2" data-duration="0.6"></audio>
```

- `data-start` and `data-duration` are seconds (a track without `data-duration` plays to its end or the film's end), `data-volume` is 0 to 1, and `data-fade-in` / `data-fade-out` are seconds.
- Files must be in the design's folder. A web address or a file outside the folder is skipped with a warning.
- `od-motion-audio` records the decision: `required` makes the export fail with `no-audio-track` when no track can be played, and `none` (or upstream's `silent`) is a deliberate silent film.
- You can also pass `audio` for a music bed under the whole film.

The frames are still captured silently on the virtual clock. ffmpeg then mixes the tracks in one pass, in sync with the frames, and normalises the mix to about −14 LUFS with a −1 dB peak ceiling, the level YouTube, Instagram and TikTok play at. The exporter then probes the file: the result gives the measured loudness, and a film whose sound came out missing or silent fails when sound is `required`. A track cut off mid-sound at the end of the film is reported as `audio-clipped`. GIFs have no sound; the export says so.

MP4 uses AAC and WebM uses Opus (or Vorbis). Without those encoders the video is written silent with a warning, or fails when sound is `required`.

## Captions

> Export the reel with the captions in `captions.srt`.

Pass `captions` with an SRT or WebVTT file, or mark cues in the page:

```html
<p data-od-caption data-start="1.5" data-duration="2.5">Launching Tuesday</p>
```

Captions are drawn into the frames in the design system's body font and colours, centred inside the safe area. In a 9:16 frame they sit above the bottom fifth, where Reels, Shorts and TikTok put their buttons. `exports/<name>.vtt` is written beside the video either way, for players and platforms that take a captions file; `burnCaptions: false` writes only that file.

The check reports `caption-too-fast` for a cue over 20 characters a second, and the export reports `caption-outside-safe-area` for one too long to fit. Captions marked in the page appear in the check's timed screenshots (`at`), as they will in the film.

## Limits

- **Web Workers** keep real time, and `<video>` elements show whatever frame they're on. The export warns when a page has either.
- **WebGL** renders in software (SwiftShader) during export, so it works without a GPU, just more slowly.
- **HyperFrames compositions** built with the HyperFrames framework render with its own CLI; see [YouTube videos](youtube-video.md).

> **From the CLI:** `npx @feimacode/open-design-agent-kit export .open-design/outro/outro.html --format gif --fps 15 --duration 3 --max-bytes 5000000`, or with sound and captions: `--format mp4 --audio assets/theme.wav --audio-volume 0.4 --captions captions.srt`

## Related

- [Export images](export-images.md)
- [Social media posts](social-posts.md), for still versions of the same design
