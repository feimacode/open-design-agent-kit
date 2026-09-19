---
description: Reddit Post Card (OpenDesign)
mode: agent
---

Use the OpenDesign skill `od:prototype:social-reddit-card` (Reddit Post Card).

Brief: ${input:brief:Use the Reddit Post Card template to turn my content into a realistic Reddit post card with vote rail and comment count for a video overlay or story share. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:prototype:social-reddit-card" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
