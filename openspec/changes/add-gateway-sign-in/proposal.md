## Why

Anonymous projects (`add-mcp-gateway`) cover "make, preview and export in one chat". Sign-in is needed as soon as work should outlive the chat:
- a library a user can reopen in a new conversation or on another device
- fair per-person quotas or paid plans
- private sharing or approvals
- "delete all my data"

It is also the fallback if a Claude reviewer decides that stored user designs aren't the "public data" that no-auth connectors are meant for.

Feima already runs an OAuth 2 identity provider, `feimacode/feima-idp` at `auth.feimacode.com` (PKCE, RS256 JWTs, JWKS, OIDC discovery, GitHub, email, WeChat and Weibo login). Iven decided on 2026-11-01 to reuse it rather than add a new provider. Depends on `add-mcp-gateway`.

## What Changes

**In this repo (gateway):**
- **Protected resource metadata** (RFC 9728) at `/.well-known/oauth-protected-resource`, naming `https://auth.feimacode.com` as the authorization server and the gateway's `/mcp` URL as the resource.
- **Optional sign-in.** Anonymous use keeps working. Tools that need an account (`list_open_design_projects`, `claim_open_design_project`, and later sharing) return `401` with `WWW-Authenticate: Bearer resource_metadata="…"`, so the host runs the sign-in flow. This matches Claude's "Required when the server asks" setting and per-tool security schemes in ChatGPT.
- **Token checks.** The gateway verifies the JWT signature against feima-idp's JWKS, plus the issuer, expiry and `aud` equal to the gateway's resource URL. It never forwards the token anywhere.
- **User projects.** Signed-in projects live under `data/users/<sub>/<project id>/`. `start_open_design_project` creates them there when a valid token is present. `list_open_design_projects` lists them. `claim_open_design_project` moves an anonymous project into the user's folder.
- **Account retention.** A signed-in project is kept until the user deletes it, or for an idle period Iven sets (suggested: 180 days). `delete_open_design_project` (destructive) deletes one project.

**In `feimacode/feima-idp` (cross-repo tasks, proposed there as a PR):**
- **Client registration for MCP hosts.** Pre-registered confidential clients for Claude (whose portal can hold the client ID and secret) and ChatGPT, each with that host's exact callback URLs. Add Dynamic Client Registration (`POST /oauth/register`) or Client ID Metadata Documents only if a host requires it.
- **Resource indicators** (RFC 8707). Accept `resource` on authorize and token requests and issue access tokens with `aud` set to the resource. Today `aud` is the client_id.
- **`/.well-known/oauth-authorization-server`** (RFC 8414) beside the OIDC discovery document. Add the `iss` parameter in authorization responses (RFC 9207). S256 PKCE only (drop `plain`).
- **Scopes** `open-design:projects` and `offline_access`, shown on the consent page in plain words.
- **Google login** for non-Chinese users (optional, Iven's call).

Not in this change: paid plans, teams, Postgres. The user record stays in feima-idp, and the gateway only reads `sub`.

## Capabilities

### New Capabilities
- `gateway-sign-in`: optional OAuth sign-in on the gateway, user projects, claim and delete, and the requirements on the authorization server.

### Modified Capabilities
None.

## Impact

- `packages/mcp-gateway`: auth middleware (`jose` for JWKS), the metadata route and the new tools.
- `feimacode/feima-idp`: OAuth changes listed above, its own PR and migration (a `resource` column on authorization codes, plus client rows).
- Privacy policy: account data and retention (in `deploy-hosted-gateway`).
