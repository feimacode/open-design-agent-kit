## ADDED Requirements

### Requirement: Reference Video Inspection

`inspect_open_design_reference_video` SHALL take a video file inside the workspace (`.mp4`, `.mov`, `.m4v`, `.webm` or `.mkv`, at most 200 MB and 180 seconds) and write `.open-design/.references/<id>/` containing `facts.json` (duration, width, height, fps, whether it has audio, and shot cuts in seconds from scene detection at threshold 0.3), up to 24 frames at least 0.4 seconds apart (one early in each shot plus an even grid), `contact.jpg`, and `audio.wav` when the video has sound. It SHALL return the facts, the contact sheet as an image and a `referenceId`. It SHALL use the same ffmpeg discovery as motion export and SHALL NOT download ffmpeg.

#### Scenario: Three-shot promo
- **WHEN** a 15 second MP4 with hard cuts at 4.0 s and 9.5 s and a soundtrack is inspected
- **THEN** `facts.json` SHALL list cuts near 4.0 and 9.5, `hasAudio` SHALL be true, and `audio.wav` SHALL exist

#### Scenario: Too long
- **WHEN** the file is 240 seconds long
- **THEN** the tool SHALL fail and say the limit is 180 seconds

### Requirement: Files Only

The tool SHALL NOT fetch videos from links. Given a URL, it SHALL answer that the user needs to download the video and attach the file. On the hosted gateway, the tool SHALL be listed as unavailable.

#### Scenario: Video site link
- **WHEN** the tool is called with a video site URL
- **THEN** it SHALL write nothing and ask for the file

### Requirement: Replication Guidance

The content overlay SHALL provide a `reference-video` craft doc adapted from upstream open-design's `replicate.md`, credited in the notices. When `prepare_open_design_brief` receives a `referenceId`, the brief SHALL include that doc and the reference's facts. For a request to make something like the reference for the user's own brand, the brief SHALL state that the active design system's colours, type and motion vocabulary replace the reference's, and that the reference's logos, people and words are not reused unless the user asks and has the right to.

#### Scenario: Like this, for my brand
- **WHEN** a brief is prepared with a `referenceId` and the request "like this, for Pennyflow" with a Pennyflow design system active
- **THEN** the brief SHALL include the cut times and say to use Pennyflow's colours, type and motion

### Requirement: Comparison With the Reference

`check_open_design_artifact` SHALL accept `referenceId` for animated designs. It SHALL capture the design on the virtual clock at the reference's cut times, return the pairs side by side within `maxImages`, and report `reference-timing-drift` (warning) for each design beat boundary more than 0.25 seconds from the nearest reference cut. The reference's soundtrack SHALL only be passed to a sound export after the user confirms they may use it.

#### Scenario: Late second beat
- **WHEN** the reference cuts at 4.0 s and the design's second `data-duration` frame starts at 4.6 s
- **THEN** the check SHALL report `reference-timing-drift` for that beat with the 0.6 s difference
