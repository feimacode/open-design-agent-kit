# Figma

Two directions: rebuild a **Figma frame as code**, and push an **artifact into Figma as editable layers**. Both work best through Figma's own MCP server, which you connect once ([Connect other services](integrations.md)). Without it, a Figma token (for frames) and the OD Figma Import plugin (for pushing) still work.

## Figma frame to code

### Before you start

Either of these:

- **Figma connected to your agent** (recommended). In Claude Code, connect Figma at [claude.ai/customize/connectors](https://claude.ai/customize/connectors). In other agents, the agent offers to add Figma's server (`https://mcp.figma.com/mcp`) when you first need it. No token is needed.
- **A Figma personal access token** (Figma → Settings → Personal access tokens):

  > **In VS Code:** run **Open Design: Set Figma Access Token** and paste it. It's stored encrypted and never shown again.

  > **In the Claude Code plugin:** enter it as the plugin's **Figma access token** option (`/plugin` → Open Design → configure). It's stored in your keychain, not in `settings.json`.

  > **In Codex, or Claude Code without the plugin:** set [`OPEN_DESIGN_FIGMA_TOKEN`](../reference/settings-and-env.md#open_design_figma_token) in the MCP server's `env`.

### Steps

1. In Figma, select the frame and use **Copy link to selection**. The link must contain `node-id`; a plain file link won't work.
2. Ask:

   > Turn this Figma frame into code: https://www.figma.com/design/…?node-id=12-345

3. The agent calls [`pull_open_design_figma_frame`](../reference/tools.md#pull_open_design_figma_frame).
   - **With Figma connected,** it reads the frame through Figma's server: reference code, its variables (colors, type, spacing), the assets and a screenshot to compare against.
   - **With only a token,** the tool fetches the frame's structure and a rendered image instead.
   
   Either way the agent writes the HTML and registers it under `.open-design/figma/`.

Optionally name a design system ("…using our Acme design system") to align the code with your tokens.

## Artifact to Figma layers

### With Figma connected (any agent)

Ask:

> Push the pricing page into Figma.

The agent calls [`push_open_design_artifact_to_figma`](../reference/tools.md#push_open_design_artifact_to_figma). It captures the page's layers in a headless browser and prepares them in parts. Then:

1. It asks whether to add the design to an **existing Figma file** (paste its link) or a **new file** in your drafts.
2. It builds the layers with Figma's `use_figma`: frames, text, fills, strokes, corner radii and shadows. It then uploads the images onto the right layers.
3. It checks a screenshot and gives you the link. Fonts Figma doesn't have fall back to Inter, and the agent tells you which.

A push always adds a new frame beside what's already in the file and never changes existing layers.

> **In VS Code:** in the [preview](preview-comments-edit.md), choose **Export → Figma**, then **Push with Figma connection**. Copilot takes it from there, reusing the capture the preview just made.

### Without a Figma connection

1. **One-time setup:** run **Open Design: Show Figma Import Plugin Folder** in VS Code. In Figma desktop, choose **Plugins → Development → Import plugin from manifest…** and pick the `manifest.json` it revealed. This installs the bundled "OD Figma Import" plugin.
2. Capture the layers: in VS Code, **Export → Figma** in the preview. In other agents, ask to push to Figma and decline the connection; the capture is still written. Either way it lands in `<entry>.od-figma.json`.
3. In VS Code choose **Copy JSON** (or copy the file's contents), then in Figma run **OD Figma Import** and paste it.

You can't drag an `.od-figma.json` straight into Figma. Figma only opens its own file formats, which is why the plugin is needed.

## What doesn't carry over

Gradients become their first color, inline SVG icons aren't captured, and very large pages are cut off at 6,000 layers.

## Troubleshooting

- [Figma: no access token](../troubleshooting.md#figma-no-access-token)

## Related

[Connect other services](integrations.md) · [Generate a design](generate-a-design.md) · [Preview, comment and edit](preview-comments-edit.md)
