## 0. Spike

- [ ] 0.1 Verify `navigator.clipboard.write` with `text/html` from the preview webview (Windows, macOS, Linux; a user click); record the result in design D5

## 1. Inliner

- [ ] 1.1 `export/inlineStyles.ts`: self-contained page script (baseline iframe, property whitelist, attribute stripping), plus the Node wrapper on `openArtifactPage`
- [ ] 1.2 Browser tests: Tailwind CDN page, nested inheritance, pseudo-element content warning

## 2. Email

- [ ] 2.1 `format: "email"`: document wrapper, presentation tables, preheader, dark-mode meta, `.email.txt`, `baseUrl` rewriting; the `email` kind in `EXPORTS_BY_KIND`
- [ ] 2.2 Email preflight page script plus the size check; run on email exports and in `checkArtifact` for the `email` kind; tests, including the vendored email-marketing example
- [ ] 2.3 `local/skills/email-campaign/` with an example that passes every email check; the HTML-email surface switches to it

## 3. Paste

- [ ] 3.1 `format: "paste"` with the `wechat`, `notion`, `newsletter` and `generic` rule sets; tests per target
- [ ] 3.2 VS Code preview "Copy for…" menu: rich clipboard with the browser fallback
- [ ] 3.3 Tool schemas (VS Code, MCP), CLI `--format email|paste --target`, result text with copy guidance

## 4. Docs and verification

- [ ] 4.1 Guides "HTML email" and "Paste into WeChat, Notion and newsletters"; tools/CLI reference; docs check
- [ ] 4.2 Manual: send a generated email to Gmail web, Outlook desktop and Apple Mail; paste into the WeChat editor and Notion
