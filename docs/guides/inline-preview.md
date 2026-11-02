# Inline preview in Claude Desktop Chat

In a Claude Desktop **Chat** conversation, Open Design shows the design right in the conversation instead of a file path. You can comment on it there and hand the comments back to Claude without leaving the chat, pick a starting example, a design system or a campaign piece from pictures, and answer Claude's questions with taps. It's an [MCP App](https://github.com/modelcontextprotocol/ext-apps), so it shows only where two things hold: the Open Design server is running, and the host renders MCP Apps. Everywhere else the agent gets a text result and uses the [browser preview](browser-preview.md) instead.

| Where | What you see |
|---|---|
| Plugin install: a Cowork session on your computer, or a Chat with a [connected folder](../getting-started/claude-desktop.md#chat-with-a-folder) | The inline pages: the design with Comment, Ask Claude to apply, export buttons and Fullscreen, and the pickers below |
| Plain Chat (no folder) with the server added to Desktop's local MCP config, as the [Open Design desktop extension](../getting-started/claude-desktop.md#install-the-desktop-extension) (`.mcpb`), or as a remote server | The inline pages, for designs saved in a [managed folder](../getting-started/claude-desktop.md#chat-without-a-folder) |
| Plain Chat with only the plugin | Nothing from Open Design: Chat ignores a plugin's local MCP servers, so the server isn't running there |
| A Chat where Claude runs in the cloud and reaches your computer's tools through the device link (its tool names start with `remote-devices`) | No inline pages, even though the tools are listed and return the right result: that route passes tool results through but doesn't draw MCP Apps (seen in Claude Desktop on Linux, October 2026). Claude falls back to the text result; ask it to open the [browser preview](browser-preview.md) |
| Claude Desktop's Code tab, the Claude Code terminal, Codex | A text summary (title, path, open comments); the agent opens the [browser preview](browser-preview.md). The picker and question tools aren't listed there; Claude asks its questions in one chat message |

## Show a design

The `open-design` skill asks Claude to show the design once, after it first registers it. After that the shown copy follows the design: it checks for changes every few seconds and updates in place after each round, with a short "Updated to the latest version" note, so Claude doesn't show it again. It waits while you're writing a comment, checks less often after two minutes without a click, and not at all while the page is hidden. You can also ask at any time:

> Show me the coffee poster.

The first time, Claude Desktop asks you to allow the preview. The design renders from a self-contained copy: its local fonts, images and stylesheets are inlined, and Google Fonts load as usual. Images and scripts from other sites load only if the design used them before (the server declares those sites to Claude Desktop the next time the page loads); otherwise they're blocked.

Click **Fullscreen** for more room. The reload button fetches the latest version at once, which helps for an older copy further up the conversation that has stopped following.

A link to another screen of a [flow](app-screens.md#linked-flows) (or any other design next to it) opens that screen in the same view, and the back button returns. A screen's shared navigation is filled in.

Under the design are three quick replies: **Looks good**, **Change something** and **Try another direction**. Each posts a message so Claude knows what to do next (offer an export, ask what to change, or suggest other directions), for when you don't know what to type. They're hidden in fullscreen.

## Comments

1. Click **Comment** in the preview's toolbar.
2. Click an element, type what should change, and click **Add**. A pin marks the element. Click a pin to resolve or delete its comment.
3. Click **Ask Claude to apply**. A message naming the design and the comment ids appears in the chat, and Claude applies them, re-registers the design with the comments resolved, and the preview updates in place.

Comments are saved to the same `<entry>.comments.json` file as the [browser preview](browser-preview.md#comments) and VS Code use, so you can comment in one and apply from another.

## Export

The export buttons (PNG, PDF, HTML file, and PowerPoint for decks) post a request to Claude, which runs [`export_open_design_artifact`](../reference/tools.md#export_open_design_artifact) and tells you where the file was written. The preview never downloads anything itself, because Claude Desktop doesn't allow downloads from it.

## Explorations

When Claude [explores directions](explore-directions.md), it can show them side by side in one preview. **Take this one** posts your pick to the chat; Claude then asks whether to build it out, merge in parts of other directions, or save it as a design system before it calls `choose_open_design_direction`.

For an exploration of **style tiles**, each tile also has **Use as design system**. It asks Claude directly to save that tile as a design system (`choose_open_design_direction` with `next: "save-design-system"`), with no question in between.

## Pick an example

> Show me some deck examples I could start from.

Claude calls [`show_open_design_examples`](../reference/tools.md#show_open_design_examples) and a gallery of the examples you can [remix](remix-and-gallery.md) appears: 24 cards at a time, each with a live preview that loads as it scrolls into view, and chips to filter by mode. **Show more** loads the next 24. Click **Remix this** on the one you want: a message naming the example appears in the chat, and Claude copies it into your folder with `remix_open_design_example`, asking first what to make with it if you haven't said. The gallery itself never writes a file.

## Pick a design system

> Which design systems would suit a fintech landing page?

Claude calls [`show_open_design_design_systems`](../reference/tools.md#show_open_design_design_systems), with a shortlist or a filter. Each tile shows the system's palette, fonts and category, and marks the active one. Click a tile to see its full Visualize page (colors, type scale, components); **Use this design system** posts your pick, and Claude makes it the active design system with `set_active_design_system`.

## Campaign sheet

After a [campaign](campaigns.md) export with the sheet, Claude can show it with `show_open_design_artifact` and `campaign: true`. Every tile is there with its label, a green or red dot, and its errors in words. Click a landing page or email tile to open that piece in the preview (the back arrow returns to the sheet), or **Fix this piece** to send the tile and its errors to Claude. A sheet exported by an older server shows as one image until you export again.

## Answer questions with taps

When Claude needs a few answers before it builds (where a poster will be used, the mood, which look), or a pick after an exploration, it asks with [`show_open_design_questions`](../reference/tools.md#show_open_design_questions) instead of a list in the chat. Each question shows its choices as chips, some with a picture (a design system's palette, an example, a direction's screenshot), plus **You pick** to let Claude choose. Tap your answers and **Send**: one message appears in the chat, such as `Answers: where = Printed; mood = Dark`, with a hidden line Claude reads. You can skip a question, or ignore the card and type instead.

If Claude Desktop won't take the message, the card shows your answers with **Copy answers** so you can paste them.

## How a pick reaches Claude

Every button that changes something (Remix this, Use this design system, Use as design system, Take this one, Fix this piece, Ask Claude to apply, the export buttons, the quick replies and Send on a question card) posts a short message in the chat, as if you had typed it, naming the tool Claude should call. The page only reads data and saves your comments; Claude makes every other change, so you can see each request in the conversation.

## Limits

- Only Chat (and Cowork) render the inline pages, and only where the server runs (see the table above). The Code tab shows the text result; use the [browser preview](browser-preview.md) there.
- Links to websites open in your system browser after a confirmation, not in Claude's built-in browser. Links to other designs next to it open in the view.
- Designs larger than 5 MiB once inlined, and kinds that aren't HTML (Markdown, React components), show their latest check screenshot instead.

See [`show_open_design_artifact`](../reference/tools.md#show_open_design_artifact), [`show_open_design_examples`](../reference/tools.md#show_open_design_examples), [`show_open_design_design_systems`](../reference/tools.md#show_open_design_design_systems) and [`show_open_design_questions`](../reference/tools.md#show_open_design_questions) for the tools themselves.
