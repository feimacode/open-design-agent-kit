---
name: "od-prototype-mockup-device-3d"
description: Device 3D Showcase (OpenDesign)
mode: agent
---

Use the OpenDesign skill `od:prototype:mockup-device-3d` (Device 3D Showcase).

Brief: ${input:brief:Use the Device 3D Showcase template to turn my content into a static iPhone and MacBook 3D-style showcase with real HTML embedded on the screens. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:prototype:mockup-device-3d" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
