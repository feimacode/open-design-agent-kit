---
description: Write a Brand-to-Revenue Story like a Growth Strategy Lead (OpenDesign) — use only when the user explicitly runs this skill
disable-model-invocation: true
argument-hint: a brief describing what to build (optional — defaults to a starting example)
---

<!-- generated:curated-entry -->

Use the OpenDesign skill `od:deck:guizang-ppt` (Write a Brand-to-Revenue Story like a Growth Strategy Lead).

Brief: "$ARGUMENTS", or if empty: "Create \"Write a Brand-to-Revenue Story like a Growth Strategy Lead\" as a Marketing and GTM deck in the Guizang Ppt visual system. Scene: annual-marketing-plan. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce a commercial-grade slide plan, written slides, visual direction, speaker-ready structure, and critic pass against this rubric: can the plan connect creative choices to measurable growth."

Call `prepare_open_design_brief` (the open-design MCP server's tool) with skillId "od:deck:guizang-ppt" and this brief — call `list_open_design_design_systems` first only if the user names a brand or visual direction. Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
