---
name: "od-prototype-article-magazine"
description: Magazine Article (OpenDesign)
mode: agent
---

Use the OpenDesign skill `od:prototype:article-magazine` (Magazine Article).

Brief: ${input:brief:Use the Magazine Article template to turn my content into a Huashu / huashu-md-html-inspired long-form HTML essay. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:prototype:article-magazine" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
