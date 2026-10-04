## ADDED Requirements

### Requirement: No Published Package Depends on a Private Package at Runtime
Any package intended for real npm distribution (currently `packages/content`, `packages/mcp-server`, `packages/cli`) SHALL NOT declare a `private: true` workspace package as a `dependencies` entry that is actually resolved at runtime. A workspace package consumed only at build time (fully inlined by a bundler, never `require`d by the shipped output) SHALL be a `devDependencies` entry instead, regardless of whether it remains private.

#### Scenario: A build-time-only workspace dependency is not a runtime dependency
- **WHEN** a publishable package's compiled/bundled output contains no reference to another workspace package (verified by inspecting the built artifact)
- **THEN** that workspace package SHALL be listed under `devDependencies`, not `dependencies`, in the publishable package's `package.json`

#### Scenario: A real runtime dependency on a workspace package requires that package to be publishable
- **WHEN** a publishable package's compiled/bundled output resolves another workspace package at runtime (e.g. via `require.resolve`)
- **THEN** that workspace package SHALL NOT be `private: true`

### Requirement: Cross-Package Runtime Dependency Ranges Are Pinned, Not Wildcarded
A publishable package's `dependencies` entry for another package published from the same monorepo, in the same release, SHALL reference a specific version or version range reflecting what was actually published together, not an unconstrained `*` wildcard, so a future incompatible release of the depended-upon package cannot silently break existing installs.

#### Scenario: The published package.json has a pinned range
- **WHEN** `packages/mcp-server` is published
- **THEN** its published `package.json`'s dependency on `@feimacode/open-design-agent-kit-content` SHALL reference the version actually published in that same release, not `*`

### Requirement: Real Registry Resolution Is Verified Before Any Real Publish
The system SHALL verify, via an automated check against a real (non-mocked) npm registry protocol implementation, that every publishable package and its declared runtime dependencies resolve and execute correctly from a completely isolated environment with no access to the monorepo's own `node_modules`, before a real publish to the public registry is permitted to proceed.

#### Scenario: The verification actually starts the MCP server and exercises it
- **WHEN** the automated check runs
- **THEN** it SHALL publish all publishable packages to a real (local) registry, resolve `@feimacode/open-design-agent-kit-mcp` via `npx` from an isolated directory, and confirm a real MCP `initialize` → `tools/list` → `tools/call` sequence succeeds with real vendored content returned

#### Scenario: The verification also exercises the init CLI
- **WHEN** the automated check runs
- **THEN** it SHALL also resolve `@feimacode/open-design-agent-kit` via `npx` from an isolated directory and confirm `init` produces the expected files for both supported hosts

#### Scenario: A failed verification blocks publishing
- **WHEN** the automated check fails for any reason (resolution failure, timeout, an assertion about tool output not matching)
- **THEN** the CI pipeline SHALL fail before reaching the real-publish step, and no package SHALL be published to the public registry as a result of that run

### Requirement: Publishing to the Real Registry Requires Explicit, Separate Confirmation
Publishing any of the three npm packages to the real public registry SHALL be a separate action from building and verifying them, requiring an explicit, typed confirmation and never triggered automatically by a build or tag push alone.

#### Scenario: A tag or automatic build does not publish
- **WHEN** the build/validate workflow runs (on a tag push or otherwise)
- **THEN** it SHALL NOT publish any package to the real npm registry

#### Scenario: Publishing requires a typed confirmation
- **WHEN** the publish workflow is manually triggered
- **THEN** it SHALL require an input matching an exact confirmation string before proceeding, and SHALL fail immediately if that input does not match

### Requirement: All Artifacts for One Version Ship From a Single Shared Release
The `.vsix` and the three npm package tarballs for a given version SHALL be built by the same workflow run and attached to the same GitHub Release, rather than produced by independent release pipelines that could drift to different versions or be released at different, untracked times.

#### Scenario: One release lists every artifact
- **WHEN** a release is created for a given version
- **THEN** that GitHub Release SHALL include the `.vsix`, the three npm package tarballs, and a checksum for each

#### Scenario: Publishing downloads from the shared release, not a fresh rebuild
- **WHEN** a publish workflow (marketplace or npm) runs
- **THEN** it SHALL download the artifact it publishes from the existing GitHub Release for the requested version and verify its checksum, rather than rebuilding that artifact itself
