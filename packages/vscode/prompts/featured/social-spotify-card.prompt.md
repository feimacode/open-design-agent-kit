---
name: "od-prototype-social-spotify-card"
description: Spotify Now-Playing Card (OpenDesign)
mode: agent
---

Use the OpenDesign skill `od:prototype:social-spotify-card` (Spotify Now-Playing Card).

Brief: ${input:brief:Use the Spotify Now-Playing Card template to turn my content into a Spotify Now Playing-style card with album art, progress bar, and playback controls for a video overlay or personal homepage. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:prototype:social-spotify-card" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
