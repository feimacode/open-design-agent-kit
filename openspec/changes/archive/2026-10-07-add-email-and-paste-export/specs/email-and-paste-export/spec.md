## ADDED Requirements

### Requirement: Computed-Style Inliner
The system SHALL inline the browser's computed styles onto elements for `email` and `paste` exports, writing only whitelisted properties that differ from the element's default style, and SHALL remove `<script>`, `<style>`, `class` and `data-od-*` attributes from the output. Styles produced at runtime (e.g. Tailwind CDN classes) SHALL be inlined like any other.

#### Scenario: Tailwind CDN page
- **WHEN** a page styled only with Tailwind CDN classes is exported with `format: "paste", target: "generic"`
- **THEN** the output elements SHALL carry the computed colors, sizes and spacing inline, and no `class` attributes

### Requirement: Email Export
`export_open_design_artifact` SHALL accept `format: "email"` for HTML artifacts and SHALL write `exports/<name>.email.html` (a complete document: 600 px container, presentation tables, preheader, dark-mode meta tags) and `exports/<name>.email.txt` (the text with links listed). With `baseUrl`, relative image and link references SHALL be rewritten to absolute URLs.

#### Scenario: Launch email with a hosted image folder
- **WHEN** an email artifact referencing `assets/hero.png` is exported with `format: "email", baseUrl: "https://cdn.example.com/launch/"`
- **THEN** the written HTML SHALL reference `https://cdn.example.com/launch/assets/hero.png`

### Requirement: Email Preflight
Email exports, and visual checks of email artifacts (pages with a `[data-od-email]` column root, where local images are reported as `info` until export), SHALL report: `email-layout` (flex, grid or absolute positioning used for layout), `email-unsupported-css` (transform, unresolved CSS variables, gradient backgrounds without a solid fallback, fixed positioning), `email-svg` (inline SVG or SVG images), `email-local-image` (relative image sources without `baseUrl`), `email-missing-alt`, `email-width` (content wider than 640 px) and `email-clip` (HTML over 102 KB). Findings SHALL name the elements and SHALL NOT block the export.

#### Scenario: The current email-marketing example
- **WHEN** the vendored `email-marketing` example is exported with `format: "email"`
- **THEN** findings SHALL include `email-layout` and `email-svg`, and the files SHALL still be written

### Requirement: Inbox-Safe Email Skill
The catalog SHALL include a local `email-campaign` skill that produces table-based layouts, a bulletproof button, Outlook conditional comments, a font stack with web-safe fallbacks, a solid fallback for every gradient, a preheader and a footer with unsubscribe and view-in-browser links, and marks its email column with `data-od-email`. A fresh `email-campaign` artifact SHALL produce no email preflight errors.

#### Scenario: Generated newsletter
- **WHEN** the agent builds a newsletter with `email-campaign` and checks it
- **THEN** the check SHALL report no email errors

### Requirement: Paste Export
`export_open_design_artifact` SHALL accept `format: "paste"` with `target` `wechat`, `notion`, `newsletter` or `generic`, and SHALL write `exports/<name>.<target>.html` containing an inlined body fragment with that target's rules applied: WeChat (top-level `<section>` wrappers, no external fonts), Notion (wrappers flattened, `pre > code` with a language class, `class`/`data-*` removed), newsletter (email preflight rules applied to the fragment).

#### Scenario: Blog post to WeChat
- **WHEN** an article artifact is exported with `format: "paste", target: "wechat"`
- **THEN** the fragment SHALL have no `<style>` or `class`, and each top-level block SHALL be a `<section>` with inline styles

### Requirement: Copy for Paste
The VS Code preview SHALL offer "Copy for…" (Email, WeChat, Notion, Newsletter), which runs the matching export and puts the result on the clipboard as `text/html` with a `text/plain` alternative. If the clipboard write fails, it SHALL open the exported file in the default browser and tell the user to select all and copy. On other hosts, the export result SHALL tell the user to open the file in a browser and copy it.

#### Scenario: Clipboard permission denied
- **WHEN** the webview's rich-clipboard write throws
- **THEN** the exported file SHALL open in the default browser with a "select all and copy" notice
