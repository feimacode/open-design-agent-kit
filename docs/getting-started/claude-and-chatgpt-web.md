# Claude and ChatGPT on the web

Open Design also runs as a hosted connector, so you can use it in Claude and ChatGPT without installing anything: on the web, in the desktop apps' ordinary chats, and on your phone. It's the same tools, run on our server at `https://open-design.feimacode.com/mcp` instead of your computer. This is the version listed in Claude's connector directory and ChatGPT's plugin directory.

If you can install something, the local versions do more: they save designs in a folder you can see, work with your project's files and your own accounts (Figma, Canva, your shop), and keep everything on your computer. See [Claude Desktop](claude-desktop.md), [Claude Code](claude-code.md) or [ChatGPT desktop](chatgpt-desktop.md).

## Add it

**Claude:** find **Open Design** in the connector directory once it's listed. Until then, add it as a custom connector: in **Settings → Connectors**, choose **Add custom connector** and give the URL above. No sign-in is needed. Custom connectors depend on your plan.

**ChatGPT:** find **Open Design** in the plugin directory once it's listed. Until then, turn on developer mode (**Settings → Apps → Advanced**) and add an app with the URL above, with no authentication.

## Your first design

Try:

> Make an A4 poster for a community seed swap this Saturday at 10am in Riverside Park.

The assistant starts a project, picks a layout and one of the ready-made styles, writes the design, checks it in a real browser and shows it in the chat where the host can show it. Then:

- "Save it as a PDF" (or PNG, JPEG, PowerPoint): the reply has a download link, valid for 24 hours. Long exports, such as PowerPoint or video, run in the background and the assistant checks back.
- "Make an Instagram post version": the design is adapted to another size.
- "Give me a link I can share": a read-only viewer link, where the server offers one.

## Where your designs are

Each design lives in a project on the server, which the assistant names with a short handle. Projects without an account are deleted 7 days after you last used them; ask the assistant to delete one sooner. Download what you want to keep.

The hosted server keeps only the files of your designs and what's needed to run them. See the [privacy policy](../legal/privacy.md#the-hosted-server).

## What's different from the local versions

The hosted connector can't reach your computer or your accounts, so these aren't offered: saving into a folder of yours, opening a live browser preview, turning a document from your disk into a deck, taking a design system from a website, Figma, Canva and shop hand-offs, porting to app code, and recurring jobs. The full list is in [Hosted server](../reference/remote-server.md#what-a-project-can-do).

The skills that guide each kind of design aren't loaded either. The server gives the assistant a short version of the main flow instead, so results can be a little less polished than with the plugin.

## Next

- [Generate a design](../guides/generate-a-design.md) and [Posters and print](../guides/posters.md): what to ask for.
- [Design systems](../guides/design-systems.md): the ready-made styles.
- [Hosted server](../reference/remote-server.md): how the service works, for administrators and the curious.
