Roadmap area: Import and export (also Professional workflows)

## Why

A common motion request starts from a video someone liked: "make one like this for our launch". Today the agent can't watch a video. It guesses timing from a description, and the result has none of the reference's rhythm.

Upstream open-design added reference-video replication in v0.27 ([changelog](https://github.com/nexu-io/open-design/blob/main/docs/CHANGELOG/v0.27.0/en.md), `apps/daemon/src/media/motion-reference.ts`, Apache-2.0). It turns a video into measured facts: duration, size, frame rate, whether it has sound, shot cuts from ffmpeg's scene detection, a frame from each shot, a contact sheet and the soundtrack as a WAV. A rules file (`replicate.md`) tells the agent to build every timing from those measurements, with one rule above the rest: "measure the timeline; never estimate it". It also notes that eyeballed beat boundaries were off by more than a second in a 15-second film. After the build, a side-by-side comparison shows where the new film drifts.

The kit already discovers and probes ffmpeg for export, and has a virtual clock that can capture any moment of a design. That covers most of what's needed.

Source: motion design study, 17 November 2026, upstream review.

## What Changes

- **New tool `inspect_open_design_reference_video`** (MCP, VS Code, CLI `reference`). It takes a video file in the workspace (`.mp4`, `.mov`, `.m4v`, `.webm`, `.mkv`, up to 200 MB and 180 s). It writes `.open-design/.references/<id>/` with `facts.json` (duration, size, fps, audio, cuts in seconds), up to 24 frames (one early in each shot plus an even grid, at least 0.4 s apart), `contact.jpg`, and `audio.wav` when the video has sound. It returns the facts, the contact sheet as an image, and a `referenceId`.
- **Files only, no links.** The tool takes files the user supplies. It doesn't download from video sites. That avoids terms-of-service and rights problems, and the extra binary (`yt-dlp`) upstream uses. A link gets an answer asking the user to download and attach the file.
- **Replication rules as a craft doc.** New overlay craft doc `reference-video.md`, adapted from upstream's `replicate.md`: read the measurements first, write the beat map from the cuts, and the order of precedence (measured, then what the user said, then taste). It also covers fidelity by request. "Make the same film" rebuilds it as it is, for the user's own material. "Like this, for my brand" keeps the form and rhythm and replaces the content, logos, people and words with the user's. The brief adds it when a `referenceId` is passed.
- **The brand comes from the design system.** For "like this, for my brand", the active design system's colours, type and motion vocabulary replace the reference's, and the Motion section of the brief says so.
- **Compare with the reference.** `check_open_design_artifact` takes `referenceId`. It captures the design at the reference's cut times on the virtual clock and returns side-by-side pairs, and reports `reference-timing-drift` (warning) when the design's beat boundaries are more than 0.25 s from the reference's cuts.
- **Reuse the soundtrack only when allowed.** `audio.wav` is offered to the sound export (`add-video-sound-and-captions`) only when the user confirms they own or may use it.

Not in this change: links to video sites, motion tracking or rotoscoping, recreating live footage or real people, and editing the reference itself.

## Capabilities

### New Capabilities
- `reference-video`: the inspection tool, its output folder and limits, the craft doc, the brief hook and the comparison in the check.

### Modified Capabilities
<!-- None: the check's referenceId is specified under reference-video. -->

## Impact

- `packages/core`: new `media/referenceVideo.ts` (ffprobe-style probing through the found ffmpeg, `select='gt(scene,0.3)'` cuts, frame and contact sheet extraction, audio extraction), `checkArtifact.ts` comparison path, brief hook.
- `packages/content/local/craft/reference-video.md` and a notice for the upstream source.
- `packages/mcp-server`: tool, annotations (writes), unavailable on the hosted gateway (no binary uploads there); VS Code tool; CLI command.
- Docs: guide "start from a reference video", tools reference, CHANGELOG, roadmap.
