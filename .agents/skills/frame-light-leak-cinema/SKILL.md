---
name: frame-light-leak-cinema
description: Light-Leak Cinematic Frame (OpenDesign) — use only when explicitly invoked, not for general design requests
---

<!-- generated:open-design-agent-kit -->

Use the OpenDesign skill `od:video:frame-light-leak-cinema` (Light-Leak Cinematic Frame).

Treat the rest of the user's message as the brief. If nothing more specific was given, use: "Use the Light-Leak Cinematic Frame template to turn my content into a cinematic opening or chapter card with film light leaks, grain, letterbox framing, and large serif type. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images."

Call `prepare_open_design_brief` (the open-design MCP server's tool) with skillId "od:video:frame-light-leak-cinema" and this brief — call `list_open_design_design_systems` first only if the user names a brand or visual direction. Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
