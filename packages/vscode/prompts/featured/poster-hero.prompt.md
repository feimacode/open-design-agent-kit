---
name: "od-prototype-poster-hero"
description: Marketing Poster (Open Design)
mode: agent
---

Use the Open Design skill `od:prototype:poster-hero` (Marketing Poster).

Brief: ${input:brief:Use the Marketing Poster template to turn my content into a vertical poster or Moments-style share image with strong visual impact. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:prototype:poster-hero" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
