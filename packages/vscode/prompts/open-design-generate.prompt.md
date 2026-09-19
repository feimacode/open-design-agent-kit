---
description: Generate a new OpenDesign artifact from a brief
mode: agent
---

Generate a new design artifact using OpenDesign.

Brief: ${input:brief:What do you want to design? (e.g. "a landing page for a coffee subscription service")}

Follow the OpenDesign flow: call `list_open_design_skills` to pick a matching skill (optionally call `list_open_design_design_systems` first if a brand direction is implied by the brief), then call `prepare_open_design_brief` with the chosen skillId, optional designSystemId, and this brief. Author the returned files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
