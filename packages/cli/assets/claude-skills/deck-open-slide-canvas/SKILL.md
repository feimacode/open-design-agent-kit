---
name: "od-deck-deck-open-slide-canvas"
description: Open-Slide 1920 Canvas Deck (Open Design) — use only when the user explicitly runs this skill
disable-model-invocation: true
argument-hint: a brief describing what to build (optional — defaults to a starting example)
---

<!-- generated:curated-entry -->

Use the Open Design skill `od:deck:deck-open-slide-canvas` (Open-Slide 1920 Canvas Deck).

Brief: "$ARGUMENTS", or if empty: "Use the Open-Slide 1920 Canvas Deck template to turn my content into a locked 1920x1080 free-composition deck with React component-level layout. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images."

Call `prepare_open_design_brief` (the open-design MCP server's tool) with skillId "od:deck:deck-open-slide-canvas" and this brief — call `list_open_design_design_systems` first only if the user names a brand or visual direction. Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
