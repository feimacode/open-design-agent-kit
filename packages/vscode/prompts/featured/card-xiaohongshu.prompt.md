---
name: "od-prototype-card-xiaohongshu"
description: Xiaohongshu Card (OpenDesign)
mode: agent
---

Use the OpenDesign skill `od:prototype:card-xiaohongshu` (Xiaohongshu Card).

Brief: ${input:brief:Use the Xiaohongshu Card template to turn my content into a Xiaohongshu-style swipeable knowledge-card carousel. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:prototype:card-xiaohongshu" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
