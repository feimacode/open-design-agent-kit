## Context

feima-idp (FastAPI, Postgres schema `idp_schema`) issues RS256 access tokens with `aud = client_id`. It exposes `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`, `/.well-known/openid-configuration` and `/.well-known/jwks.json`, and keeps a table of pre-registered `oauth_clients` with redirect URIs. feima-api verifies those tokens for the VS Code extension.

## Decisions

**1. Reuse feima-idp, pre-registered clients first.** The Claude portal stores an OAuth client ID and secret for a listed connector, so Claude needs no dynamic registration. ChatGPT's requirements must be checked before building: if it only does DCR or CIMD, add that endpoint in feima-idp. Either way, the redirect URIs are exact-match entries on the client rows.

**2. Audience is the resource.** MCP forbids token passthrough and requires audience checks. Issuing `aud = https://<gateway host>/mcp` when `resource` is given keeps feima-api's tokens (aud = client_id) unchanged, so the VS Code extension isn't affected.

**3. Optional, per-tool sign-in.** Anonymous tools never ask for a token. Account tools answer 401 with the metadata pointer. A request with a token gets user projects, and one without gets anonymous projects. This keeps the zero-friction start and still offers a library.

**4. Claiming.** `claim_open_design_project(project)` moves `data/anon/<handle>` to `data/users/<sub>/<new id>` and invalidates the handle. It is an atomic rename on one disk.

**5. No database in the gateway.** A user's projects are the folders under `data/users/<sub>/`, and a `project.json` holds title, created and last-used times. Postgres is used only if quotas or billing need to be shared.

## Host requirements (task 1.1, checked 2026-11-01)

- **Claude** ([docs](https://claude.com/docs/connectors/building/authentication)): a directory listing can use Anthropic-held client credentials: a confidential client we create, with redirect `https://claude.ai/api/mcp/auth_callback`, entered in the developer portal. No DCR or CIMD is needed for the listing. Claude sends PKCE S256 and `resource`, appends `offline_access` when the server metadata lists it, wants `invalid_grant` for a dead refresh token, and waits at most 10 s for discovery and token calls. Custom connectors and Claude Code don't use the portal client; they need CIMD or DCR, or a client ID entered by hand.
- **ChatGPT** ([docs](https://developers.openai.com/apps-sdk/build/auth)): CIMD preferred, DCR or a predefined client also work. It sends `resource` on authorize and token, requires S256 in the metadata, and with RFC 9207 `iss` support uses the fixed redirect `https://chatgpt.com/connector_platform_oauth_redirect` (otherwise a per-app `/connector/oauth/{id}`).

## Changes while applying

- feima-idp (feimacode/feima-idp#6): `resource` allowed only when listed in `OAUTH_RESOURCES`, stored on codes and refresh tokens; requests with `resource` must use S256 and the exact redirect URI; RFC 8414 metadata; `iss` on every authorization response; RFC 6749 token errors; refresh tokens bound to their client. Existing clients without `resource` are unchanged, and `plain` PKCE still works for them although only S256 is advertised.
- Clients `open-design-claude` and `open-design-chatgpt` come from migration 0005, each only when its secret is in the environment (feima-infra Vault), so no secret is in either repository. Both allow sign-up.
- CIMD is left for later: it is what custom connectors, Claude Code and ChatGPT's preferred path use, and it means feima-idp fetching client metadata URLs.

## Open questions for Iven

- Account project retention (suggested 180 days idle, or forever with a size cap).
- Whether to add Google login now.
- Whether the ChatGPT listing starts with "no auth" (anonymous only) and adds OAuth later, or ships with both.
