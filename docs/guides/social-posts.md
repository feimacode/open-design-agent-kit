# Social media posts

Design a post for a specific platform and get files that are ready to upload: the right canvas size, one image per card for carousels, and under the platform's file-size limit.

## Before you start

- An installed Chrome, Edge or Chromium, for the export step ([why](export-images.md#before-you-start)).
- For YouTube videos: [FFmpeg](https://ffmpeg.org/). See [YouTube videos](youtube-video.md).

## Start

> **In VS Code:** `/open-design-social-post An X post announcing our v2 launch`

> **In Claude Code / Codex:** just ask ("make an Instagram carousel about our launch"). The `open-design-social-post` skill loads by itself for social-post requests. You can also invoke it explicitly: `/open-design:open-design-social-post` (plugin) or `/open-design-social-post` (`init`) in Claude Code, or the `open-design-social-post` skill in Codex.

If you don't say which platform, the agent asks before doing anything.

## Platforms

| Format | Canvas | Recipe (skillId) | Export |
|---|---|---|---|
| X single image | 1600×900 | `od:prototype:card-twitter` | PNG, under 5 MB |
| X post mock (for a video overlay or quote) | card | `od:prototype:social-x-post-card` | PNG, under 5 MB |
| Square carousel (Instagram / LinkedIn) | 1080×1080 per card | `od:prototype:social-carousel` | one PNG per card, under 8 MB each |
| Instagram portrait | 1080×1350 | `od:prototype:poster-hero` | PNG, under 8 MB |
| Story / Reels / TikTok cover | 1080×1920 | `od:prototype:poster-hero` | PNG, under 8 MB |
| Xiaohongshu cards | 1080×1440 per card | `od:prototype:card-xiaohongshu` | one PNG per card |
| YouTube thumbnail | 1280×720 | `od:prototype:social-youtube-thumbnail` | PNG or JPEG, under 2 MB |
| YouTube video | 1920×1080 MP4 | `od:video:hyperframes` | [MP4 via HyperFrames](youtube-video.md) |

For several platforms, the agent makes one artifact per format.

## How it works

1. **Generate:** the agent prepares a brief with the recipe for your platform and writes the HTML. Each card is a fixed-size element at exactly the canvas size, marked with a `data-od-card` attribute, with copy taken from your brief.
2. **Register:** the artifact is registered with `sourceSkillId` set, so export knows the canvas size.
3. **Export:** [`export_open_design_artifact`](../reference/tools.md#export_open_design_artifact) with `selector: "[data-od-card]"` and the platform's `maxBytes`. Carousels come out as `<name>-01.png`, `<name>-02.png`…; a single card keeps the plain `<name>.png`. A file over the limit is re-encoded as JPEG. See [Export images](export-images.md).
4. **Report:** the agent lists each file's path, pixel size and file size, plus the caption and hashtags if it wrote any. It never posts anything itself.

## Tips

- **Use inline SVG for icons and key visuals, not emoji.** Emoji are drawn from the exporting machine's fonts, and many Linux and CI machines have none, which leaves [empty boxes](../troubleshooting.md#emoji-show-as-empty-boxes).
- **YouTube thumbnails:** keep the bottom-right corner (about 240×90 px) clear, because YouTube draws the video length there. Keep the hook to 2–5 words and check it's still readable at 168×94 px. The `social-youtube-thumbnail` recipe enforces this.
- **Re-exporting** after an edit just overwrites the files in `exports/`.

## What you get

```
.open-design/v2-launch/v2-launch.html
.open-design/v2-launch/exports/v2-launch.png
```

## Troubleshooting

- [No Chrome, Edge, or Chromium browser was found](../troubleshooting.md#no-chrome-edge-or-chromium-browser-was-found)
- [Emoji show as empty boxes](../troubleshooting.md#emoji-show-as-empty-boxes)
- [Fonts look wrong in exports](../troubleshooting.md#fonts-look-wrong-in-exports)
- [File is over the byte budget](../troubleshooting.md#file-is-over-the-byte-budget)

## Related

[Export images](export-images.md) · [YouTube videos](youtube-video.md) · [Social media pipeline](../automation/social-pipeline.md)
