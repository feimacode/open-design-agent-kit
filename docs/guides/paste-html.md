# Paste into WeChat, Notion and newsletters

Turn any design into HTML that keeps its look when you paste it into another editor: a WeChat Official Account article, a Notion page, or a newsletter tool such as Substack or Mailchimp.

## Why a special export

Editors that accept pasted HTML throw away `<style>` blocks, classes and scripts. They keep only styles written directly on each element. The `paste` export renders your design in a browser and writes what the browser actually computed onto each element. It works for any CSS, including frameworks like the Tailwind CDN that generate styles at runtime.

## Export

> Export the article for WeChat.

The agent calls [`export_open_design_artifact`](../reference/tools.md#export_open_design_artifact) with `format: "paste"` and a `target`. The result is `exports/<name>.<target>.html`:

| Target | Adjusted for |
|---|---|
| `wechat` | The WeChat Official Account editor: top-level blocks become `<section>` elements, which it keeps styled. |
| `notion` | Notion, which turns pasted HTML into blocks: layout wrappers are flattened, and code blocks keep their language. |
| `newsletter` | Newsletter editors: the [email checks](html-email.md#what-happens) run too, because the result goes out by email. |
| `generic` | Any other rich-text editor. |

The result warns about anything that can't survive pasting, such as text added with CSS `::before` or `::after`.

## Paste it

> **In VS Code:** in the preview, **Export → Copy for → WeChat**, **Notion** or **Newsletter** puts the HTML on the clipboard. Paste it straight into the editor. If the copy isn't allowed, the file opens in your browser instead: select all and copy from there.

Anywhere else: open the exported file in a browser, select all, copy, and paste.

Images must be reachable from the editor. Most editors re-upload pasted images they can load, so host the artifact's `assets/` folder and export with `baseUrl` set to its address, or add the images in the editor afterwards.

> **From the CLI:** `npx @feimacode/open-design-agent-kit export .open-design/post/post.html --format paste --target notion`

## Related

- [HTML email](html-email.md)
- [Social media posts](social-posts.md) for image exports to X, Instagram and Xiaohongshu
