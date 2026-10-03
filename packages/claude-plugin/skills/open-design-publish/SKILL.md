---
name: "open-design-publish"
description: Share an Open Design artifact as a live link (a temporary no-account link, or your own Netlify, Vercel, Cloudflare Pages or GitHub Pages), or as one self-contained HTML file — use whenever the user wants to share, publish, deploy or host an Open Design artifact, or get a link to send to teammates or stakeholders; also when they want a single HTML file to attach or send
argument-hint: which design to share, and optionally where (e.g. "the pitch deck, temporary link")
---

<!-- generated:curated-entry -->

Share an Open Design artifact with people who don't have this project open.

Request: "$ARGUMENTS" — or, if that is empty, the user's request in this conversation (if it isn't clear, ask the user: "Which design should we share, and how?")

## 1. Find the artifact

If the request names a design, find its entry file (`get_open_design_artifact`, or the `.open-design/` folder). If several match or none is named, ask the user which one. It must be registered; if it isn't, register it first with `register_open_design_artifact`.

## 2. A file, or a link?

- **A file to attach or send** (email, Slack, a ticket): call `export_open_design_artifact` with `format: "standalone"`. It writes one self-contained `.html` under the artifact's `exports/` folder, with its local CSS, scripts, images and fonts inlined. Give the user the path, and mention anything it still loads from the internet (such as web fonts). Nothing goes online. Stop here.
- **A link**: continue below.

## 3. Prepare the link

Call `publish_open_design_artifact` with the `entryPath`. Pass `provider` only if the user already said where:

- `netlify-temporary` or `cloudflare-temporary`: no account, the link lasts about an hour unless claimed
- `netlify`, `vercel`, `cloudflare-pages` or `github-pages`: the user's own account, a link that lasts

Without a provider, the tool returns the choices: show them to the user and call it again with their pick.

## 4. Follow the returned instructions exactly

They check the host's CLI, then **stop for the user's explicit yes** before anything goes online. That stop is mandatory: say what goes out, who can see it, how long it lasts, and that the small "Made with Open Design" footer badge is included unless they ask for `badge: false`. Deploy only the bundle folder the tool names.

## 5. Finish

Give the user the link. For a temporary link, also give the claim URL and when it expires, for them only. Then record it by calling `publish_open_design_artifact` again with `published`, as the instructions show, so a later publish updates the same site.
