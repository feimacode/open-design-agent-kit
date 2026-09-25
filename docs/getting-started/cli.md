# Command line and scripts

`@feimacode/open-design-agent-kit` is a small CLI for three jobs. Nothing needs installing; run it with `npx` (Node.js 18 or later).

## Set up a project for Claude Code or Codex

```bash
npx @feimacode/open-design-agent-kit init            # asks which agents
npx @feimacode/open-design-agent-kit init --tools all
```

This writes the skills and registers the MCP server for the agents you pick. See [Claude Code](claude-code.md), [Codex](codex.md) and [`init`](../reference/cli.md#init).

## Export an artifact without an agent

Once a design exists and is registered (an agent made it, or you remixed one), scripts can export it again at any time:

```bash
npx @feimacode/open-design-agent-kit export .open-design/launch/launch.html --max-bytes 5000000
npx @feimacode/open-design-agent-kit export .open-design/pitch/pitch.html --format pptx
```

Each written path is printed on stdout, so the command slots into a pipeline. This needs an installed Chrome, Edge or Chromium. See [`export`](../reference/cli.md#export).

## Render a HyperFrames video

```bash
npx @feimacode/open-design-agent-kit render-video .open-design/promo --output .open-design/promo/exports/promo.mp4
```

Needs [FFmpeg](https://ffmpeg.org/). See [`render-video`](../reference/cli.md#render-video) and [YouTube videos](../guides/youtube-video.md).

## Next

- [Social media pipeline](../automation/social-pipeline.md): scripted X images and YouTube videos, CI setup
- [CLI reference](../reference/cli.md)
