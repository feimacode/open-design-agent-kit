---
name: "od:deck:ppt-keynote"
description: Keynote-style Slides (Open Design) — use only when the user explicitly runs this skill
disable-model-invocation: true
argument-hint: a brief describing what to build (optional — defaults to a starting example)
---

<!-- generated:curated-entry -->

Use the Open Design skill `od:deck:ppt-keynote` (Keynote-style Slides).

Brief: "$ARGUMENTS", or if empty: "Use the Keynote-style Slides template to turn my content into Apple Keynote-quality slides with one card per screen and keyboard left/right navigation. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images."

Call `prepare_open_design_brief` (the open-design MCP server's tool) with skillId "od:deck:ppt-keynote" and this brief — call `list_open_design_design_systems` first only if the user names a brand or visual direction. Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
