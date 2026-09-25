---
name: "od-prototype-social-youtube-thumbnail"
description: YouTube Thumbnail (Open Design) — use only when the user explicitly runs this skill
disable-model-invocation: true
argument-hint: a brief describing what to build (optional — defaults to a starting example)
---

<!-- generated:curated-entry -->

Use the Open Design skill `od:prototype:social-youtube-thumbnail` (YouTube Thumbnail).

Brief: "$ARGUMENTS", or if empty: "Use the YouTube Thumbnail template to design a thumbnail for my video. Make the promise of the video readable in under a second: one short hook line, one strong focal subject, high contrast. Use real content from my brief and avoid lorem ipsum or placeholder images."

Call `prepare_open_design_brief` (the open-design MCP server's tool) with skillId "od:prototype:social-youtube-thumbnail" and this brief — call `list_open_design_design_systems` first only if the user names a brand or visual direction. Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
