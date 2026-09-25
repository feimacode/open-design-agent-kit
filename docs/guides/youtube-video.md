# YouTube videos

Make a video as a [HyperFrames](https://github.com/heygen-com/hyperframes) composition (HTML with timing attributes and a GSAP timeline) and render it to MP4.

## Before you start

- Node.js and [FFmpeg](https://ffmpeg.org/) on the machine that renders (`ffmpeg -version` must work).
- The first render downloads the HyperFrames CLI through `npx`.

## Steps

1. Ask:

   > A 20-second YouTube intro for our v2 launch: dark background, three feature callouts, logo at the end.

   or use [`/open-design-social-post`](social-posts.md) and pick **YouTube video**.
2. The agent uses the `od:video:hyperframes` recipe and follows the brief's host override (below):
   1. scaffolds with `npx hyperframes init <artifact-dir> --non-interactive --example blank`;
   2. edits `index.html`;
   3. validates with `npx hyperframes check`;
   4. registers the artifact;
   5. checks FFmpeg;
   6. renders:

   ```bash
   npx hyperframes render <artifact-dir> --quality high --output <artifact-dir>/exports/<name>.mp4
   ```

3. It reports the MP4's path.

Defaults are 1920×1080 at 30 fps. Ask for vertical (1080×1920, for Shorts or Reels) or square if you need them.

> **From the CLI:** re-render at any time with [`render-video`](../reference/cli.md#render-video):
>
> ```bash
> npx @feimacode/open-design-agent-kit render-video .open-design/v2-intro --output .open-design/v2-intro/exports/v2-intro.mp4
> ```

## How it works

Upstream Open Design renders HyperFrames through its desktop daemon (`$OD_BIN media …`), which this project doesn't ship. The skill text is used unchanged, but [`prepare_open_design_brief`](../reference/tools.md#prepare_open_design_brief) appends a **Host override** section that takes precedence over it. The override:

- replaces every daemon step with the HyperFrames CLI steps above;
- makes the composition folder the artifact folder;
- tells the agent to stop and ask you to install FFmpeg if it's missing, rather than trying another renderer.

Other skills that depend on the daemon (such as AI image or video generation) get a notice instead, so the agent tells you those steps aren't available rather than improvising.

## What you get

```
.open-design/v2-intro/index.html          ← the composition (plus hyperframes.json, meta.json)
.open-design/v2-intro/exports/v2-intro.mp4
```

## Troubleshooting

- [FFmpeg is missing](../troubleshooting.md#ffmpeg-is-missing)
- [The HyperFrames render hangs](../troubleshooting.md#the-hyperframes-render-hangs)

## Related

[Social media posts](social-posts.md) · [Social media pipeline](../automation/social-pipeline.md)
