## Why

Iven tested "make an A3 poster for a community seed swap, check it, export a PDF" in the GitHub Copilot app, claude.ai chat and Claude Desktop's Code tab (25 Nov 2026). In all three the final reply named only the PDF's folder and print details: the design's HTML file wasn't linked anywhere, and nothing said how to look at the design. In Copilot and claude.ai the HTML never appeared at all, and in the Code tab it showed only inside an expanded tool step.

He also asked whether Claude surfaces could put designs straight into Claude artifacts and let the user choose. The decision (same thread): offer the artifact as an option instead of publishing it silently, and don't ask before work starts.

## What Changes

- **A Files list at the end.** The shared voice rules (and so every skill and the VS Code instructions) tell the agent to close a finished design, and every export, with a short **Files** list: the design file first, then each exported file. Where the host makes paths clickable (Claude Code, Claude Desktop's Code tab, VS Code, GitHub Copilot) each is a Markdown link; elsewhere the folder is named in plain words. Never a `file://` link.
- **One line on where to look, only if it lasts.** The design's Claude artifact link; in the Code tab, that the link opens in the Browser pane; in Desktop Chat, the inline preview; in a terminal or Copilot, the live preview address, flagged as working while the session is open.
- **The Claude artifact is offered, not automatic.** Where the agent has an Artifact tool, it offers once per design, as one of the closing next steps, to put the design on claude.ai as a private artifact. It publishes only on a yes; after that it republishes after each feedback round without asking. The `register_open_design_artifact` hint says the same.

## Capabilities

### Modified Capabilities
- `artifact-preview` (from add-artifact-preview): publishing becomes an offer the user accepts.

## Impact

- Content: `packages/content/local/voice.md`, the recipe prompts that end with a design (`new`, `poster`, `social-post`, `deck-from-source`, `explore`, `campaign`), the hand-written `open-design` skill, and everything generated from them.
- `packages/mcp-server`: the register hint's wording.
- Docs: Claude Code getting started, the tools reference.
