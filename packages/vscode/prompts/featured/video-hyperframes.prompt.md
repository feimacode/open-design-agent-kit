---
name: "od-video-video-hyperframes"
description: Hyperframes Video (Open Design)
mode: agent
---

Use the Open Design skill `od:video:video-hyperframes` (Hyperframes Video).

Brief: ${input:brief:Use the Hyperframes Video template to turn my content into a Hyperframes / Remotion-compatible continuous frame animation with autoplay support. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:video:video-hyperframes" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
