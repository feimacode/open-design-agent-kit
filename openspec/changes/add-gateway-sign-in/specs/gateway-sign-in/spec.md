## ADDED Requirements

### Requirement: Protected Resource Metadata
The gateway SHALL serve `/.well-known/oauth-protected-resource` naming feima-idp's issuer as its authorization server and its `/mcp` URL as the resource.

#### Scenario: Host discovers sign-in
- **WHEN** a host fetches the metadata
- **THEN** it SHALL find `authorization_servers` containing `https://auth.feimacode.com` and `resource` equal to the gateway's `/mcp` URL

### Requirement: Optional Sign-In
Anonymous tools SHALL work without a token. Tools that need an account SHALL return HTTP 401 with a `WWW-Authenticate: Bearer` header carrying `resource_metadata` when no valid token is sent.

#### Scenario: Library without sign-in
- **WHEN** a client with no token calls `list_open_design_projects`
- **THEN** the gateway SHALL answer 401 with the metadata pointer, and the host SHALL be able to start sign-in

### Requirement: Token Validation
The gateway SHALL accept only JWTs signed by a key in feima-idp's JWKS, with the expected issuer, an unexpired `exp` and an `aud` equal to its resource URL. It SHALL NOT forward tokens to any other service.

#### Scenario: Token for another service
- **WHEN** a request carries a valid feima-idp token whose `aud` is a client_id
- **THEN** the gateway SHALL reject it with 401

### Requirement: User Projects
A signed-in user's projects SHALL be stored under that user's `sub`, SHALL be listed by `list_open_design_projects`, and SHALL be reachable from any conversation by the same user. No user SHALL reach another user's project.

#### Scenario: New chat
- **WHEN** a signed-in user starts a new conversation and lists projects
- **THEN** the projects from earlier conversations SHALL be listed

#### Scenario: Another user's project
- **WHEN** user A calls a tool with user B's project id
- **THEN** the gateway SHALL answer as if the project doesn't exist

### Requirement: Claim and Delete
`claim_open_design_project` SHALL move an anonymous project into the signed-in user's projects and invalidate its handle. `delete_open_design_project` SHALL be annotated destructive and SHALL delete the project and its viewer links.

#### Scenario: Claim
- **WHEN** a signed-in user claims an anonymous project
- **THEN** the project SHALL appear in their list, and the old handle SHALL return the unknown-handle error

### Requirement: Authorization Server Behaviour
feima-idp SHALL accept the `resource` parameter and issue access tokens whose `aud` is that resource, SHALL publish RFC 8414 metadata, and SHALL support only S256 PKCE for MCP clients.

#### Scenario: Token request with resource
- **WHEN** a host exchanges a code with `resource=https://<gateway host>/mcp`
- **THEN** the access token's `aud` SHALL be that URL
