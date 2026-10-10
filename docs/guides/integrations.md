# Connect other services

Some steps end in another service: importing a design into Canva, reading a Figma frame, saving to Google Drive, writing a Notion page, sharing in Slack or posting to a social network. When that service's own MCP server is connected to your agent, the agent can do the step itself instead of handing you a file to upload by hand.

Open Design keeps a short list of **trusted integrations**: official servers run by the vendors, plus well-known posting services. The agent looks them up with [`list_open_design_integrations`](../reference/tools.md#list_open_design_integrations). If one is already connected, it uses it. If not, it can help you connect one, but only after you say yes.

## Supported integrations

| Integration | What the agent can do with it | Sign-in | Notes |
|---|---|---|---|
| Canva | Import a design, upload assets, export, read brand kits | Canva account | Also a claude.ai connector |
| Figma | Read frames, export and upload assets, create and edit designs | Figma account | Only approved clients; Codex can write to Figma Design and FigJam only |
| Notion | Read pages, create pages, upload files | Notion account | Available tools depend on your workspace plan |
| Google Drive | Search, read and save files | Google account | Outside claude.ai, needs your own Google Cloud OAuth client |
| Slack | Share a message or image in a channel | Slack account | Only Slack's partner clients |
| Buffer | Draft and schedule posts on X, LinkedIn, Instagram, Facebook, Threads, Bluesky, Mastodon, TikTok, Pinterest, YouTube | **API key** you set as `BUFFER_API_KEY` | Images must be public URLs; text only on X, Mastodon, Threads and Bluesky |
| Metricool | Schedule posts on Instagram, Facebook, LinkedIn, TikTok, YouTube | Metricool account | Also a claude.ai connector |
| X | Post through X's own server | Your X developer app | Self-hosted; set up by hand from [xdevplatform/xmcp](https://github.com/xdevplatform/xmcp) |

For social posts, X's own server comes first when you have it. Otherwise the agent uses whichever posting service you've connected. If more than one would work and none is connected, it asks which one you use.

## What the agent does

1. **Looks up the providers** for the step, then **checks its own tools** for one that's already connected.
2. **Uses it** if it's there. Each action that touches your account still goes through your agent's normal approval prompt. Open Design never pre-approves another service's tools.
3. **Offers setup once** if none is connected, saying what the integration does and what sign-in it needs. **Nothing is installed until you say yes.**
4. After your yes, it adds the server to **your user-level configuration**, never to a file committed to the project. It then helps you sign in, reloads if needed, and checks that the tools appeared.
5. **If you say no**, it carries on with the manual steps the workflow already had, such as exporting a file for you to upload.

Publishing, sending or posting always waits for your go-ahead, connected or not.

## Canva

The **Publish to Canva** button in the VS Code preview, and the [`publish_open_design_artifact_to_canva`](../reference/tools.md#publish_open_design_artifact_to_canva) tool on every agent, use your Canva connection when there is one. After exporting the design, the agent asks which route you want:

- **Editable design (recommended):** the exported PDF or PowerPoint is put on a temporary public link (you confirm first; it lasts about an hour with `cloudflare-temporary`), and Canva converts it into a design. The agent checks the result and gives you the edit link, and can publish it as a Brand Template if you say yes.
- **Private upload:** the file goes straight into your Canva **Uploads**, and nothing goes public. Open it there to start editing.

Without a Canva connection, the agent offers to set one up once, and otherwise gives you the file and Canva's **Import a file** steps. Decks arrive as one image per slide either way, so their text isn't separately editable.

## API keys

Some services, Buffer for example, use an API key instead of a browser sign-in. The agent **never asks you for the key in chat and never writes it into a file.** You set it yourself:

- **Claude Code, Codex, Cursor:** set the environment variable (e.g. `export BUFFER_API_KEY=…` in your shell profile) and restart the agent from that shell. The configuration only refers to the variable by name.
- **VS Code:** the agent shows you a snippet to add with **MCP: Open User Configuration**. VS Code then asks for the key once and stores it securely.

> **In Claude Code:** if you sign in with a claude.ai account, the agent suggests connecting Canva, Figma, Notion, Google Drive, Slack or Metricool at [claude.ai/customize/connectors](https://claude.ai/customize/connectors). A connector added there works in every Claude app, and Claude Code picks it up in its next session. Built-in claude.ai features that aren't MCP servers, such as the GitHub integration, don't appear in Claude Code.

> **In VS Code:** the agent adds a server with `code --add-mcp`, or asks you to use **MCP: Add Server** (choose Global). VS Code asks you to sign in the first time the server starts.

> **In Codex:** the agent runs `codex mcp add <name> --url <url>`, then `codex mcp login <name>` for services with a browser sign-in.
