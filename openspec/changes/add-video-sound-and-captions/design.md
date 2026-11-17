## Context

The motion exporter steps a virtual clock one frame at a time and pipes frames to an ffmpeg it discovered and probed. `<audio>` elements are paused by the clock today and ignored. ffmpeg can mix and filter audio in the same encode.

## Goals / Non-Goals

**Goals:** a film with music or sound effects comes out of one export call, in sync; captions are readable and inside the safe area; upstream motion markup works unchanged.

**Non-Goals:** an audio editor, beat detection, generated music or speech, longer films.

## Decisions

1. **Upstream's markup, not a new one.** `data-start`, `data-duration`, `data-volume` on `<audio>` and the `od-motion-audio` meta match upstream open-design. Templates move across without edits.
2. **Mix in ffmpeg after capture.** Frames are captured silently as now. Then one ffmpeg pass muxes the video with an audio graph built from the tracks (`atrim`, `adelay`, `afade`, `volume`, `amix`, `loudnorm`). The page's audio clock is never used, so the render stays deterministic.
3. **Captions on the virtual clock.** Burned-in captions are drawn in the page as an overlay layer before capture, not by ffmpeg's subtitle filter. That way they use the design system's web fonts and the same safe-area rules as the rest of the design, and the timestamped check can see them.
4. **Proof by probe.** After writing, `ffprobe`-style probing via the found ffmpeg reads the streams and runs `volumedetect`. A film declared `required` with a silent track fails.

## Risks / Trade-offs

- [The found ffmpeg lacks AAC or Opus] → the probe reports `ffmpeg-missing-encoder` for audio as for video, and the export can still be written silent if the user agrees.
- [Licensed music] → the kit only uses supplied files and asks the user to confirm rights.
