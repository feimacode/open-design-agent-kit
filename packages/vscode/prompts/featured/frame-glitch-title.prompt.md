---
name: "od-video-frame-glitch-title"
description: Glitch Title Frame (OpenDesign)
mode: agent
---

Use the OpenDesign skill `od:video:frame-glitch-title` (Glitch Title Frame).

Brief: ${input:brief:Use the Glitch Title Frame template to turn my content into a digital-glitch, chromatic-offset, data-corruption title frame for a video transition or cyberpunk hero. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:video:frame-glitch-title" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
