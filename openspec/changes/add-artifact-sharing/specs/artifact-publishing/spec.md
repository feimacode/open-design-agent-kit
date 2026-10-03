## ADDED Requirements

### Requirement: Optional Footer Badge
When the `site` or `standalone` export includes the badge, the system SHALL insert the following before the document's real closing `</body>` tag:
- one `<aside data-od-badge>` element with inline, scoped styles, reading "Made with Open Design" and linking to the project and to remixing
- a close control that hides it

The badge SHALL NOT load any external script, stylesheet, font or image, and SHALL NOT be inserted into a `</body>` that appears inside a script or comment. Whether the badge is included SHALL be decided in this order: the call's `badge` argument, the `OPEN_DESIGN_SHARE_BADGE` env var (`0`/`false` disables, `1`/`true` enables), the `openDesign.share.badge` VS Code setting, then the format default (on for `site`, off for `standalone`).

#### Scenario: Site bundle by default
- **WHEN** an artifact is exported with `format: "site"` and no badge argument, env var or setting
- **THEN** `exports/site/index.html` SHALL contain exactly one `[data-od-badge]` element, and no new `<script src>` or `<link>` to a remote host

#### Scenario: Opt out per call
- **WHEN** an artifact is exported with `format: "site"` and `badge: false`
- **THEN** `exports/site/index.html` SHALL contain no `[data-od-badge]` element

#### Scenario: Standalone download default
- **WHEN** an artifact is exported with `format: "standalone"` and no badge argument, env var or setting
- **THEN** the output SHALL contain no `[data-od-badge]` element

#### Scenario: Body tag inside a script string
- **WHEN** the entry contains a script with the string literal `"</body>"` before the real closing tag
- **THEN** the badge SHALL be inserted only before the real closing tag and the script SHALL be unchanged

#### Scenario: Source untouched
- **WHEN** any badge-bearing export runs
- **THEN** the artifact's own entry file SHALL be byte-identical before and after

### Requirement: Link Preview Metadata
The `site` export SHALL add `<title>`, `og:title`, `og:description` and `twitter:card` when they're missing, taken from the manifest's title and description. It SHALL NOT overwrite tags the entry already has. When `exports/<entry-basename>.png` exists, the export SHALL copy it to `og.png` in the bundle. It SHALL emit `og:image` (and `twitter:image`) as an absolute URL only when a base URL is known, either from an explicit `baseUrl` argument or from the most recent `metadata.shares` record whose provider is the one being published to.

#### Scenario: First publish, URL unknown
- **WHEN** an artifact with a PNG export and no share records is exported as `site`
- **THEN** `index.html` SHALL contain `og:title` and SHALL NOT contain `og:image`, and the bundle SHALL contain `og.png`

#### Scenario: Republish with a known URL
- **WHEN** the artifact has a share record with url `https://pitch-abc.netlify.app/` and is exported as `site` for provider `netlify`
- **THEN** `index.html` SHALL contain `og:image` with content `https://pitch-abc.netlify.app/og.png`

#### Scenario: Author-provided tags win
- **WHEN** the entry already declares `og:title`
- **THEN** the bundle SHALL keep that value and SHALL NOT add a second `og:title`

### Requirement: Publish Preflight
The `site` export result SHALL include a preflight with every file's bundle path and size, the total bytes, and warnings. The warnings SHALL use stable codes:
- `large-asset`: a single file over 5 MiB
- `large-html`: an entry over 2 MiB
- `large-bundle`: a total over 50 MiB
- `no-doctype`
- `no-viewport`
- `external-script`: a remote `<script src>`
- `external-stylesheet`: a remote stylesheet

#### Scenario: Missing viewport and external script
- **WHEN** an entry has no `<meta name="viewport">` and loads `https://cdn.tailwindcss.com`
- **THEN** the preflight warnings SHALL include `no-viewport` and `external-script` naming that URL

### Requirement: Publish Instructions Tool
The system SHALL provide `publish_open_design_artifact` in both the VS Code language-model tool surface and the MCP server. It SHALL accept `entryPath`, an optional `provider`, an optional `badge` and an optional `published` object.

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

