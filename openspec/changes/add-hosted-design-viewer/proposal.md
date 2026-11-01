## Why

In the hosted gateway, the in-chat MCP Apps view is the main preview. Two cases still need a plain web link:
- Hosts or clients where views don't render, or where the design is too big to pass inline (results over about 150k characters).
- A user who wants to open the design full-screen or send it to someone.

Today the remote profile falls back to temporary Netlify or Cloudflare publish providers. That means a third-party account, an extra hop, and user content leaving our control without a retention rule. Depends on `add-mcp-gateway`.

## What Changes

- **Viewer routes in the gateway** under a separate user-content host, for example `https://<usercontent-domain>/v/<view id>/`. They serve a project's entry HTML and its assets, read-only.
- **The view id is not the project handle.** `show_open_design_artifact` (and export or publish replies) mint a view id per artifact revision, so sharing a link never grants access to the project.
- **A separate registrable domain** (not a subdomain of feimacode.com) with no cookies and a strict Content Security Policy. Designs are untrusted HTML, so their script must not run on the API or sign-in origin.
- **Same retention as the project.** Links stop working when the project is deleted. Each page carries `noindex` and `X-Robots-Tag: noindex`.
- **The remote profile stops offering temporary third-party publishing** and returns the viewer link instead.
- **Allowed link URIs.** The viewer origin is declared in the Claude directory listing, so opening a link shows no confirmation prompt.

Not in this change: comments on the viewer, password-protected or account-only links (after sign-in), custom domains.

## Capabilities

### New Capabilities
- `hosted-design-viewer`: read-only viewer links for hosted projects.

### Modified Capabilities
None (the remote publish change is inside `mcp-gateway` behaviour).

## Impact

- `packages/mcp-gateway`: viewer routes, view-id store (a file per project), host-based routing.
- `packages/mcp-server`: `REMOTE_PUBLISH_PROVIDERS` emptied for the gateway.
- Cloudflare: one more domain and DNS record (in `deploy-hosted-gateway`).
