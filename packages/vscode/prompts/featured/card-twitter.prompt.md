---
name: "od-prototype-card-twitter"
description: Twitter Share Card (Open Design)
mode: agent
---

Use the Open Design skill `od:prototype:card-twitter` (Twitter Share Card).

Brief: ${input:brief:Use the Twitter Share Card template to turn my content into a Twitter quote or data card designed to pair with a post. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:prototype:card-twitter" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
