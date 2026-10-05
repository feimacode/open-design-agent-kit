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
| X single image | 1600×900 | `od:prototype:card-twitter` | `preset: "x-image"` |
| X post mock (for a video overlay or quote) | card element | `od:prototype:social-x-post-card` | `selector: "[data-od-card]"`, `maxBytes: 5000000` |
| Square carousel (Instagram / LinkedIn) | 1080×1080 per card | `od:prototype:social-carousel` | `preset: "ig-square"` |
| Instagram portrait | 1080×1350 | `od:prototype:poster-hero` | `preset: "ig-portrait"` |
| Story / Reels / TikTok cover | 1080×1920 | `od:prototype:poster-hero` | `preset: "story"` |
| Xiaohongshu cards | 1080×1440 per card | `od:prototype:card-xiaohongshu` | `preset: "xhs-card"` |
| YouTube thumbnail | 1280×720 | `od:prototype:social-youtube-thumbnail` | `preset: "yt-thumbnail"` |
| YouTube video | 1920×1080 MP4 | `od:video:hyperframes` | MP4 via the HyperFrames CLI (see step 4) |

A preset fills in the canvas size, `selector: "[data-od-card]"` and the platform's upload limit (X 5 MB, Instagram 8 MB, YouTube thumbnail 2 MB).

For several platforms at once, run steps 2–4 once per format and keep each one as its own artifact.

## 2. Generate

Call `prepare_open_design_brief` with the row's `skillId`, the brief, and `format` set to the row's preset id (leave it out for the X post mock and YouTube video). Call `list_open_design_design_systems` first only if the user names a brand or visual direction. For the X post mock, say in the brief that it is one card element.

Author the files yourself with your own file-editing tools, following the returned instructions, and add these rules for social posts:

- Each card or canvas is a fixed-size element at exactly the table's size with `overflow: hidden`, and carries a `data-od-card` attribute. For multi-card formats, stack the cards vertically in one HTML file, one `data-od-card` element per card.
- Use real copy from the brief, with no lorem ipsum. Keep text inside a 48px safe margin, and make the hook readable at thumbnail size.
- No external image URLs unless the user supplied them.
- No emoji as key visuals. They render from the exporting machine's fonts and can come out as empty boxes. Draw icons and subjects as inline SVG.

## 3. Register

Call `register_open_design_artifact` with the entry path, kind `html`, a title, `sourceSkillId` set to the row's `skillId`, and the same `format` you passed to the brief, so the export can find the right size.

## 4. Export

- **Image formats**: call `export_open_design_artifact` with the entry path and the row's export arguments. If its preflight reports errors (text cut off, a card that isn't the canvas size) or it returns warnings (failed fonts or images, over budget), fix the artifact and export again. To check without writing files, add `checkOnly: true`.
- **YouTube video**: follow the brief's "Host override" section. Render with `npx hyperframes render … --output <artifact-dir>/exports/<name>.mp4`, and check `ffmpeg -version` first.

## 5. Report

List each exported file's path, pixel size, and file size, and remind the user of the post's copy (caption and hashtags) if you wrote any. Don't post anything anywhere yourself.
