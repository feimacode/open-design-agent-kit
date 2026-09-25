---
name: "od-prototype-social-youtube-thumbnail"
description: YouTube Thumbnail (Open Design)
mode: agent
---

Use the Open Design skill `od:prototype:social-youtube-thumbnail` (YouTube Thumbnail).

Brief: ${input:brief:Use the YouTube Thumbnail template to design a thumbnail for my video. Make the promise of the video readable in under a second: one short hook line, one strong focal subject, high contrast. Use real content from my brief and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:prototype:social-youtube-thumbnail" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
