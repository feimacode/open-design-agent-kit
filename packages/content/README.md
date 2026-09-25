# @feimacode/open-design-agent-kit-content

The vendored [Open Design](https://github.com/nexu-io/open-design) content library — 163 skills, 114 design templates, 152 brand design systems, 167 remixable examples, and 11 craft docs — packaged as plain data, no code.

You almost certainly don't want to depend on this directly. It exists so [`@feimacode/open-design-agent-kit-mcp`](https://www.npmjs.com/package/@feimacode/open-design-agent-kit-mcp) (and the VS Code extension, and the Claude Code plugin, and the `init` CLI) can all read the exact same synced catalog instead of each vendoring their own copy.

## What's in here

```
assets/open-design/
  skills/            reusable design-task recipes (SKILL.md per entry)
  design-templates/  rendering-style catalogue entries, same shape as skills/
  design-systems/    brand-inspired visual token sets (DESIGN.md + manifest.json)
  examples/          actual rendered starting artifacts you can remix
  craft/             universal craft rules (typography, color, accessibility, anti-"AI slop")
  MANIFEST.json      which upstream release this was synced from, and when
```

## How it's kept up to date

This content is synced from the official public [open-design](https://github.com/nexu-io/open-design) repo, pinned to a tagged release (not `main`, for reproducibility), then this project's own additions (a few skills and prompts) are layered on top from `local/`. Nothing under `assets/` is hand-edited. See [Content sync](https://github.com/feimacode/open-design-agent-kit/blob/main/docs/contributing/content-sync.md).

## License

MIT for this package's own code (there is none beyond the sync script). The vendored content itself is synced from [open-design](https://github.com/nexu-io/open-design), licensed Apache-2.0.
