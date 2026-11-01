# Directory listings kit

The hosted gateway exists to list Open Design in two directories (openspec `deploy-hosted-gateway`). This page is the material both submissions ask for. Everything else installs the local server; see [Hosted server](../reference/remote-server.md).

## Shared facts

| Field | Value |
|---|---|
| Name | Open Design |
| One-liner | Make posters, social posts, slides and landing pages in your chat, with ready-made styles, checks and PDF or image exports. |
| Server URL | `https://open-design.feimacode.com/mcp` |
| Documentation | https://github.com/feimacode/open-design-agent-kit/blob/main/docs/reference/remote-server.md |
| Privacy policy | https://github.com/feimacode/open-design-agent-kit/blob/main/docs/legal/privacy.md |
| Terms | https://github.com/feimacode/open-design-agent-kit/blob/main/docs/legal/terms.md |
| Support | support@feimacode.com, or https://github.com/feimacode/open-design-agent-kit/issues |
| Category | Productivity (ChatGPT has no Design category); Design in Claude if offered |
| Data | Our own API; no personal health data, no sponsored content |
| Auth | None to start: every tool works without an account. With sign-in on, "Required when the server asks" (only the library tools ask) |

Long description (under 2,000 characters):

> Open Design turns a request like "a poster for our seed swap on Saturday" into a finished design in the chat. It picks a starting layout and one of about 150 ready-made styles (colours, fonts and spacing), builds the design, checks it in a real browser for problems such as text that overflows, low contrast, or print sizes and bleed that are off, and shows it right in the conversation. You can then save it as a PDF, PNG or PowerPoint file, adapt it to other sizes (Instagram, story, A3), or get a read-only link to share.
>
> It covers posters and flyers, social posts and carousels, slide decks, landing pages, menus, cards and more. You don't need an account: projects without one are kept for 7 days.

## Allowed link URIs (Claude)

- `https://open-design.feimacode.com`, for download links
- the user-content origin (`https://<user-content domain>`), for viewer and share links

## Reviewer guide

The same for both directories:

1. Add the server (Claude: custom connector with the URL above; ChatGPT: developer mode, then add the app). No sign-in is needed.
2. Ask: "Make an A4 poster for a community seed swap this Saturday at 10am in Riverside Park." Claude starts a project, picks a style, writes the design, checks it and shows it in the chat.
3. Ask: "Save it as a PDF." The reply has a download link (valid 24 hours).
4. Ask: "Give me a link I can share." The reply has a read-only viewer link.
5. Ask: "Make an Instagram post version." The design is adapted to 1080×1350.

Test account, once sign-in is on: a feima-idp email account made for reviewers. Its credentials go in the portal, never in this repository.

## OpenAI test cases

Five that should call the app:

1. "Make a poster for our bakery's grand opening on 12 December." Starts a project and makes a poster.
2. "Design a 5-slide pitch deck for a dog-walking app." Makes a deck.
3. "Turn this into an Instagram carousel: 3 tips for saving water." Makes a social carousel.
4. "Which design style would suit a calm yoga studio?" Recommends design systems.
5. "Export the poster as a PDF." Exports and returns a download link.

Three that should not:

1. "What's the capital of Australia?" General knowledge.
2. "Write me a Python function that reverses a list." Code with no design.
3. "Summarise this article for me." Text summary, nothing to design.

## Carousel screenshots (Claude MCP App)

Three to five PNGs, at least 1000 px wide, cropped to the app's response (no prompt in the picture), each with its prompt given separately:

1. The poster from step 2 of the reviewer guide, shown in the chat.
2. The design-system gallery for "a calm yoga studio".
3. A deck shown in the chat.
4. The questions view before a build.

These are captured from a live connector once the gateway is deployed.
