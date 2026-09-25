# Social media pipeline

A recipe for producing X images and YouTube videos with scripts: an agent creates the design once, and scripts export or render it as often as needed. Posting itself is out of scope; this pipeline hands your posting tool finished files.

## The shape

```
brief ──► agent (Claude Code / Codex / Copilot)           ──► .open-design/<post>/<post>.html  (+ .artifact.json)
             uses /open-design-social-post or asks plainly
                                                               │
          scripts / CI                                         ▼
             open-design-agent-kit export … --max-bytes …  ──► .open-design/<post>/exports/<post>.png
             open-design-agent-kit render-video …          ──► .open-design/<video>/exports/<video>.mp4
                                                               │
                                                               ▼
                                                      your posting tool (X API, YouTube upload, …)
```

- **Design once with an agent.** Use the [social-post flow](../guides/social-posts.md) so each artifact is registered with the right `sourceSkillId`; that's what makes exports come out at the right size. Commit the `.open-design/` folder.
- **Export from scripts.** The CLI calls the same export code as the agent's tool. It prints each written path on stdout and exits non-zero on failure.

## X images

```bash
# One card, kept under X's 5 MB image limit
npx @feimacode/open-design-agent-kit export .open-design/v2-launch/v2-launch.html \
  --selector "[data-od-card]" --max-bytes 5000000

# Capture the paths for the next step
mapfile -t files < <(npx @feimacode/open-design-agent-kit export .open-design/v2-launch/v2-launch.html \
  --selector "[data-od-card]" --max-bytes 5000000)
printf '%s\n' "${files[@]}"
```

A carousel gives several paths, in card order.

## YouTube thumbnail and video

```bash
npx @feimacode/open-design-agent-kit export .open-design/v2-thumb/v2-thumb.html \
  --width 1280 --height 720 --selector "[data-od-card]" --max-bytes 2000000

npx @feimacode/open-design-agent-kit render-video .open-design/v2-intro \
  --output .open-design/v2-intro/exports/v2-intro.mp4
```

## Updating copy without an agent

Designs are plain HTML. A script can change text (a date, a price, a headline) in the artifact file and re-run `export`, with no agent needed. Keep variable text in clearly marked elements (e.g. `data-field="headline"`) so scripts can find it reliably.

## CI setup

The runner needs Node.js 18 or later, a Chromium-family browser for `export`, and FFmpeg for `render-video`. On GitHub Actions (Ubuntu):

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- name: Headless browser for export
  run: npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer
- name: FFmpeg and fonts for video and exports
  run: sudo apt-get update && sudo apt-get install -y ffmpeg fonts-noto-color-emoji fonts-noto-cjk
- name: Export
  run: npx @feimacode/open-design-agent-kit export .open-design/v2-launch/v2-launch.html --selector "[data-od-card]" --max-bytes 5000000
```

- The exporter finds the browser in `~/.cache/puppeteer` by itself; set [`OPEN_DESIGN_BROWSER_PATH`](../reference/settings-and-env.md#open_design_browser_path) to use a specific one.
- Installing emoji and CJK fonts avoids [empty boxes](../troubleshooting.md#emoji-show-as-empty-boxes) and [fallback fonts](../troubleshooting.md#fonts-look-wrong-in-exports) on a bare runner.
- A render hanging in a sandboxed environment is covered in [Troubleshooting](../troubleshooting.md#the-hyperframes-render-hangs); CI runners aren't sandboxed that way.

## Related

[Social media posts](../guides/social-posts.md) · [CLI reference](../reference/cli.md)
