## Decisions

**1. Separate registrable domain.** Browsers isolate cookies and storage by site, and subdomains of the same site share some of it. A design is arbitrary HTML that the model wrote, so it must not run under feimacode.com, where the sign-in cookies of `auth.feimacode.com` live. Iven picks the domain. It can sit on the same Cloudflare account and the same VM (Traefik routes by host).

**2. View ids per revision.** A `views.json` in the project maps `odv_<random>` to an entry path and revision. A revision link keeps showing that revision even after edits, which suits "here's what I sent you". Revoking a view means deleting its line.

**3. Headers.** `Content-Security-Policy: default-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline' https:; frame-ancestors *` (inline script is needed by many designs), `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, no `Set-Cookie`. Only files under the entry's folder and shared kit assets are served. Path traversal is rejected.

**4. Served from the gateway process.** On one VM, a second service adds nothing. Cloudflare caches assets by view id, and the cache is purged when a project is deleted.

## Risks / Trade-offs

- **Phishing pages on our domain.** A user could make the model build a fake login page and share the link. Mitigations: noindex, 7-day retention, a report link in a small footer bar, and Cloudflare's abuse controls. Revisit before any permanent links.

## Changes while applying (2026-11-01)

- **Copies, not revision pointers.** A view is a copy of the design's folder at the time the link was made (`<data>/views/<id>/site/`, without `exports/` and hidden files), with a global `view.json` pointing at its project. That pins the revision without the kit keeping old revisions, and the copy is deleted with its project.
- **Configuration.** The viewer is on only when `OPEN_DESIGN_USERCONTENT_URL` is set. The gateway refuses to start when it shares a registrable domain with `OPEN_DESIGN_PUBLIC_URL` (last-two-labels check).
