## ADDED Requirements

### Requirement: HTTP Transport
The server SHALL accept `--http` (with an optional `--port`) and then serve MCP over streamable HTTP at `/mcp` and a health check at `/healthz`. Without `--http` it SHALL use stdio as today.

#### Scenario: HTTP handshake
- **WHEN** the server runs with `--http --port 8080` and an MCP client connects to `http://localhost:8080/mcp`
- **THEN** the handshake SHALL succeed and `tools/list` SHALL return the remote tool set

### Requirement: Remote Profile Tool Set
With `OPEN_DESIGN_PROFILE=remote`, every session SHALL be folderless with its own workspace, and the server SHALL hide every tool in a single `REMOTE_HIDDEN_TOOLS` set. That set SHALL cover tools that need the user's disk, a local browser window or a local token. Every tool SHALL be classified as remote-available or remote-hidden, and a test SHALL fail when a tool is neither.

#### Scenario: Local preview hidden
- **WHEN** a client lists tools under the remote profile
- **THEN** `open_open_design_preview` and `set_open_design_workspace` SHALL NOT be listed, and `write_open_design_file` SHALL be listed

#### Scenario: Sessions isolated
- **WHEN** two sessions each write `poster/poster.html`
- **THEN** each SHALL read back only its own file

### Requirement: Session Storage and Expiry
Under the remote profile, each session's workspace files SHALL be kept in a folder of its own under the data directory, named by an opaque session id, and deleted 7 days after the session's last request. Export download links SHALL expire after 24 hours.

#### Scenario: Expired session
- **WHEN** a session has had no request for more than 7 days
- **THEN** its files SHALL be deleted

### Requirement: Exports as Links
Under the remote profile, `export_open_design_artifact` SHALL store the exported file and return an HTTPS link to download it instead of a local path.

#### Scenario: PDF export
- **WHEN** the agent exports a poster to PDF in a remote session
- **THEN** the result SHALL contain an HTTPS link that returns the PDF

### Requirement: Per-Session Limits
Under the remote profile, the server SHALL limit each session's file count, total bytes, export count and request rate, and SHALL return a plain-language error naming the limit when one is reached.

#### Scenario: Too many exports
- **WHEN** a session reaches its export limit and asks for another export
- **THEN** the tool SHALL return an error that names the limit, and no file SHALL be stored
