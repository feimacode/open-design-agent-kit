---
name: "od-video-frame-flowchart-sticky"
description: Sticky Flowchart Frame (OpenDesign)
mode: agent
---

Use the OpenDesign skill `od:video:frame-flowchart-sticky` (Sticky Flowchart Frame).

Brief: ${input:brief:Use the Sticky Flowchart Frame template to turn my content into a whiteboard-brainstorm frame with SVG curve connectors, sticky-note nodes, and cursor interaction. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:video:frame-flowchart-sticky" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
