---
description: Swiss International Deck (OpenDesign)
mode: agent
---

Use the OpenDesign skill `od:deck:deck-swiss-international` (Swiss International Deck).

Brief: ${input:brief:Use the Swiss International Deck template to turn my content into a 16-column-grid deck with one saturated accent and 22 locked layouts. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:deck:deck-swiss-international" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
