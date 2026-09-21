---
name: "od-video-frame-light-leak-cinema"
description: Light-Leak Cinematic Frame (OpenDesign)
mode: agent
---

Use the OpenDesign skill `od:video:frame-light-leak-cinema` (Light-Leak Cinematic Frame).

Brief: ${input:brief:Use the Light-Leak Cinematic Frame template to turn my content into a cinematic opening or chapter card with film light leaks, grain, letterbox framing, and large serif type. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:video:frame-light-leak-cinema" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
