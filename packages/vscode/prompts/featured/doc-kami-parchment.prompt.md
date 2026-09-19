---
description: Kami Parchment Document (OpenDesign)
mode: agent
---

Use the OpenDesign skill `od:prototype:doc-kami-parchment` (Kami Parchment Document).

Brief: ${input:brief:Use the Kami Parchment Document template to turn my content into a warm parchment document with monochrome ink-blue accents, one serif family, and editorial-grade typography. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:prototype:doc-kami-parchment" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
