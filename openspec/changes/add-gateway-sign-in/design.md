## Context

feima-idp (FastAPI, Postgres schema `idp_schema`) issues RS256 access tokens with `aud = client_id`. It exposes `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`, `/.well-known/openid-configuration` and `/.well-known/jwks.json`, and keeps a table of pre-registered `oauth_clients` with redirect URIs. feima-api verifies those tokens for the VS Code extension.

## Decisions

**1. Reuse feima-idp, pre-registered clients first.** The Claude portal stores an OAuth client ID and secret for a listed connector, so Claude needs no dynamic registration. ChatGPT's requirements must be checked before building: if it only does DCR or CIMD, add that endpoint in feima-idp. Either way, the redirect URIs are exact-match entries on the client rows.

**2. Audience is the resource.** MCP forbids token passthrough and requires audience checks. Issuing `aud = https://<gateway host>/mcp` when `resource` is given keeps feima-api's tokens (aud = client_id) unchanged, so the VS Code extension isn't affected.

**3. Optional, per-tool sign-in.** Anonymous tools never ask for a token. Account tools answer 401 with the metadata pointer. A request with a token gets user projects, and one without gets anonymous projects. This keeps the zero-friction start and still offers a library.

**4. Claiming.** `claim_open_design_project(project)` moves `data/anon/<handle>` to `data/users/<sub>/<new id>` and invalidates the handle. It is an atomic rename on one disk.

**5. No database in the gateway.** A user's projects are the folders under `data/users/<sub>/`, and a `project.json` holds title, created and last-used times. Postgres is used only if quotas or billing need to be shared.

## Open questions for Iven

- Account project retention (suggested 180 days idle, or forever with a size cap).
- Whether to add Google login now.
- Whether the ChatGPT listing starts with "no auth" (anonymous only) and adds OAuth later, or ships with both.
