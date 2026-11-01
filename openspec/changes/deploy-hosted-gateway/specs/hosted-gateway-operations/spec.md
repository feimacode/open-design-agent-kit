## ADDED Requirements

### Requirement: Published Gateway Image
The release workflow SHALL build the gateway image, run the smoke test against it, and push it to GHCR with the release version as its tag. An image that fails the smoke test SHALL NOT be pushed.

#### Scenario: Release
- **WHEN** a release runs for version 0.5.0
- **THEN** `ghcr.io/feimacode/open-design-gateway:0.5.0` SHALL exist and SHALL have passed the smoke test

### Requirement: Machine-Reachable Edge
The public host SHALL serve HTTPS through Cloudflare and SHALL NOT present a browser challenge on `/mcp`, `/.well-known/*` or viewer paths.

#### Scenario: Host connects
- **WHEN** ChatGPT or Claude sends a request to `/mcp`
- **THEN** the request SHALL reach the gateway without an interstitial page

### Requirement: Resource Isolation on the Shared VM
The gateway container SHALL run with CPU and memory limits, so that exports can't use more than its share of the VM.

#### Scenario: Export burst
- **WHEN** the export queue is full
- **THEN** feima-api's health check SHALL keep answering within its normal time

### Requirement: Backups and Restore
The data folder SHALL be backed up nightly to object storage and kept for 7 days, and a restore SHALL be tested before the first submission.

#### Scenario: Restore
- **WHEN** the data folder is lost
- **THEN** it SHALL be restorable from the last nightly backup with the documented steps

### Requirement: Read-Only Kill Switch
With `OPEN_DESIGN_GATEWAY_READONLY=1`, every write tool SHALL return a plain maintenance message, and read tools and viewer links SHALL keep working.

#### Scenario: Maintenance
- **WHEN** the switch is on and the agent registers an artifact
- **THEN** the tool SHALL return the maintenance message and write nothing

### Requirement: Listing Materials
The repo SHALL hold a privacy policy and terms that cover hosted data (location, retention, deletion, contact), a reviewer guide with test prompts, and the OpenAI test cases, before either submission.

#### Scenario: Privacy policy
- **WHEN** a reviewer opens the privacy policy URL
- **THEN** it SHALL state that designs are stored in Singapore, deleted after 7 days without an account, and how to request deletion

### Requirement: Hosted Listing Only for Directories
The hosted URL SHALL be used by the Claude connector listing and by the ChatGPT directory plugin variant only. Every other install path SHALL keep the local stdio server.

#### Scenario: Self-install zip
- **WHEN** a user installs the ChatGPT plugin zip with `install chatgpt`
- **THEN** its `mcp.json` SHALL start the bundled local server, not the hosted URL
