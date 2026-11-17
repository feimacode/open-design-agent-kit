Roadmap area: Import and export

## Why

MP4 export (`add-motion-export`) makes silent films. Its design listed audio as a non-goal, which made sense for a first version. It doesn't fit what people export motion for now. A launch reel or a Reel without music feels unfinished. Social video is often watched with the sound off, so the words need to be on screen as captions. Today the agent has to leave the kit to add either, usually in a video editor, and the deterministic render is lost.

The rest of the field already ships sound with code-made video. HyperFrames mixes `<audio>` clips placed on its timeline into the MP4 ([repo](https://github.com/heygen-com/hyperframes)). Upstream open-design's Motion Design (v0.26 and v0.27) declares an audio decision in the page with `<meta name="od-motion-audio">`, places `<audio data-start data-duration data-volume>` tracks, mixes them into the MP4, and checks that the file really has an audible track. Remotion's skills include captions. If the kit reads the same markup as upstream, upstream motion templates can be vendored later and export with their soundtracks.

Source: motion design study, 17 November 2026, recommendation 2 and the upstream review.

## What Changes

- **Audio tracks from the page.** The exporter reads `<audio>` elements with `data-start`, `data-duration`, `data-volume` and optional `data-fade-in` / `data-fade-out` (seconds), the same attributes upstream uses. Sources must be local files inside the design's folder. Each track is cut, faded and mixed with ffmpeg onto the video timeline, so sound stays in sync with the virtual clock.
- **One soundtrack argument.** `export_open_design_artifact` takes `audio` (a path inside the workspace) for a music bed laid under the whole film, trimmed to the duration, with a 0.5 s fade out by default, and `audioVolume`.
- **The audio decision.** `<meta name="od-motion-audio" content="required|none">` says whether sound is part of the film. `required` with no playable track is an export error. `none`, or no meta, keeps today's silent export. Video formats only; GIF stays silent and says so.
- **Loudness.** The mix is normalised to about −14 LUFS integrated with a −1 dBTP ceiling, so a film isn't too quiet or clipped on social platforms. The result reports the measured loudness.
- **Captions.** `captions` takes an SRT or WebVTT file, or the page can mark caption text with `data-od-caption` and `data-start` / `data-duration`. The export burns captions into the frames in the design system's font and colours, inside the format's safe area, and writes a `.vtt` sidecar beside the video. `burnCaptions: false` writes the sidecar only.
- **Checks.** Video preflight gains `no-audio-track` (error, when `required`), `audio-clipped` (warning), `caption-outside-safe-area` and `caption-too-fast` (warning, over 20 characters a second). After export, the kit probes the file and confirms the audio stream exists and isn't silent. A tag in the page doesn't count as proof.
- **Licensing note.** The kit never fetches or generates music. It uses files the user supplies, and the export result reminds the agent to ask the user to confirm they may use the track.
- **Small upstream templates with sound.** Once mixing works, vendor up to four small upstream motion examples with original soundtracks and no third-party branding (candidates: `motion-ui-morph`, `motion-visual-lesson`, `motion-product-promo`), staying under the 2 MB example cap.

Not in this change: voiceover generation, text-to-speech, video clips as inputs, transparent video, and films over 60 seconds.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `motion-export`: audio tracks, the soundtrack argument, the audio decision, loudness, captions and the new checks.

## Impact

- `packages/core/src/export`: motion export (ffmpeg audio filter graph, probe for audio encoders: AAC for MP4, Opus for WebM), caption burn-in pass on the virtual clock, preflight additions.
- `packages/mcp-server`, VS Code and CLI: new export arguments.
- `packages/content`: sync allows the chosen motion examples; overlay notices.
- Docs: motion export guide, tools reference, CHANGELOG, roadmap.
