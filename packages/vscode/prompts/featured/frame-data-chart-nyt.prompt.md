---
name: "od-video-frame-data-chart-nyt"
description: NYT-Style Data Chart Frame (Open Design)
mode: agent
---

Use the Open Design skill `od:video:frame-data-chart-nyt` (NYT-Style Data Chart Frame).

Brief: ${input:brief:Use the NYT-Style Data Chart Frame template to turn my content into a frame with NYT-newsroom typography, staggered reveal animation, and editorial-grade charts. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:video:frame-data-chart-nyt" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
