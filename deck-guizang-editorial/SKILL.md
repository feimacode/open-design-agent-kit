---
name: "od:deck:deck-guizang-editorial"
description: Guizang Editorial E-Ink Deck (Open Design) — use only when the user explicitly runs this skill
disable-model-invocation: true
argument-hint: a brief describing what to build (optional — defaults to a starting example)
---

<!-- generated:curated-entry -->

Use the Open Design skill `od:deck:deck-guizang-editorial` (Guizang Editorial E-Ink Deck).

Brief: "$ARGUMENTS", or if empty: "Use the Guizang Editorial E-Ink Deck template to turn my content into an editorial magazine x e-ink horizontal deck with 10 layouts and 5 palettes. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images."

Call `prepare_open_design_brief` (the open-design MCP server's tool) with skillId "od:deck:deck-guizang-editorial" and this brief — call `list_open_design_design_systems` first only if the user names a brand or visual direction. Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
