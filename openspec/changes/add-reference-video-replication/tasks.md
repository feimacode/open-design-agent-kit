## 1. Inspection

- [ ] 1.1 `media/referenceVideo.ts`: validate file, size and duration; probe duration, size, fps and audio through the found ffmpeg
- [ ] 1.2 Cuts with scene detection; frames per shot plus grid (max 24, min 0.4 s apart); contact sheet; `audio.wav`; `facts.json`
- [ ] 1.3 `inspect_open_design_reference_video` on MCP (writes; unavailable on the gateway), VS Code and CLI; links answered with "attach the file"

## 2. Rules and brief

- [ ] 2.1 `local/craft/reference-video.md` adapted from upstream `replicate.md` (pinned commit); notice
- [ ] 2.2 Brief hook for `referenceId`: craft doc, facts, and the design system replacing the reference's look for "like this, for my brand"

## 3. Comparison

- [ ] 3.1 `referenceId` on `check_open_design_artifact`: captures at cut times, side-by-side pairs, `reference-timing-drift`
- [ ] 3.2 Soundtrack reuse only after the user confirms rights

## 4. Tests and docs

- [ ] 4.1 Fixtures: a generated test video with three hard cuts and a tone; a silent clip; a file over the limits; a link
- [ ] 4.2 Guide "start from a reference video", tools reference, CHANGELOG
