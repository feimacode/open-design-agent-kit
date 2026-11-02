# Share and publish

Get a design in front of people who don't have your repo: as **one HTML file** you can attach or send, as a **live link**, or, in Claude Code and Claude Desktop, as a private **Claude artifact**. A link can be temporary with no account, or last on your own Netlify, Vercel, Cloudflare Pages or GitHub Pages.

## Before you start

- **A registered artifact.** Designs made or remixed through Open Design already are.
- **No browser needed.** Unlike image and PDF export, packaging works on any machine.
- **For a link:** Node.js (for `npx`). For your own hosting, you also need to be logged in to that host's CLI (`netlify login`, `vercel login`, `wrangler login` or `gh auth login`). The agent never asks for or stores a token.

## One HTML file

Ask:

> Export the pitch deck as a single HTML file I can email.

The agent calls [`export_open_design_artifact`](../reference/tools.md#export_open_design_artifact) with `format: "standalone"`. You get `exports/<name>.html`, with the page's local stylesheets, scripts, modules, images and fonts inlined. It opens from anywhere, even offline, except for anything the page itself loads from the internet (typically web fonts). Those are listed in the result.

> **In VS Code:** the artifact preview's **Share** button → **Download standalone HTML** saves it straight to a folder you choose, with no chat involved.

> **From the CLI:** `npx @feimacode/open-design-agent-kit export .open-design/pitch/pitch.html --format standalone` ([options](../reference/cli.md#export)).

### A clickable prototype of a flow

> Export the onboarding flow as a clickable prototype.

For a [collection](app-screens.md#linked-flows) of linked screens, `export_open_design_artifact` with `collectionId` writes one file, `exports/<collection>-prototype.html`, holding every screen. Its links move between the screens, offline too. See [Share a clickable prototype](app-screens.md#share-a-clickable-prototype).

## A live link

Ask:

> Publish the launch page so I can send the team a link.

The agent calls [`publish_open_design_artifact`](../reference/tools.md#publish_open_design_artifact). It packages the design into a deploy-ready folder, `exports/site/`, and shows you where it can go:

| Provider | Account | The link lasts | Who can see it |
|---|---|---|---|
| `netlify-temporary` | none | about 60 minutes unless claimed | password-protected until claimed (Netlify shows the password) |
| `cloudflare-temporary` | none | 60 minutes unless claimed | anyone with the link |
| `netlify` | yours | until you delete it | anyone with the link |
| `vercel` | yours | until you delete it | anyone with the link, unless your team protects production deployments |
| `cloudflare-pages` | yours | until you delete it | anyone with the link |
| `github-pages` | yours | until you delete it | anyone, and the `od-shares` repository holding it is public too |

A temporary link suits "can you see this?". For a review that lasts days, use your own account. To keep a temporary site, open the **claim URL** the agent gives you within the hour and sign up or log in to that host. Keep the claim URL to yourself: it's not part of the share link.

Name the host up front to skip the question:

> Give me a temporary Cloudflare link for the pricing page.

> **In VS Code:** **Share** → **Get a temporary link** or **Publish to my hosting** opens Copilot Chat with the request filled in. The `/open-design-publish` prompt does the same from chat.

> **In Claude Code / Codex:** the `open-design-publish` skill walks through the whole flow.

### What happens

1. **Package.** `exports/site/` gets the page as `index.html` plus every file it references: stylesheets (and what they import), images, fonts, scripts and the modules they import. The artifact's own files are never changed. A missing file stops here, naming it.
2. **Check.** The agent runs the host's CLI through `npx` to confirm you're logged in. For temporary links, it confirms you're *not* logged in, because both hosts refuse anonymous deploys from a logged-in CLI.
3. **Confirm.** The agent stops and tells you what's going out, who can see it, how long it lasts, and whether the badge is on. **Nothing goes online until you say yes.**
4. **Deploy.** It runs the deploy from `exports/site/` only, never from your workspace root. If a command fails, you see the real error; the agent doesn't improvise other commands.
5. **Record.** The link is saved in the artifact's manifest ([`metadata.shares`](../reference/artifact-manifest.md#metadatashares)). The next publish to the same host updates the same site instead of creating a new one, and VS Code's **Share** menu offers **Copy link** for it.

## A Claude artifact

In Claude Code or the Claude desktop app, signed in to claude.ai on a Pro, Max, Team or Enterprise plan, the agent has its own Artifact tool and offers a Claude artifact first. Ask:

> Publish the pitch deck as an artifact.

The agent calls [`publish_open_design_artifact`](../reference/tools.md#publish_open_design_artifact) with `provider: "claude-artifact"`. It writes the one-file export, `exports/<name>.html`, and the agent publishes that file by its path with its Artifact tool, so the page itself doesn't pass through the conversation. You get a claude.ai link.

- **Private.** Only you can open it until you share it from claude.ai, so the agent doesn't stop to confirm first. The badge is off unless you ask for it.
- **One artifact per design.** The link is recorded in the manifest. Publishing again updates the same artifact as a new version, and an open tab shows it.
- **Exports stay files.** PNG, PDF and PowerPoint exports are files on disk, not artifacts.
- **Copilot, Codex, Cursor** and API-key sessions have no Artifact tool, so the agent doesn't offer this there.

The artifact viewer has its own rules, which the agent checks before publishing and tells you about:

- **One page of at most 16 MB.** From 12 MB you get a warning; above 16 MB the publish stops.
- **Scripts only from** cdnjs, jsDelivr (`/npm/`), unpkg, the Tailwind CDN and the jQuery CDN, **stylesheets only from** Google Fonts. Images, data and other files from any other site are blocked, and each one is named with what will break (`artifact-blocked-host`).
- **No downloads or print dialog** from the page.

### Continue on another device

A design's files live in your workspace, but its Claude artifact lives in your claude.ai account. With **sync**, the artifact also carries the design's working files, so you can pick it up on another computer, in a new Claude Code cloud session, or edit it in a chat that has no folder. Say where you'll continue:

> I'll pick this poster up on my laptop later.

The agent offers sync once and turns it on only if you agree (`sync: true` on [`publish_open_design_artifact`](../reference/tools.md#publish_open_design_artifact)). Later preview publishes keep the files up to date, until you ask to turn it off.

- **What's carried:** the entry file, its manifest, its preview comments, the supporting files the manifest lists and a custom design system's `DESIGN.md`. Exports aren't (they can be made again), claim URLs of temporary links are removed, and the documents a deck was built from are listed but not copied.
- **Who can read it:** anyone you share the artifact with can read these files. Each version keeps its own copy, so turning sync off later (`sync: false`) leaves earlier versions as they were.
- **Size:** the files count toward the 16 MB limit. If page plus files would go over, that version goes out without them (`artifact-sync-dropped`) and the preview still publishes.

To pick it back up, give the agent the artifact link in the new session:

> Continue the gig poster: https://claude.ai/artifact/…

The agent reads the artifact with its Artifact tool and calls [`restore_open_design_artifact`](../reference/tools.md#restore_open_design_artifact), which writes the files into your workspace and records the link, so the next preview updates the same artifact. If a file here differs from the artifact's copy, nothing is written until you say which to keep.

In a Claude chat without Open Design's tools, the agent can still change a synced design: it edits the entry inside the artifact's sync block and republishes to the same link. A later restore lists that file as edited outside the kit.

## The "Made with Open Design" badge

Published pages get a small "Made with Open Design · Remix this" note in the bottom corner. Viewers can close it. It's inline HTML: it loads nothing from the internet and doesn't track anyone. Standalone HTML files don't get it unless you ask.

To leave it out:

- once: "publish it without the badge" (`badge: false`)
- always, in VS Code: turn off [`openDesign.share.badge`](../reference/settings-and-env.md#opendesignsharebadge)
- always, for the MCP server or CLI: set [`OPEN_DESIGN_SHARE_BADGE=0`](../reference/settings-and-env.md#open_design_share_badge), or pass `--no-badge` to the CLI

## Link previews

Published pages get `og:title`, `og:description` and `twitter:card` tags from the artifact's title, so a link pasted into Slack, X or LinkedIn shows a proper card. Tags the page already has are kept.

For a preview **image**, [export a PNG](export-images.md) first; the bundle then carries it as `og.png`. Preview cards need the image's full address, which isn't known until the first deploy. So after the first publish to your own hosting, the agent offers one redeploy that adds the image tag.

## Before you share

The package step reports anything that commonly breaks a hosted page:

- a missing `<!DOCTYPE html>` or `<meta name="viewport">`
- scripts or stylesheets loaded from other sites
- files over 5 MiB, or a page over 2 MiB
- files under a dot-folder, which some hosts don't serve

None of these block publishing, but fixing them first usually makes for a better link.

## Troubleshooting

- **"missing-references":** the page points at a file that doesn't exist, or one outside the workspace. Fix or remove the reference and try again.
- **The temporary deploy says you're logged in:** use your own account's provider instead (`netlify` or `cloudflare-pages`), or log out of that CLI yourself first.
- **Netlify says you've reached the daily limit for anonymous deploys:** log in with `netlify login` and use the `netlify` provider.
- **The Vercel link asks viewers to sign in:** your team has Deployment Protection on production deployments. Turn it off for this project in Vercel, or share with people on your team.
- **The GitHub Pages link shows 404:** the first Pages build takes a minute or two.
- **"artifact-too-large":** the one-file page is over 16 MB, usually because of large images. Use smaller images, or publish it as a site instead.
- **An artifact shows broken images or a blank 3D scene:** the page loads files from a site the artifact viewer blocks. The publish result names each one; host the page as a site, or make the files part of the page.
