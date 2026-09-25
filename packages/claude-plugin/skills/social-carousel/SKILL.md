---
name: "od-prototype-social-carousel"
description: social-carousel (Open Design) — use only when the user explicitly runs this skill
disable-model-invocation: true
argument-hint: a brief describing what to build (optional — defaults to a starting example)
---

<!-- generated:curated-entry -->

Use the Open Design skill `od:prototype:social-carousel` (social-carousel).

Brief: "$ARGUMENTS", or if empty: "Design a 3-card cinematic social carousel — ‘onwards.’, ‘to the next one.’, ‘looking ahead.’. 1080×1080 squares, drop-into-Instagram ready."

Call `prepare_open_design_brief` (the open-design MCP server's tool) with skillId "od:prototype:social-carousel" and this brief — call `list_open_design_design_systems` first only if the user names a brand or visual direction. Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
