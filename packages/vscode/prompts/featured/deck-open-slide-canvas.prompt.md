---
name: "od-deck-deck-open-slide-canvas"
description: Open-Slide 1920 Canvas Deck (OpenDesign)
mode: agent
---

Use the OpenDesign skill `od:deck:deck-open-slide-canvas` (Open-Slide 1920 Canvas Deck).

Brief: ${input:brief:Use the Open-Slide 1920 Canvas Deck template to turn my content into a locked 1920x1080 free-composition deck with React component-level layout. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:deck:deck-open-slide-canvas" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
