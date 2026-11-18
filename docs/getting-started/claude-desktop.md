# Claude Desktop

Claude Desktop runs Open Design through the same plugin as [Claude Code](claude-code.md), optionally with the Open Design **desktop extension** next to it. What works depends on where you use it:

| Where | Works? | What you get |
|---|---|---|
| **Code tab** | Yes | Everything Claude Code does, plus the Browser pane for looking at designs and leaving comments |
| **Chat with a folder** | Yes | Skills and tools run on your machine and write into the folder you connected |
| **Chat without a folder** | With the [desktop extension](#install-the-desktop-extension) | Designs are saved in `~/Documents/Open Design/`, one folder per design. With the plugin alone, Claude can only make a single page as a Claude artifact |

The plugin brings the skills (everywhere, including Chat) and its own copy of the tools (Code tab, Chat with a folder). The extension brings the tools on Desktop's own Node, with a settings form, and also works in Chat without a folder. Use the plugin alone, or both together.

## Before you start

- Claude Desktop.
- Either the [desktop extension](#install-the-desktop-extension), which needs nothing else, or Node.js 18 or later on the machine Desktop runs on (the plugin starts its MCP server with `node` and `npx`). Without Node, the plugin still gives you the skills; the extension gives you the tools.
- Optional: an installed Chrome, Edge or Chromium, for visual checks and exporting images, PDFs and PowerPoint.

## Install the plugin

1. Open **Customize → Plugins** and choose **Add marketplace**.
2. Enter `feimacode/open-design-agent-kit`.
3. Install **Open Design**, or **Open Design Hosted** if Node.js isn't installed or is blocked on this computer. Install one, not both.

**Open Design Hosted** runs the tools on our [hosted server](claude-and-chatgpt-web.md) instead of your computer, so it needs no Node.js and its tools also work in a Chat without a folder, on the web and on your phone. Designs are kept on the server (deleted 7 days after you last used them) and you get links instead of files, and some things aren't offered, such as a folder of your own, the Browser pane preview and Figma or Canva hand-offs. See [Which plugin](claude-code.md#which-plugin).

In the Code tab you can also install it the Claude Code way (`/plugin marketplace add feimacode/open-design-agent-kit`, then `/plugin install open-design`), or write it into your project with [`init`](claude-code.md#option-b-write-it-into-your-project).

## Install the desktop extension

The extension is optional. It's for you if you don't want to install Node.js, want the Figma token in a settings form, or want to use Chat without a folder.

1. Download `open-design-<version>.mcpb` from the [latest GitHub release](https://github.com/feimacode/open-design-agent-kit/releases/latest). Its `.sha256` file lets you check the download.
2. Double-click the file, or open **Settings → Extensions**, choose **Install extension** and pick it.
3. Fill in the settings, both optional:
   - **Figma access token**: only needed to pull Figma frames when Figma's own connector isn't connected. Desktop keeps it in your system keychain.
   - **Default design folder**: where designs from a chat with no folder go, one folder per design. Leave it empty for `~/Open Design`.

Desktop runs the extension on its own built-in Node, so nothing is downloaded on first start.

### Plugin and extension together

Install the plugin for the skills and the extension for the tools. In a Chat with a folder, Desktop starts both servers. The plugin's server sees that the extension is running and lists no tools there, so Claude sees one set of Open Design tools, the extension's. In the Code tab, the plugin's server keeps its tools, since the Code tab doesn't load extensions.

On Windows without Node.js, Desktop may show the plugin's server as failed. That's expected: the extension provides the tools.

### Updating the extension

The extension doesn't update itself. When a new release is out (the release notes say so), download its `.mcpb` and install it the same way; it replaces the old one. To see which version runs, ask Claude which version the Open Design server reports, or look under **Settings → Extensions**.

## Code tab

The Code tab is Claude Code, so [Claude Code's getting-started page](claude-code.md) applies as it is. Desktop adds the **Browser pane** (Cmd+Shift+B).

### Open a design by clicking its path

After Claude registers or updates a design, its reply gives the file's path on its own line, for example:

```
.open-design/coffee-poster/coffee-poster.html
```

Click it and the design opens in the Browser pane. The same works for the comparison page and contact sheet of an [exploration](../guides/explore-directions.md), and for exported PNG, PDF and video files.

### The live preview in the Browser pane

The [browser preview](../guides/browser-preview.md), with its live reload, **Comment** button and **Checks** panel, can run inside the Browser pane too. Desktop opens local servers listed in `.claude/launch.json`.

The easiest way is to ask Claude to "show the live preview". It adds an `open-design-preview` entry to `.claude/launch.json` in your project (with [`set_up_open_design_browser_pane`](../reference/tools.md#set_up_open_design_browser_pane), once per project), tells you so, and starts it in the Browser pane. The pane's address always opens the newest design you registered; reload it after Claude makes another, or pick one from the preview's list. If you set the project up with `npx @feimacode/open-design-agent-kit init --tools claude`, the entry is already there.

Each project gets its own port between 5317 and 5416 (from the project's path), so two projects' previews can run at once, and the entry uses the `npx` beside the Node that runs Open Design. To add it by hand, merge something like this into `configurations`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "open-design-preview",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["-y", "@feimacode/open-design-agent-kit", "preview", "--no-open", "--root-latest", "--port", "5317"],
      "port": 5317
    }
  ]
}
```

Claude and `init` update an entry named `open-design-preview` to the current version; rename yours to keep custom settings. If the preview fails to start because `npx` isn't found (common when Node comes from nvm), set `runtimeExecutable` to the full path that `which npx` prints in a terminal. Comments you leave there are saved next to the design, the same as in any other browser. The pane has no chat box of its own, so when you're done, tell Claude in the Code tab "apply my comments on the coffee poster".

## Your first design

If you've just installed the plugin, start a new Chat and say what you need, for example "a flyer for our seed swap". When Claude has nowhere to save your design yet, it says so in plain words and offers two ways on:

1. Connect a folder: click **+** in the chat, then **Add folder**.
2. Install the Open Design extension for Claude Desktop, which keeps a folder for you in Documents.

Then it asks one question, "What's it for?", with a few goals to pick from (promote an event, run a shop, get hired, show an idea), and picks a fitting kind of design from your answer.

## Chat with a folder

1. Start a new Chat and connect a folder (Claude asks for one, or use the chat's **+** menu).
2. Ask for a design, for example:

   > Make an A3 poster for our coffee tasting night, warm and editorial.

The plugin's MCP server runs on your machine, not in Claude's sandbox. It starts in your home folder, so the first thing Claude does is call `set_open_design_workspace` with the connected folder's path. You don't need to do anything for that. Designs are written in a visible `Open Design/` folder inside it, one folder per design, and Claude tells you once where that is. A folder that already holds designs under `.open-design/` (from an earlier release, or Claude Code) keeps using it.

With the plugin alone, the first start downloads the server package once (about 12 MB), so it needs the network that time. npm caches it afterwards. The extension needs no download.

### See the design in the chat

After Claude registers a design, it shows it [inline in the conversation](../guides/inline-preview.md). Desktop asks you to allow the preview the first time. Click **Comment**, click an element and type what should change, then click **Ask Claude to apply**: the comments go straight back to Claude. The export buttons ask Claude to export, since the inline page can't download files.

For Figma without Figma's own connector, enter a token in the [extension's settings](#install-the-desktop-extension), or save it in `~/.config/open-design/figma-token`. Plugin settings can't hold it, because Desktop won't start a plugin server that uses them. See [Figma: no access token](../troubleshooting.md#figma-no-access-token).

> Chat with a folder needs a server release that includes `set_open_design_workspace`. If tools refuse with a message about the home folder and Claude has no `set_open_design_workspace` tool, the plugin still runs an older server. Update the plugin once a newer one is out.

## Chat without a folder

Connecting a folder is still the best setup: your designs live in your project, and Claude edits them with its own tools. Without one, it depends on what's installed.

**With the desktop extension.** Ask for a design as usual. Claude opens a folder for it, `~/Documents/Open Design/<name>/` (or under your default design folder; `~/Open Design/` when there is no Documents folder), tells you the path, and saves each file through the extension's `write_open_design_file` tool, since its own file tools can't reach your disk from here. Everything else works as in a Chat with a folder: the inline preview with comments, checks and exports. Images, PDFs and slide files are saved next to the design with plain names such as `coffee-poster-A4.pdf` or `coffee-poster-instagram-portrait.png`; other exports go in its `exports/` folder. Ask again in a later chat with the same name ("continue the coffee poster") to keep working on it. A Claude artifact of the design is published from the page itself, up to 2 MiB. Designs made by an earlier release in `~/Open Design/<name>/` are reopened where they are.

**With the plugin only.** Chat ignores the plugin's server, so Claude has the skills but no Open Design tools. It tells you what's missing (connect a folder, or install the extension) and, only if you want to go ahead, makes one self-contained page and publishes it as a Claude artifact, without design systems, checks or exports.

If you already use a filesystem extension (such as Desktop's Filesystem extension), you can point it and `set_open_design_workspace` at the same folder instead; Claude then writes with that extension's tools.

## Known limits

- **No downloads from inline pages.** Desktop refuses files offered for download by a page shown in Chat. Ask Claude to export instead: the files are written in your folder and Claude gives you their paths.
- **Links open in your system browser.** A link opened from Chat goes to your default browser, not the Browser pane. On Linux under WSL with no default browser set, nothing opens; installing `wslu` sends links to your Windows browser.
- **Tested on Linux only.** These steps were tried on Desktop's Linux build in WSL2. macOS and Windows are expected to work the same way but are untested. The desktop extension installs on macOS, Windows and Linux. On macOS, a Node installed with nvm may not be found by Desktop when it's launched from the Dock (see [troubleshooting](../troubleshooting.md#claude-desktop-node-not-found-on-macos)).

## Next

- [Generate a design](../guides/generate-a-design.md), [Posters and print](../guides/posters.md) and [Browser preview and comments](../guides/browser-preview.md), [Inline preview in Claude Desktop Chat](../guides/inline-preview.md)
- [Troubleshooting Claude Desktop](../troubleshooting.md#claude-desktop)
