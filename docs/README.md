# Open Design Agent Kit documentation

Open Design Agent Kit brings [Open Design](https://github.com/nexu-io/open-design)'s design skills, brand design systems and remixable examples into the coding agent you already use: GitHub Copilot Chat in VS Code, Claude Code, Codex, or any MCP-capable agent. Your agent's own model writes the design as plain files in your repo.

## Key concepts

- **Skills:** recipes for a kind of design (a deck, a dashboard, a social card). The agent picks one, or you name it. See [Generate a design](guides/generate-a-design.md).
- **Design systems:** a brand's visual language (colors, type, spacing, components). One is **active per workspace**, and every new design follows it until you switch. See [Design systems](guides/design-systems.md), especially [Specify and switch](guides/design-systems.md#specify-and-switch).
- **Artifacts:** the designs themselves: plain files in your repo, each with a small manifest. See [Artifact manifest](reference/artifact-manifest.md).

## Start here

Pick the place you work ([all getting-started pages](getting-started/README.md)):

- [VS Code (GitHub Copilot Chat)](getting-started/vscode.md)
- [Claude Code](getting-started/claude-code.md)
- [Codex CLI](getting-started/codex.md)
- [Command line and scripts](getting-started/cli.md): `init`, and exporting or rendering without an agent

## Guides

Task-by-task, for every host ([how the guides are laid out](guides/README.md)):

- [Generate a design](guides/generate-a-design.md): skills, briefs, collections of screens
- [Design systems](guides/design-systems.md): the active design system, and how to specify, switch, invent or import one
- [Remix and the gallery](guides/remix-and-gallery.md): start from a real example instead of a blank page
- [Community designs](guides/community-designs.md): the awesome-open-design catalog, and contributing your own (VS Code)
- [Preview, comment and edit](guides/preview-comments-edit.md) (VS Code)
- [Figma](guides/figma.md): frame to code, and artifact to Figma layers
- [Promote to app code](guides/promote-to-app-code.md): turn a prototype into real components
- [Social media posts](guides/social-posts.md): X, Instagram, LinkedIn, Xiaohongshu, Stories, YouTube thumbnails
- [YouTube videos](guides/youtube-video.md): HyperFrames compositions rendered to MP4
- [Export images](guides/export-images.md): PNG and JPEG, sizes, cards, file-size budgets
- [Export decks and PDFs](guides/export-decks.md): PowerPoint, deck PDF, page PDF

## Reference

[About the reference pages](reference/README.md):

- [Tools](reference/tools.md): every tool, its arguments and results
- [Prompts and commands](reference/prompts-and-commands.md): slash commands, skills, MCP prompts, VS Code commands
- [CLI](reference/cli.md): `init`, `export`, `render-video`
- [Settings and environment variables](reference/settings-and-env.md)
- [Artifact manifest](reference/artifact-manifest.md): `.artifact.json` and the `exports/` folder

## Help

- [Troubleshooting](troubleshooting.md)

## Automation

- [Social media pipeline](automation/social-pipeline.md): scripted X images and YouTube videos, CI setup

## Contributing

- [Contributing](contributing/README.md): architecture, content sync, adding skills and prompts, upstream ports, releasing
