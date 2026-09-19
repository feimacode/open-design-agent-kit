---
description: Create a custom OpenDesign design system for your own brand
mode: agent
---

Create a new custom OpenDesign design system.

Name: ${input:name:What's the brand/design system called? (e.g. "Acme Corp")}

Brief: ${input:brief:Describe the brand — colors, tone, industry, anything distinctive}

Reference website (optional): ${input:sourceUrl:A URL to extract a starting palette/fonts from, or leave blank}

Call `create_open_design_design_system` with this name, brief, and sourceUrl (omit sourceUrl if left blank). Author the returned `DESIGN.md` yourself with your own file-editing tools per the returned instructions, then call `set_active_design_system` with the returned id.
