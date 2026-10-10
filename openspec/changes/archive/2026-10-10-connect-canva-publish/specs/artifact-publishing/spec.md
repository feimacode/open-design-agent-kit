## MODIFIED Requirements

### Requirement: Publish Instructions Tool
The system SHALL provide `publish_open_design_artifact` in both the VS Code language-model tool surface and the MCP server. It SHALL accept `entryPath`, an optional `provider`, an optional `badge`, an optional `includeFiles` list and an optional `published` object.

`includeFiles` SHALL name workspace paths of files inside the artifact's own `exports/` folder, excluding the site bundle itself. Each SHALL be copied into the bundle at `files/<file name>`. The result SHALL list each included file with its path in the bundle, and the publish instructions SHALL present those files as going public. A path outside the artifact's `exports/` folder, a missing file, or two files with the same name SHALL return an error without writing a bundle.

Without `published`, it SHALL:
- run the `site` export
- return the bundle path, the preflight, and composed instructions for publishing that bundle

It SHALL NOT itself run any provider command, make any network request, or read or store any hosting credential.

The `provider` values SHALL be:
- `netlify-temporary`: no account, claimable
- `cloudflare-temporary`: no account, about 60 minutes, claimable
- `netlify`, `vercel`, `cloudflare-pages` and `github-pages`: the user's own logged-in CLI

When `provider` is omitted, the instructions SHALL present these choices with their tradeoffs (lifetime, account needed, visibility) and ask the user to pick.

#### Scenario: Unregistered artifact
- **WHEN** the tool is called with an `entryPath` that has no manifest sidecar
- **THEN** it SHALL return a not-registered result and SHALL NOT write a bundle

#### Scenario: Temporary provider
- **WHEN** the tool is called with `provider: "netlify-temporary"`
- **THEN** the instructions SHALL contain the deploy command with `--allow-anonymous`, run from the bundle directory, and SHALL state that the link must be claimed within the provider's window or it expires

#### Scenario: Own-hosting provider not logged in
- **WHEN** the tool is called with `provider: "vercel"`
- **THEN** the instructions SHALL require running `vercel whoami` first, and on failure SHALL tell the model to stop and ask the user to log in (`vercel login`), never to invent a team or token

#### Scenario: Bundle build fails
- **WHEN** the `site` export fails with `missing-references`
- **THEN** the tool SHALL return that error and SHALL NOT return publish instructions

#### Scenario: Export file included in the bundle
- **WHEN** the tool is called with `includeFiles: [".open-design/poster/exports/poster.pdf"]` for that artifact
- **THEN** the bundle SHALL contain `files/poster.pdf` and the result SHALL list it as going public at `<site URL>/files/poster.pdf`

#### Scenario: File outside the artifact's exports rejected
- **WHEN** `includeFiles` names a file outside the artifact's `exports/` folder
- **THEN** the tool SHALL return an error and SHALL NOT write a bundle