### Requirement: Explicit Confirmation Before Anything Goes Public
The composed publish instructions SHALL require the model to stop before running any deploy command. At that point it SHALL show the user:
- the provider
- the files going out (from the preflight)
- that the result is publicly reachable
- the expiry for temporary providers
- whether the badge is present and how to remove it
- for `github-pages`, that Pages sites are public even from private repositories

It SHALL then proceed only after an explicit yes in the same conversation. The instructions SHALL forbid deploying from any directory other than the bundle directory, and SHALL forbid retrying a failed deploy with guessed commands.

#### Scenario: Confirmation stage present for every provider
- **WHEN** publish instructions are composed for any of the six providers
- **THEN** they SHALL contain a stop-and-confirm stage before the first deploy command, mentioning public visibility and the badge

### Requirement: Share Records
When `publish_open_design_artifact` is called with `published: { provider, url, claimUrl?, expiresAt?, siteRef? }`, it SHALL:
- validate that `url` is `https:`
- write a record `{ provider, url, claimUrl?, expiresAt?, siteRef?, publishedAt }` into the manifest's `metadata.shares`, replacing any record with the same `provider` and `siteRef`
- keep at most 20 records, dropping the oldest

It SHALL NOT rebuild the bundle in this mode. The composed instructions SHALL tell the model to make this call after a successful deploy. When records exist for the chosen provider, they SHALL tell it to redeploy to the recorded `siteRef`, not create a new site.

#### Scenario: Recording a temporary link
- **WHEN** the tool is called with `published: { provider: "cloudflare-temporary", url: "https://x.workers.dev", claimUrl: "https://dash.cloudflare.com/claim/…", expiresAt: "2026-10-03T13:00:00Z" }`
- **THEN** the manifest's `metadata.shares` SHALL contain that record with a `publishedAt` timestamp

#### Scenario: Republishing replaces the record
- **WHEN** a second record for provider `netlify` and the same `siteRef` is recorded
- **THEN** `metadata.shares` SHALL hold one `netlify` record for that `siteRef`, with the newer `url` and `publishedAt`

#### Scenario: Non-https URL rejected
- **WHEN** `published.url` is `http://example.com` or `file:///tmp/x.html`
- **THEN** the tool SHALL return an invalid-args error and SHALL NOT modify the manifest

### Requirement: VS Code Share Button
The artifact preview editor toolbar SHALL include a **Share** button that opens a native quick pick with these items:
- **Download standalone HTML**: runs the `standalone` export, opens the native save dialog, and copies the file to the chosen location, with no chat involvement
- **Get a temporary link**: opens chat prefilled with the publish command and a temporary provider
- **Publish to my hosting**: opens chat prefilled with the publish command and no provider
- one **Copy link** item per share record that hasn't expired, which copies its URL to the clipboard

The button itself SHALL NOT run any deploy.

#### Scenario: Download without a browser installed
- **WHEN** the user picks Download standalone HTML on a machine with no Chromium-family browser
- **THEN** the save dialog SHALL open and the chosen file SHALL be written

#### Scenario: Expired temporary record hidden
- **WHEN** the only share record is a `netlify-temporary` record whose `expiresAt` is in the past
- **THEN** the quick pick SHALL NOT show a Copy link item for it

### Requirement: Curated Publish Command
The system SHALL ship a curated `publish` command (local overlay prompt) rendered for every host: a VS Code prompt file, an MCP prompt, and Claude Code and Codex skills. It SHALL direct the model to `publish_open_design_artifact` for the artifact in context. The overview skill and the VS Code chat instructions SHALL name the tool for requests to share, publish, deploy or "get a link" for a design, and SHALL name `export_open_design_artifact` with `format: "standalone"` for requests for a single HTML file.

#### Scenario: Claude Code user asks for a link
- **WHEN** a Claude Code user with the generated skills says "give me a shareable link for the pitch deck"
- **THEN** the overview skill SHALL direct the model to `publish_open_design_artifact` for that deck's entry path
