---
name: "od-video-frame-macos-notification"
description: macOS Notification Banner (Open Design)
mode: agent
---

Use the Open Design skill `od:video:frame-macos-notification` (macOS Notification Banner).

Brief: ${input:brief:Use the macOS Notification Banner template to turn my content into a realistic macOS notification banner for a video overlay or product teaser. Preserve the template's visual signature, use real content and data, and avoid lorem ipsum or placeholder images.}

Call `prepare_open_design_brief` with skillId "od:video:frame-macos-notification" and this brief (call `list_open_design_design_systems` first only if the user names a brand or visual direction). Author the files yourself with your own file-editing tools per the returned instructions, then call `register_open_design_artifact`.
