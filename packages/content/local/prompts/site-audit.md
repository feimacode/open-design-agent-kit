---
name: open-design-site-audit
description: Audit a live website with Open Design's own checks — contrast, tap targets, phone layout, larger text, broken images, page weight and template looks — and get a short, plain-language report of the biggest problems with marked screenshots
argument_hint: the website address, and optionally up to 3 more pages (e.g. "https://rosas.example, plus /menu and /contact")
placeholder: Which website should be audited?
model_trigger: use whenever the user wants a website audited, checked or reviewed for design, accessibility or mobile problems ("audit this site", "what's wrong with our website", "find problems on example.com", "why does our site look bad on phones"), or wants talking points before pitching a redesign, even if they don't mention Open Design
---

Audit a live website with Open Design's checks and report what a visitor runs into.

Request: {{brief}}

{{voice}}

## 1. Ask only what's missing

You need the address. Up to 3 more pages on the same site are optional (a menu, services or contact page). If the request names them, use them; otherwise audit the home page alone and ask nothing.

## 2. Run the audit

Call `audit_open_design_site` with `url` and `extraUrls` if there are any.

- **`ok` or `partial`**: you get the top problems (`top`), the rest (`otherGroups`), page weight and the report path. `partial` means some pages were blocked; say which and why.
- **`blocked`**: nothing could be audited (a bot check, a login wall or an empty page). Show the screenshot, say why, and ask for another public page. Don't retry with other settings.
- An error about the browser means none is installed: say so, and suggest installing Chrome or setting `OPEN_DESIGN_BROWSER_PATH`.

## 3. Report it

Tell the user the top problems in plain words, in the audit's order: the title, where (page, phone or desktop), what it costs a visitor and the fix. Point to the report (`report`) and offer to open it in the preview.

- Quote only what the audit found. Don't add a score, a speed rating, SEO advice or problems you guess at from the screenshots.
- If the report found nothing, say so plainly and list what was checked.
- The audit looks at a site the user may not own. Keep the tone factual: this is evidence for a conversation, not a verdict.

## 4. Next steps

Offer one next step that fits the request:

- **Redesign it**: make a concept that keeps the site's real content and brand and fixes these problems. The `open-design-redesign` skill starts from this audit.
- **Match the brand**: make a design system from the site with `open-design-design-system-from-url`.
- **Share it**: the report is a folder (`index.html` plus images) the user can zip or publish with `open-design-publish`.
