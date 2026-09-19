---
description: Liquid Background Hero (OpenDesign)
mode: agent
---

Use the OpenDesign skill `od:video:frame-liquid-bg-hero` (Liquid Background Hero).

Brief: ${input:brief:Use the Liquid Background Hero template to turn my content into a WebGL-style fluid displacement background with a quote overlay for a video intro, landing hero, or poster. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:video:frame-liquid-bg-hero" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
