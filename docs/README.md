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
- [Explore design directions](guides/explore-directions.md): 2–4 different sketches side by side, then build out the one you pick
- [Turn a document into a deck](guides/deck-from-a-document.md): reports, spreadsheets, PDFs or repo files to slides, storyline first, numbers checked
- [Diagrams of your code](guides/diagrams.md): architecture and dependency diagrams drawn from the repo, laid out automatically
- [3D objects and product shots](guides/3d-objects.md): a lit three.js scene, exported as a still, a transparent cut-out or a turntable video
- [Engineering documents](guides/engineering-docs.md): RFCs, ADRs, postmortems, PR explainers and changelog pages grounded in git, and a folder of Markdown docs as designed pages
- [Design systems](guides/design-systems.md): the active design system, and how to specify, switch, invent or import one
- [Remix and the gallery](guides/remix-and-gallery.md): start from a real example instead of a blank page
- [Community designs](guides/community-designs.md): the awesome-open-design catalog, and contributing your own (VS Code)
- [Preview, comment and edit](guides/preview-comments-edit.md) (VS Code)
- [Figma](guides/figma.md): frame to code, and artifact to Figma layers
- [Promote to app code](guides/promote-to-app-code.md): turn a prototype into real components
- [Social media posts](guides/social-posts.md): X, Instagram, LinkedIn, Xiaohongshu, Stories, YouTube thumbnails
- [HTML email](guides/html-email.md): newsletters and launch emails that render in real inboxes, ready to paste into your email tool
- [Paste into WeChat, Notion and newsletters](guides/paste-html.md): HTML that keeps its look when pasted into another editor
- [Posters and print](guides/posters.md): print-ready PDFs with bleed, preflight checks, real QR codes, other sizes, and one per spreadsheet row
- [Run a campaign](guides/campaigns.md): one master design in every channel size and language, with a campaign sheet
- [YouTube videos](guides/youtube-video.md): HyperFrames compositions rendered to MP4
- [Export images](guides/export-images.md): PNG and JPEG, sizes, cards, file-size budgets
- [Export decks and PDFs](guides/export-decks.md): PowerPoint, deck PDF, page PDF
- [Export animations](guides/export-animations.md): MP4, WebM and GIF, frame-exact
- [Share and publish](guides/share-and-publish.md): one HTML file, a temporary link, or your own Netlify, Vercel, Cloudflare or GitHub Pages
- [Connect other services](guides/integrations.md): let the agent use Canva, Figma, Notion, Google Drive, Slack or a posting service directly, with your consent

## Reference

[About the reference pages](reference/README.md):

- [Tools](reference/tools.md): every tool, its arguments and results
- [Prompts and commands](reference/prompts-and-commands.md): slash commands, skills, MCP prompts, VS Code commands
- [CLI](reference/cli.md): `init`, `export`, `check`, `render-video`
- [Settings and environment variables](reference/settings-and-env.md)
- [Artifact manifest](reference/artifact-manifest.md): `.artifact.json` and the `exports/` folder

## Help

- [Troubleshooting](troubleshooting.md)

## Automation

- [Social media pipeline](automation/social-pipeline.md): scripted X images and YouTube videos, CI setup

## Contributing

- [Contributing](contributing/README.md): architecture, content sync, adding skills and prompts, upstream ports, releasing
