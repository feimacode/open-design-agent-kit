---
name: "od-video-vfx-text-cursor"
description: VFX Text Cursor (Open Design)
mode: agent
---

Use the Open Design skill `od:video:vfx-text-cursor` (VFX Text Cursor).

Brief: ${input:brief:Use the VFX Text Cursor template to turn my content into a video-intro quote reveal with cursor light trails, chromatic rays, and directional flares. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:video:vfx-text-cursor" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
