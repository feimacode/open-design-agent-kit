---
name: "open-design-social-post"
description: Design a social media post (X, Instagram, LinkedIn, Xiaohongshu, Stories/Reels, YouTube thumbnail or video) and export upload-ready files
mode: agent
---

Design a social media post with Open Design and export files that are ready to upload.

Brief: ${input:brief:What should the post say, and for which platform?}

## 1. Pick the platform and format

If the brief names a platform or format, use it. Otherwise ask the user to pick one of the rows below before doing anything else. Don't guess.

| Format | Canvas | skillId | Export |
|---|---|---|---|
| X single image | 1600×900 | `od:prototype:card-twitter` | `selector: "[data-od-card]"`, `maxBytes: 5000000` |
| X post mock (for a video overlay or quote) | card element | `od:prototype:social-x-post-card` | `selector: "[data-od-card]"`, `maxBytes: 5000000` |
| Square carousel (Instagram / LinkedIn) | 1080×1080 per card | `od:prototype:social-carousel` | `selector: "[data-od-card]"`, `maxBytes: 8000000` |
| Instagram portrait | 1080×1350 | `od:prototype:poster-hero` | `width: 1080, height: 1350`, `selector: "[data-od-card]"`, `maxBytes: 8000000` |
| Story / Reels / TikTok cover | 1080×1920 | `od:prototype:poster-hero` | `width: 1080, height: 1920`, `selector: "[data-od-card]"`, `maxBytes: 8000000` |
| Xiaohongshu cards | 1080×1440 per card | `od:prototype:card-xiaohongshu` | `selector: "[data-od-card]"` |
| YouTube thumbnail | 1280×720 | `od:prototype:social-youtube-thumbnail` | `width: 1280, height: 720`, `selector: "[data-od-card]"`, `maxBytes: 2000000` |
| YouTube video | 1920×1080 MP4 | `od:video:hyperframes` | MP4 via the HyperFrames CLI (see step 4) |

For several platforms at once, run steps 2–4 once per format and keep each one as its own artifact.

## 2. Generate

Call `prepare_open_design_brief` with the row's `skillId` and the brief. Call `list_open_design_design_systems` first only if the user names a brand or visual direction. In the brief you pass, say the exact canvas size from the table.

Author the files yourself with your own file-editing tools, following the returned instructions, and add these rules for social posts:

- Each card or canvas is a fixed-size element at exactly the table's size with `overflow: hidden`, and carries a `data-od-card` attribute. For multi-card formats, stack the cards vertically in one HTML file, one `data-od-card` element per card.
- Use real copy from the brief, with no lorem ipsum. Keep text inside a 48px safe margin, and make the hook readable at thumbnail size.
- No external image URLs unless the user supplied them.
- No emoji as key visuals. They render from the exporting machine's fonts and can come out as empty boxes. Draw icons and subjects as inline SVG.

## 3. Register

Call `register_open_design_artifact` with the entry path, kind `html`, a title, and `sourceSkillId` set to the row's `skillId`, so the export can find the right size.

## 4. Export

- **Image formats**: call `export_open_design_artifact` with the entry path and the row's export arguments. If it returns warnings (failed fonts or images, over budget), fix the artifact and export again.
- **YouTube video**: follow the brief's "Host override" section. Render with `npx hyperframes render … --output <artifact-dir>/exports/<name>.mp4`, and check `ffmpeg -version` first.

## 5. Report

List each exported file's path, pixel size, and file size, and remind the user of the post's copy (caption and hashtags) if you wrote any. Don't post anything anywhere yourself.
