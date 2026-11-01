## 0. Decisions

- [ ] 0.1 Iven: account retention, Google login, and whether ChatGPT launches with OAuth

## 1. feima-idp (PR in feimacode/feima-idp)

- [ ] 1.1 Check Claude's and ChatGPT's current OAuth client requirements (pre-registered vs DCR/CIMD, callback URLs) and record them in design.md
- [ ] 1.2 `resource` parameter on authorize and token; `aud` = resource when present; migration
- [ ] 1.3 `/.well-known/oauth-authorization-server`, `iss` in authorization responses, S256 only
- [ ] 1.4 Client rows for Claude and ChatGPT; scopes `open-design:projects`, `offline_access`; consent wording
- [ ] 1.5 DCR or CIMD only if 1.1 says a host needs it

## 2. Gateway

- [ ] 2.1 `/.well-known/oauth-protected-resource`; JWT verification (JWKS cache, issuer, expiry, audience); 401 with `WWW-Authenticate` on account tools; tests with a local key pair
- [ ] 2.2 User projects under `data/users/<sub>/`; `start_open_design_project` uses them when signed in
- [ ] 2.3 `list_open_design_projects`, `claim_open_design_project`, `delete_open_design_project` (destructive) with titles and annotations; tests
- [ ] 2.4 Retention sweep for account projects using the 0.1 value

## 3. Verification

- [ ] 3.1 Claude custom connector: sign in with GitHub, start a project, open it in a new chat
- [ ] 3.2 ChatGPT developer mode: the same
- [ ] 3.3 A token issued for feima-api (aud = client_id) is rejected by the gateway
