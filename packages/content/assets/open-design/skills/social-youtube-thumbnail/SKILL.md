---
name: social-youtube-thumbnail
zh_name: "YouTube 缩略图"
en_name: "YouTube Thumbnail"
emoji: "▶️"
description: "High-contrast 1280×720 YouTube video thumbnail that stays legible at small sizes, keeps the timestamp corner clear, and exports under YouTube's 2 MB limit."
zh_description: "1280×720 高对比 YouTube 缩略图, 小尺寸可读, 避开右下角时长标记, 导出小于 2 MB"
en_description: "High-contrast 1280×720 YouTube video thumbnail that stays legible at small sizes, keeps the timestamp corner clear, and exports under YouTube's 2 MB limit."
category: card
scenario: marketing
aspect_hint: "1280×720 (16:9)"
featured: 45
tags: ["youtube", "thumbnail", "social", "video", "cover", "封面"]
od:
  mode: prototype
  surface: web
  platform: desktop
  scenario: marketing
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "Use the YouTube Thumbnail template to design a thumbnail for my video. Make the promise of the video readable in under a second: one short hook line, one strong focal subject, high contrast. Use real content from my brief and avoid lorem ipsum or placeholder images."
---

# YouTube Thumbnail

**Intent.** A single, fixed-size 1280×720 frame that sells one video. It is judged at postage-stamp size in a crowded feed, so it must communicate its hook in under a second.

## Canvas

- The root element is exactly `width: 1280px; height: 720px; overflow: hidden;`. Nothing may extend past it. Put `data-od-card` on the root so the export crops to it exactly.
- Single self-contained HTML file. Inline SVG for icons and shapes. Web fonts only from Google Fonts. No external image URLs unless the user supplied the image. Otherwise build the subject from inline SVG, CSS gradients and shapes, or typography. **Don't use emoji as the subject or any key visual.** Emoji come from the exporting machine's fonts and show as empty boxes where none is installed (common on Linux and CI).

## Composition

- **One focal subject** occupying 35–55% of the frame (a face or reaction, the product, a big number, or an object drawn in inline SVG), placed on a third line, never dead center with text on top of it.
- **One hook line, 2–5 words**, set at 96–160px display weight (800–900) with tight leading (0.95–1.05). It must *add* to the video title, not repeat it. At most 2 lines.
- An optional **small secondary tag** (a pill or badge, 28–40px): "NEW", "v2", "vs", "3 MIN", a price, a stat.
- **High contrast**: a text/background contrast ratio of at least 7:1 on the hook. Use a 6–12px stroke or a hard drop shadow (`text-shadow: 0 6px 0 rgba(0,0,0,.35)`) when text sits over imagery.
- 2–3 saturated colors at most, plus black or white. One accent color, used once or twice.

## Safe areas (hard rules)

- **Bottom-right 240×90px is reserved**: YouTube overlays the video duration there. No text, faces, or key detail in it.
- Keep all text at least 48px from every edge.
- Don't put anything important in the bottom 12% across the full width either. Hover progress bars and "watch later" overlays cover it.

## Legibility check

Before finishing, mentally scale the frame to **168×94px** (the smallest feed size). The hook must still be readable, and the subject still recognizable. If the hook is over 5 words or under ~90px, cut words, not size.

## Brand and design system

If an active design system is present, take its accent color and display typeface, but keep the thumbnail's contrast and size rules above. Thumbnails always outrank brand subtlety.

## Export

The file must upload under **2 MB**. After registering, export with `export_open_design_artifact` using `width: 1280`, `height: 720`, `selector: "[data-od-card]"`, and `maxBytes: 2000000`. The tool switches to JPEG automatically if a PNG would be too large.
