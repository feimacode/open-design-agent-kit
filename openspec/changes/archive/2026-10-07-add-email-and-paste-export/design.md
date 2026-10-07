## Context

html-anything's `export/wechat.ts` and `notion.ts` use juice and DOMParser in the browser; their own comments note that Tailwind-CDN styles are missed. Our export already loads the artifact in puppeteer (`openArtifactPage`, `loadPage`) and has a findings framework (preflight, now also used by the visual check).

## Goals / Non-Goals

**Goals:** HTML that survives Gmail, Outlook (desktop and web) and Apple Mail; paste-ready fragments for WeChat, Notion and newsletter tools; one inliner.

**Non-Goals:**
- Sending email or integrating with an email service (ESP) API.
- Testing renders in real email clients (a Litmus-style service).
- MJML.
- Zhihu LaTeX handling or X image paste. Image export already covers X.

## Decisions

### D1. Inline computed styles, not stylesheet rules
In the page, each element's style is compared against a baseline: the same tag in a blank iframe. Only the properties that differ are written, from a whitelist of email- and paste-safe properties (box model, typography, color, background-color, border, text-align, vertical-align, width/height on tables and images). Pseudo-elements are dropped, and the check warns when they carried content.
*Alternative:* juice on `<style>` text. It's simpler, but misses runtime CSS and inherits cascade bugs.

### D2. Email is a format; an email artifact is marked in its markup
`format: "email"` works on any html artifact, with the email checks telling the agent what to fix. The `email-campaign` skill marks its email column with `data-od-email`; the visual check runs the email rules on any page with that root, and email export uses it as the content instead of wrapping the page again. *Not* a new manifest kind: the manifest validator is vendored from upstream and only knows upstream's kinds and export values, and diverging from it isn't worth a marker attribute's job.

### D3. Layout safety is checked, not converted
Automatically turning flex or grid into tables produces fragile output. The checks name the offending elements, and the agent rewrites them using the skill's table patterns.

### D4. Paste targets are small rule sets over one inliner
Each target is a list of post-processing steps: unwrapping wrappers, tag rewrites, stripping attributes. Adding a target later (Medium, Substack) is a rule list, not a new pipeline.

### D5. Clipboard in the VS Code webview, with a browser fallback
`vscode.env.clipboard` is text-only. The preview webview tries `navigator.clipboard.write([new ClipboardItem({'text/html': …, 'text/plain': …})])` on the user's click. If that fails (a webview permission problem), it opens the exported file in the default browser and shows "Select all and copy". A spike task verifies this before the UI is built.

## Risks / Trade-offs

- [Computed styles are verbose] → the property whitelist plus the baseline diff; the `email-clip` check watches size.
- [Outlook-specific quirks the checks can't see] → the skill bakes in MSO conditionals and the bulletproof button; the docs say to send a test to real clients before a campaign.
- [Webview clipboard blocked] → browser fallback (D5).

## Migration Plan

Additive. The `email-marketing` template stays in the catalog but leaves the HTML-email surface.

## Open Questions

- Should `email` exports also write a plain-text alternative (`.txt`)? Proposed: yes. It's cheap (the text content with links listed) and some email tools ask for it.
