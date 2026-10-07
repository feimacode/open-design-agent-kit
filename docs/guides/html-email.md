# HTML email

Design a newsletter or launch email that renders properly in real inboxes (Gmail, Outlook on desktop and the web, Apple Mail, phones), then export it ready to paste into your email tool.

## Before you start

- An installed Chrome, Edge or Chromium, for checking and exporting ([why](export-images.md#before-you-start)).
- If the email has images, somewhere to host them (your email tool's image library, a CDN, any public web folder). Recipients can only load hosted images.

## Start

> A launch email for our new reporting dashboard: one headline, three short benefits, one button to try it.

> **In VS Code:** pick **HTML email** in the Gallery's **New design** tiles, or run `/open-design-new email`.

> **In Claude Code / Codex:** just ask; the `email-campaign` skill is picked for email requests.

## What happens

1. **The agent builds the email for inboxes, not browsers** with the `email-campaign` skill:
   - one column (a table marked `data-od-email`, full width on phones, 600px elsewhere);
   - rows of tables instead of flexbox or grid;
   - web-safe font fallbacks, and a solid color behind every gradient;
   - a button that also works in Outlook;
   - a hidden preheader, and a footer with unsubscribe and view-in-browser links.
2. **It checks it** with [`check_open_design_artifact`](../reference/tools.md#check_open_design_artifact). On an email, the check adds rules for what inboxes break:

   | Check | What it catches |
   |---|---|
   | `email-layout` | Flexbox, grid or absolute positioning (Outlook ignores them) |
   | `email-unsupported-css` | Transforms, gradients without a solid fallback, CSS variables |
   | `email-svg` | Inline SVG or SVG images (Gmail and Outlook drop them) |
   | `email-local-image` | Images that aren't hosted yet, or `data:` images (Gmail blocks them) |
   | `email-missing-alt` | Images without alt text (shown when images are off) |
   | `email-width` | Content wider than 640px |
   | `email-clip` | HTML over 102 KB (Gmail cuts it off behind "View entire message") |

3. **It exports it** with [`export_open_design_artifact`](../reference/tools.md#export_open_design_artifact) and `format: "email"`, which writes two files:
   - `exports/<name>.email.html`: every style inlined onto its element, in a standard email wrapper with dark-mode meta tags.
   - `exports/<name>.email.txt`: a plain-text version, with its links listed.

   Styles are read from what the browser actually rendered, so CSS frameworks such as the Tailwind CDN come out inlined too.

## Images

Upload the artifact's `assets/` folder wherever your images will live, then export with `baseUrl` set to that address. Every relative image and link URL is rewritten against it:

> Export the launch email with baseUrl https://cdn.example.com/launch/

Until then, the check lists local images as notes, and the export reports them as errors.

## Send it

> **In VS Code:** in the preview, **Export → Copy for → Email** copies the email as rich HTML. Paste it into your email tool's editor. If the copy isn't allowed, the email opens in your browser instead: select all and copy from there.

Anywhere else: open `exports/<name>.email.html` in a browser, select all, copy, and paste into your email tool, or import the file if your tool accepts HTML. **Send yourself a test first**, to a Gmail and an Outlook address, before sending to your list.

> **From the CLI:** `npx @feimacode/open-design-agent-kit export .open-design/launch/launch.html --format email --base-url https://cdn.example.com/launch/`

## Related

- [Paste into WeChat, Notion and newsletters](paste-html.md)
- [Generate a design](generate-a-design.md)
