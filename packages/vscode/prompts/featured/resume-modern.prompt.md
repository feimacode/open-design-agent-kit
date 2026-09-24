---
name: "od-prototype-resume-modern"
description: Modern Resume (Open Design)
mode: agent
---

Use the Open Design skill `od:prototype:resume-modern` (Modern Resume).

Brief: ${input:brief:Use the Modern Resume template to turn my content into a modern minimal single-page A4 resume ready for print or PDF export. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:prototype:resume-modern" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
