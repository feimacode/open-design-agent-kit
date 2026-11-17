## ADDED Requirements

### Requirement: Audio Tracks

Video exports (`mp4`, `webm`) SHALL mix every `<audio>` element in the page that has a local source inside the design's folder, placed at `data-start` seconds for `data-duration` seconds (default: to the end of the source or the film), at `data-volume` (0 to 1, default 1), with optional `data-fade-in` and `data-fade-out` in seconds. `export_open_design_artifact` SHALL also accept `audio`, a workspace path laid under the whole film and trimmed to its length with a 0.5 second fade out by default, and `audioVolume`. The mix SHALL be normalised to about −14 LUFS integrated with a −1 dBTP ceiling, and the result SHALL report the measured loudness. GIF exports SHALL stay silent and say so when tracks exist.

#### Scenario: Two tracks in sync
- **WHEN** a 15 second film has a music track from 0 s at volume 0.3 and a whoosh at 4.2 s
- **THEN** the MP4 SHALL contain one audio stream with the whoosh at 4.2 s and the music faded out at the end

#### Scenario: Remote source
- **WHEN** an `<audio>` element points to an `https://` URL
- **THEN** the export SHALL skip it and warn that sound must be a local file in the design's folder

### Requirement: Audio Decision

A page MAY declare `<meta name="od-motion-audio" content="required">` or `content="none"`. With `required`, an export with no playable track SHALL fail with `no-audio-track`. With `none` or no meta and no tracks, the export SHALL be silent as before. After writing a video with audio, the system SHALL probe the file and fail the export result if the audio stream is missing or silent.

#### Scenario: Required sound missing
- **WHEN** a page declares `required` and its only `<audio>` source file doesn't exist
- **THEN** the export SHALL fail with `no-audio-track` naming the missing file

### Requirement: Captions

`export_open_design_artifact` SHALL accept `captions`, a workspace path to an SRT or WebVTT file. Pages MAY also mark caption cues with `data-od-caption`, `data-start` and `data-duration`. Captions SHALL be burned into the video in the design system's font and colours, inside the format's safe area, unless `burnCaptions: false`. The export SHALL write a `.vtt` sidecar beside the video in both cases. Video preflight SHALL warn `caption-outside-safe-area` and `caption-too-fast` (over 20 characters a second).

#### Scenario: Reel with an SRT file
- **WHEN** a 9:16 film is exported with `captions: "captions.srt"`
- **THEN** the MP4 SHALL show each cue at its time inside the story safe area, and `exports/<name>.vtt` SHALL be written

### Requirement: Supplied Sound Only

The system SHALL NOT download, generate or bundle music for a user's film. It SHALL use only files in the workspace, and an export with audio SHALL remind the agent to confirm with the user that they may use the track.

#### Scenario: Agent asks for background music
- **WHEN** a film is exported with no tracks and the brief asked for music
- **THEN** the result SHALL say that a music file must be supplied and SHALL write a silent video
