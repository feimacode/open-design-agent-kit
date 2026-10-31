# ChatGPT desktop

Open Design runs in the ChatGPT desktop app (macOS and Windows) as a **desktop plugin**: the same skills Codex uses, plus the Open Design MCP server, running on your computer. ChatGPT marks plugins like this "Desktop only". They work in threads that run on your computer, in the **Work** and **Codex** tabs, not in ChatGPT on the web or on your phone.

## What you need

- The ChatGPT desktop app. Plugins and the Work tab depend on your plan; Plus and Pro have them.
- [Node.js](https://nodejs.org/) 18 or later. The plugin's server runs with `node`; nothing is downloaded when it starts.

## Install

In a terminal:

```bash
npx @feimacode/open-design-agent-kit install chatgpt
```

It downloads the plugin for its own version from the [GitHub release](https://github.com/feimacode/open-design-agent-kit/releases/latest), checks its checksum, unpacks it into `~/.codex/plugins/open-design/` and lists it in `~/.agents/plugins/marketplace.json`. Every path it writes is printed. See [`install`](../reference/cli.md#install).

Then:

1. Quit and reopen the ChatGPT desktop app.
2. Open **Plugins**, find **Open Design** under **Personal**, and turn it on.
3. In a new **Work** thread, type `@` and pick Open Design, or just ask for a design.

## Your first design

Try: "Make a poster for our café's Saturday jazz night, A3, warm and hand-made." The agent picks a recipe and a design system, writes the page, checks it in a browser and offers to export it.

Designs are saved in **Documents/Open Design** (or **Open Design** in your home folder), one subfolder per design. To use a project folder instead, say so ("save designs in ~/Projects/menu").

## Updating and removing

- Update: `npx @feimacode/open-design-agent-kit@latest install chatgpt`, then restart ChatGPT.
- Remove: `npx @feimacode/open-design-agent-kit uninstall chatgpt`. Your designs are kept.

## Good to know

- **In-chat previews.** Whether ChatGPT shows Open Design's inline preview, pickers and question cards for a desktop plugin is still being checked. Until then, the agent describes the design and gives you its file path; open it in a browser, or ask for a PNG or PDF export.
- **Claude-only features** (Claude Design systems, Claude artifacts) aren't offered in ChatGPT.
- **Open Design's tools don't appear** after turning the plugin on: ChatGPT most likely couldn't start `node`. Install Node.js 18 or later, then restart ChatGPT.
- **ChatGPT on the web** needs a hosted server, which isn't available yet.
