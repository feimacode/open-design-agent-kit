## Context

The kit finds and probes ffmpeg for motion export and never downloads it. The virtual clock can capture a design at any time. Upstream's implementation uses `@ffmpeg-installer/ffmpeg`, `yt-dlp` for links, and an egress proxy; the kit uses none of these.

## Goals / Non-Goals

**Goals:** the agent builds motion from measured timing; the person can see where the new film differs from the reference; the kit doesn't help copy other people's work into someone else's brand without their say.

**Non-Goals:** links, footage generation, frame-perfect cloning of live action.

## Decisions

1. **Same measurements as upstream, our ffmpeg.** Scene threshold 0.3, at most 24 frames, at least 0.4 s apart, limits of 200 MB and 180 s, matching upstream so its rules doc stays true. Probing reuses the export's ffmpeg discovery; a missing ffmpeg returns the same `no-ffmpeg` error.
2. **Files only.** Upstream fetches links with `yt-dlp` behind an egress proxy. The kit is installed in many hosts with different network policies, and downloading from video sites raises rights and terms problems. Users attach the file instead.
3. **Comparison at cut times.** The reference's cuts are the moments that matter, so the check captures the design at the same times instead of an even grid. Drift is reported against the design's own beat boundaries (`data-duration` frames or animation starts).
4. **Fidelity by request, with the brand from the design system.** The default for "like this" is adaptation. Exact replication is for the user's own material, and the craft doc says to keep third-party logos, people and words only when the user asks and has the right to.

## Risks / Trade-offs

- [Scene detection misses cuts inside one shot] → the craft doc says frames are the evidence and cuts a hint, and shows how to grab one more frame.
- [Large files in the workspace] → the reference folder is under `.open-design/` and can be cleaned with the existing cleanup.
