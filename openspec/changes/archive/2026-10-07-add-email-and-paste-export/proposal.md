## Why

"HTML email" is a Claude Design surface and a daily marketing need, but the one email template we ship (`email-marketing`) would break in real inboxes: flexbox and grid instead of tables, a `<style>` block, `transform: skew`, inline SVG (stripped by Gmail and Outlook). Separately, a lot of designed HTML ends up pasted somewhere else: a WeChat article, a Notion page, a newsletter tool. Every one of those needs the same thing, which is styles inlined onto elements. html-anything does that with `juice`, which only sees `<style>` blocks and misses Tailwind-CDN and other runtime-generated classes. We already render artifacts in a headless browser, so we can inline what the browser actually computed. That's more accurate, and one engine serves email and every paste target.

## What Changes

- **Computed-style inliner** in core: renders the artifact and writes each element's computed styles inline (only the properties that differ from the element's defaults), removes classes, scripts and `<style>`, and keeps `data-od-*` attributes out. It works for anything the browser can render, including Tailwind CDN pages.
- New export format **`email`**: writes `exports/<name>.email.html`, a full email document with inlined styles, a 600 px container, `role="presentation"` tables, a preheader, and the dark-mode meta tags. With `baseUrl`, local image references become absolute URLs.
- **Email preflight** runs on `email` exports and on `check_open_design_artifact` for email artifacts:
  - `email-layout`: flex, grid or absolute positioning in layout.
  - `email-unsupported-css`: transform, CSS variables left over after inlining, gradient backgrounds without a solid fallback, `position: fixed`.
  - `email-svg`: inline or `<img>` SVG.
  - `email-local-image`: relative image `src` without `baseUrl`.
  - `email-missing-alt`: an image with no alt text.
  - `email-width`: content wider than 640 px.
  - `email-clip`: over 102 KB, the size at which Gmail clips a message.
- New local skill **`email-campaign`** (`od:prototype:email-campaign`): inbox-safe by construction (tables, a bulletproof button, MSO conditionals, a web-safe font stack with the design-system font first, a solid fallback for every gradient, a preheader, a footer with unsubscribe and view-in-browser links). The HTML-email surface routes to it.
- New export format **`paste`** with `target`: `wechat`, `notion`, `newsletter` or `generic`. It writes `exports/<name>.<target>.html`, an inlined body fragment adjusted per target:
  - **WeChat:** top-level `<section>` wrappers and no external fonts.
  - **Notion:** flattened wrappers, `pre > code` with language classes, `class` and `data-*` attributes stripped.
  - **newsletter:** the email rules applied to a fragment.
- **Copy to clipboard:**
  - **VS Code:** the preview toolbar gets a "Copy for…" menu (Email, WeChat, Notion, Newsletter) that copies the export as rich HTML. If the webview can't write `text/html`, it opens the exported file in the browser, where the user can copy it.
  - **CLI and MCP hosts:** the export result says to open the file in a browser and copy it from there.

## Capabilities

### New Capabilities
- `email-and-paste-export`: the computed-style inliner, the `email` and `paste` formats, email preflight, the `email-campaign` skill, and copy for paste.

### Modified Capabilities
<!-- None: the new formats extend export through this capability's own requirements. -->

## Impact

- `packages/core`: `export/inlineStyles.ts` (page script plus a defaults baseline), `export/emailExport.ts`, email checks, email artifacts recognised by a `[data-od-email]` column root (no new manifest kind; the validator is vendored).
- `packages/content/local/skills/email-campaign/`; the HTML-email surface.
- `packages/vscode`: preview toolbar menu, webview clipboard. `packages/mcp-server`, CLI (`--format email|paste --target`): schemas.
- No new npm dependencies.
