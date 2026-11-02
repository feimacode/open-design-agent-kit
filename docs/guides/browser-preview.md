# Browser preview and comments (Claude Code, Codex, Cursor)

Agents in a terminal can't show you a design, so Open Design opens one for you: a **browser preview** of the artifact that reloads whenever the agent changes it. In it you can click any element to leave a comment for the agent, and compare the agent's check screenshots before and after. It works with any host that runs the [MCP server](../getting-started/claude-code.md): Claude Code, Codex, Cursor and others. In VS Code, the [Artifact Preview](preview-comments-edit.md) does this inside the editor. In Claude Desktop Chat, the design shows [inline in the conversation](inline-preview.md) instead.

## Open it

The `open-design` skill asks the agent to open the preview once, after the first design it makes in a session. After that the same window follows along. You can also ask for it at any time:

> Show me the landing page.

Or use the prompt: `/open-design:open-design-preview` in Claude Code (`/open-design-preview` after `init`), or the `open-design-preview` skill in Codex. Without an agent, run the [CLI](../reference/cli.md#preview):

```bash
npx @feimacode/open-design-agent-kit preview .open-design/landing/landing.html
```

The preview opens like this:

1. **An app window** of your installed Chrome, Edge or Chromium, with its own profile, never your everyday one. It closes when the agent's session ends.
2. If there's no such browser, or it can't open a window, **your default browser**. On WSL that's the Windows browser.
3. If nothing can be opened (an SSH session, a container), the agent gives you **the URL**. Open it on the same machine, or forward the port first.

To always use your default browser, set [`OPEN_DESIGN_PREVIEW_BROWSER`](../reference/settings-and-env.md#open_design_preview_browser) to `default`. To stop the agent from opening it, set [`OPEN_DESIGN_PREVIEW`](../reference/settings-and-env.md#open_design_preview) to `off`; set it to `auto` to have it open as soon as the first design is registered.

The **Live** dot in the toolbar shows the preview is connected. The **‹** button lists every design in the workspace.

## Comments

1. Click **Comment** in the toolbar.
2. Hover to highlight an element, click it, type what should change, and click **Add** (or press Ctrl/⌘-Enter). A pin marks the element.
3. When you're done, click **Send to agent**. It copies a short instruction to your clipboard; paste it into your agent's chat.

The agent reads your comments with [`get_open_design_artifact`](../reference/tools.md#get_open_design_artifact), changes only those elements, and marks the comments resolved, so their pins disappear from the preview. Click a pin to see its comment, resolve it yourself, or delete it.

Each comment records:

- **Which element:** a CSS selector built from the element's id, its stable attributes (`data-testid`, `aria-label`, …) or its meaningful class names, before falling back to its position in the page; plus a snippet of its text.
- **Where it was:** its position and size on the page, and the window size.
- **What it looked like:** a screenshot of the element with some context around it, taken from the window you're looking at. In your default browser, or after you set `OPEN_DESIGN_PREVIEW_BROWSER=default`, the screenshot is taken by re-rendering the page, so a state you clicked into (an open tab, a menu) may not show. Without Chrome, Edge or Chromium, comments are saved without a screenshot.

Comments are saved next to the artifact in `<entry>.comments.json`, the same file the VS Code preview uses, and their screenshots in `<entry>.comments/`. Commit them or add them to `.gitignore`, as you prefer.

## Checks

The agent checks its work with [`check_open_design_artifact`](../reference/tools.md#check_open_design_artifact), which renders the design and returns screenshots to the agent. Terminal agents don't show you those images, so every run is also saved, and the preview's **Checks** button shows them: the latest run next to the one before it, image by image, with each run's findings. A dot on the button means a new run arrived. The runs are kept under `.open-design/.checks/`, the last 5 per design. When the design has had a [second opinion](generate-a-design.md#second-opinion), the panel starts with it: "Second look", the verdict and each suggested fix.

App screens with [state frames](app-screens.md) get a states bar above the design: one button per state, and **All states** side by side. Links between the screens of a [flow](app-screens.md#linked-flows) open the next screen, and the shared navigation (`_shared/nav.html`) is filled in.

## What it doesn't do (yet)

The browser preview has View and Comment. **Edit** and **Tweaks** are only in the [VS Code preview](preview-comments-edit.md) for now.

## Security

The preview listens on `127.0.0.1` only, behind random URL tokens, and serves only files inside your workspace. The design runs on a different origin from the preview's own controls, so a design's scripts can't write comments or read anything outside the workspace.
