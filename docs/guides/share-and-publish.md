# Share and publish

Get a design in front of people who don't have your repo: as **one HTML file** you can attach or send, or as a **live link**. A link can be temporary with no account, or last on your own Netlify, Vercel, Cloudflare Pages or GitHub Pages.

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
