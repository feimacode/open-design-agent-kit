---
name: "od-prototype-social-x-post-card"
description: X / Twitter Post Card (OpenDesign)
mode: agent
---

Use the OpenDesign skill `od:prototype:social-x-post-card` (X / Twitter Post Card).

Brief: ${input:brief:Use the X / Twitter Post Card template to turn my content into a realistic X post card with engagement metrics for a video overlay or shareable image card. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:prototype:social-x-post-card" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
