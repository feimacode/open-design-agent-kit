## 1. Audio

- [ ] 1.1 Read `<audio>` tracks (`data-start`, `data-duration`, `data-volume`, fades) and the `od-motion-audio` meta; reject sources outside the design folder
- [ ] 1.2 `audio` and `audioVolume` export arguments; music bed trimmed to the film with a default fade out
- [ ] 1.3 ffmpeg audio graph and loudness normalisation; audio encoder probing (AAC, Opus); GIF says it is silent
- [ ] 1.4 Post-export probe: audio stream present and not silent; measured loudness in the result

## 2. Captions

- [ ] 2.1 Parse SRT and WebVTT; `data-od-caption` cues in the page
- [ ] 2.2 Caption overlay drawn in the page on the virtual clock, in design-system type and colours, inside the safe area; `.vtt` sidecar; `burnCaptions: false`

## 3. Checks

- [ ] 3.1 Preflight: `no-audio-track`, `audio-clipped`, `caption-outside-safe-area`, `caption-too-fast`
- [ ] 3.2 Timestamped check images show captions

## 4. Templates and docs

- [ ] 4.1 Vendor up to four small upstream motion examples with original soundtracks and no third-party branding, under the 2 MB cap; notices
- [ ] 4.2 Tests: a film with two tracks and fades, a `required` film with no track, an SRT file, caption cues in the page
- [ ] 4.3 MCP, VS Code and CLI arguments; motion export guide, tools reference, CHANGELOG
