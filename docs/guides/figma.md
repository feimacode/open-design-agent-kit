# Figma

Two directions: rebuild a **Figma frame as code**, and export an **artifact as editable Figma layers**.

## Figma frame to code

### Before you start

A Figma personal access token (Figma → Settings → Personal access tokens).

> **In VS Code:** run **Open Design: Set Figma Access Token** and paste it. It's stored encrypted and never shown again.

> **In Claude Code / Codex:** set [`OPEN_DESIGN_FIGMA_TOKEN`](../reference/settings-and-env.md#open_design_figma_token) in the MCP server's `env`.

### Steps

1. In Figma, select the frame and use **Copy link to selection**. The link must contain `node-id`; a plain file link won't work.
2. Ask:

   > Turn this Figma frame into code: https://www.figma.com/design/…?node-id=12-345

3. The agent calls [`pull_open_design_figma_frame`](../reference/tools.md#pull_open_design_figma_frame). The tool fetches the frame's structure (and, best effort, a rendered image) and returns instructions with an exact structural summary. The agent writes the HTML and registers it under `.open-design/figma/`.

Optionally name a design system ("…using our Acme design system") to align the code with your tokens.

## Artifact to Figma layers

VS Code only.

1. **One-time setup:** run **Open Design: Show Figma Import Plugin Folder**. In Figma desktop, choose **Plugins → Development → Import plugin from manifest…** and pick the `manifest.json` it revealed. This installs the bundled "OD Figma Import" plugin.
2. Open the artifact in the [preview](preview-comments-edit.md) and click **Push to Figma**. The page's layers are captured into `<entry>.od-figma.json`.
3. Choose **Copy JSON**, then in Figma run **OD Figma Import** and paste the JSON. It rebuilds the page as editable frames, text, images, fills, strokes, corner radii and shadows.

You can't drag an `.od-figma.json` straight into Figma. Figma only opens its own file formats, which is why the plugin is needed.

## Troubleshooting

- [Figma: no access token](../troubleshooting.md#figma-no-access-token)

## Related

[Generate a design](generate-a-design.md) · [Preview, comment and edit](preview-comments-edit.md)
