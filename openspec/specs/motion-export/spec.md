# motion-export Specification

## Purpose
Video and GIF export of animated HTML artifacts: a virtual clock that makes frame capture exact and repeatable, duration resolved from the page, ffmpeg discovered and probed like the browser (never downloaded), size budgets met by re-encoding, and timestamped captures in the visual check.
## Requirements

### Requirement: Video and GIF Export
`export_open_design_artifact` SHALL accept `format` `mp4`, `webm` and `gif` for html, mini-app and svg artifacts, with optional `fps` (1–60; default 30, or 15 for GIF), `duration` (seconds, 0.5–60) and `loop` (GIF loops forever by default). It SHALL write `exports/<name>.<ext>` at the size image export would use and report the frame count, the duration and how the duration was chosen.

#### Scenario: Logo outro as MP4
- **WHEN** the `frame-logo-outro` example is exported with `format: "mp4"`
- **THEN** an H.264 MP4 at its 1920×1080 size SHALL be written under `exports/`, and the result SHALL state its duration and frame count

### Requirement: Deterministic Frame Capture
Motion exports SHALL control time in the page with a virtual clock installed before any page script runs (covering `performance.now`, `Date.now`, `requestAnimationFrame`, `setTimeout`, `setInterval`, and CSS and Web Animations) and SHALL advance it exactly 1/fps per captured frame. Exporting the same artifact twice with the same arguments SHALL produce identical frames.

#### Scenario: Slow machine
- **WHEN** a frame takes 400 ms to capture
- **THEN** the exported video SHALL still show the animation at its authored speed with no skipped states

### Requirement: Duration Resolution
Without `duration`, the system SHALL use the sum of `data-duration` values on frame elements, else the longest finite CSS or Web animation end time, else 6 seconds when only infinite animations exist, capped at 60 seconds, and SHALL say which rule was used.

#### Scenario: HyperFrames-style storyboard
- **WHEN** a page has eight frames with `data-duration` totalling 30000 ms
- **THEN** the export SHALL be 30 seconds long and report that the duration came from `data-duration`

### Requirement: ffmpeg Discovery and Probing
The system SHALL use an explicitly configured ffmpeg (VS Code setting or `OPEN_DESIGN_FFMPEG_PATH`), else one on `PATH`, else one at well-known locations including Playwright's cache, and SHALL NOT download ffmpeg. It SHALL probe the encoders the format needs and SHALL return `no-ffmpeg` (listing where it looked) or `ffmpeg-missing-encoder` (naming the encoder and which formats the found ffmpeg can still make).

#### Scenario: Only Playwright's ffmpeg
- **WHEN** the only ffmpeg found is Playwright's VP8-only build and the format is `mp4`
- **THEN** the export SHALL return `ffmpeg-missing-encoder` saying MP4 needs H.264 and that WebM is available

### Requirement: Motion Size Budget
With `maxBytes`, video formats SHALL be re-encoded at a lower bitrate and GIFs at lower frame rates and then smaller sizes until the file fits; if none fits, the smallest result SHALL be kept with a warning stating the size and the budget.

#### Scenario: GIF for a README
- **WHEN** a GIF export is 14 MB with `maxBytes: 5000000`
- **THEN** the written GIF SHALL be at most 5,000,000 bytes or the result SHALL warn with the final size

### Requirement: Timestamped Visual Checks
`check_open_design_artifact` SHALL accept `at`, a list of up to 6 times in seconds; it SHALL capture the artifact at each time on the virtual clock and return those images labelled `t=<seconds>s`, within `maxImages`.

#### Scenario: Check the end state
- **WHEN** the agent checks an outro with `at: [0, 3, 5.5]`
- **THEN** three images labelled `t=0s`, `t=3s` and `t=5.5s` SHALL be returned
