---
name: "od-deck-ppt-keynote"
description: Keynote-style Slides (Open Design)
mode: agent
---

Use the Open Design skill `od:deck:ppt-keynote` (Keynote-style Slides).

Brief: ${input:brief:Use the Keynote-style Slides template to turn my content into Apple Keynote-quality slides with one card per screen and keyboard left/right navigation. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:deck:ppt-keynote" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
