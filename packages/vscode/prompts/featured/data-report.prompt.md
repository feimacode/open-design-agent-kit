---
name: "od-prototype-data-report"
description: Data Visualization Report (OpenDesign)
mode: agent
---

Use the OpenDesign skill `od:prototype:data-report` (Data Visualization Report).

Brief: ${input:brief:Use the Data Visualization Report template to turn my CSV, Excel, or JSON data into a polished visual report page. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:prototype:data-report" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
