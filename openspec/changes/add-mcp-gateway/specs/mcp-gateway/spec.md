## ADDED Requirements

### Requirement: Gateway Package
Hosted-only code SHALL live in `packages/mcp-gateway`, which SHALL use the tool registry, remote tool filter and tool annotations from `packages/mcp-server`. `packages/mcp-server` SHALL NOT depend on the gateway, and its stdio behaviour SHALL be unchanged.

#### Scenario: Stdio install has no gateway code
- **WHEN** a user installs `@feimacode/open-design-agent-kit-mcp` and runs it over stdio
- **THEN** no gateway module SHALL be installed or loaded

#### Scenario: Same tools minus local-only ones
- **WHEN** a client lists tools on the gateway
- **THEN** the list SHALL equal the stdio tool list minus every tool in `REMOTE_HIDDEN_TOOLS`, plus the gateway's own tools

### Requirement: Stateless Protocol
The gateway SHALL serve the MCP protocol revision 2026-07-28 without protocol sessions, and SHALL keep serving the previous revision. No request SHALL depend on in-memory state from an earlier request, apart from caches that can be rebuilt.

#### Scenario: Restart between calls
- **WHEN** the gateway restarts between two tool calls that name the same project
- **THEN** the second call SHALL see the files written by the first

### Requirement: Project Handles
`start_open_design_project` SHALL return an unguessable handle with at least 128 random bits and create an empty project folder for it. Every tool that reads or writes project files SHALL require a `project` argument. Catalog tools SHALL NOT require one. A call with a missing or unknown handle SHALL fail with a plain-language error that names `start_open_design_project`.

#### Scenario: Projects isolated
- **WHEN** two projects each write `poster/poster.html`
- **THEN** each SHALL read back only its own file

#### Scenario: Unknown handle
- **WHEN** a tool is called with a handle that doesn't exist or has expired
- **THEN** it SHALL return an error that tells the agent to start a new project, and SHALL write nothing

### Requirement: Anonymous Retention
Without sign-in, a project's files SHALL be deleted 7 days after its last request, and export links SHALL expire after 24 hours.

#### Scenario: Idle project
- **WHEN** a project has had no request for more than 7 days
- **THEN** its folder SHALL be deleted

### Requirement: Directory Tool Metadata
Every tool the gateway lists SHALL have a `title` and either `readOnlyHint: true` or a `destructiveHint`. A test SHALL fail when a tool lacks them.

#### Scenario: New tool without a title
- **WHEN** a contributor adds a tool with no title
- **THEN** the unit test SHALL fail and name the tool

### Requirement: Guidance Without Skills
The gateway SHALL send server instructions and MCP prompts, generated at build time from the kit's skill sources, so a host that loads no plugin skills still gets the overview and the main flows.

#### Scenario: ChatGPT web with no skills
- **WHEN** a host connects that loads no skills
- **THEN** the server instructions SHALL tell the agent to start a project, prepare a brief and register the artifact

### Requirement: Asynchronous Long Exports
Exports expected to take longer than 20 seconds SHALL return a job id at once, and `get_open_design_export_status` SHALL return the job's state and, when it's done, the download link. At most two exports SHALL run at once.

#### Scenario: Deck export
- **WHEN** the agent exports a 20-slide deck to PPTX
- **THEN** the call SHALL return a job id within 20 seconds, and a later status call SHALL return an HTTPS link

### Requirement: OpenAI Domain Challenge
The gateway SHALL answer `GET /.well-known/openai-apps-challenge` with the configured challenge value, as plain text.

#### Scenario: Challenge configured
- **WHEN** `OPEN_DESIGN_OPENAI_CHALLENGE` is set and OpenAI fetches the path
- **THEN** the response SHALL be 200 with exactly that value

### Requirement: Project and Client Limits
The gateway SHALL limit each project's file count, total bytes, export count and request rate, and each client IP's rate of new projects. When a limit is reached it SHALL return a plain-language error naming the limit.

#### Scenario: Too many new projects
- **WHEN** one IP starts more projects than the hourly limit
- **THEN** `start_open_design_project` SHALL fail with an error that names the limit
