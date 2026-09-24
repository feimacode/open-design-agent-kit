---
name: "od-deck-deck-guizang-editorial"
description: Guizang Editorial E-Ink Deck (Open Design)
mode: agent
---

Use the Open Design skill `od:deck:deck-guizang-editorial` (Guizang Editorial E-Ink Deck).

Brief: ${input:brief:Use the Guizang Editorial E-Ink Deck template to turn my content into an editorial magazine x e-ink horizontal deck with 10 layouts and 5 palettes. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:deck:deck-guizang-editorial" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
