## ADDED Requirements

### Requirement: Read-Only Viewer Links
The gateway SHALL serve a hosted artifact at `https://<usercontent-domain>/v/<view id>/`, read-only. The view id SHALL be minted per artifact revision and SHALL NOT be the project handle or reveal it.

#### Scenario: Link without views
- **WHEN** an agent shows an artifact on a host that doesn't render MCP Apps views
- **THEN** the reply SHALL include a viewer link that opens that revision of the design

#### Scenario: Link doesn't open the project
- **WHEN** someone has a viewer link
- **THEN** they SHALL NOT be able to list, read or change any other file of the project with it

### Requirement: Isolated Origin
Viewer pages SHALL be served only from a registrable domain other than feimacode.com, SHALL set no cookies, and SHALL send `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`.

#### Scenario: Script in a design
- **WHEN** a design's script runs in the viewer
- **THEN** it SHALL have no access to cookies or storage of feimacode.com origins

### Requirement: Viewer Retention
A viewer link SHALL stop working when its project is deleted, and SHALL return a plain page saying the design has expired.

#### Scenario: Expired project
- **WHEN** a project has been swept
- **THEN** its viewer links SHALL return 404 with an "expired" page

### Requirement: No Third-Party Publishing in the Gateway
In the gateway, publishing SHALL return a viewer link and SHALL NOT upload designs to third-party hosting.

#### Scenario: Publish requested
- **WHEN** the agent calls `publish_open_design_artifact` on the gateway
- **THEN** the result SHALL be a viewer link, and no request SHALL go to Netlify or Cloudflare Pages
