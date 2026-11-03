---
name: open-design-publish
description: Share an Open Design artifact as a live link (a temporary no-account link, or your own Netlify, Vercel, Cloudflare Pages or GitHub Pages), or as one self-contained HTML file
argument_hint: which design to share, and optionally where (e.g. "the pitch deck, temporary link")
placeholder: Which design should we share, and how?
model_trigger: use whenever the user wants to share, publish, deploy or host an Open Design artifact, or get a link to send to teammates or stakeholders; also when they want a single HTML file to attach or send
---

Share an Open Design artifact with people who don't have this project open.

Request: {{brief}}

{{voice}}

## 1. Find the artifact

If the request names a design, find its entry file (`get_open_design_artifact`, or the `.open-design/` folder). If several match or none is named, ask the user which one. It must be registered; if it isn't, register it first with `register_open_design_artifact`.

## 2. A file, or a link?

- **A file to attach or send** (email, Slack, a ticket): call `export_open_design_artifact` with `format: "standalone"`. It writes one self-contained `.html` under the artifact's `exports/` folder, with its local CSS, scripts, images and fonts inlined. Give the user the path, and mention anything it still loads from the internet (such as web fonts). Nothing goes online. Stop here.
- **A link**: continue below.

## 3. Prepare the link

Call `publish_open_design_artifact` with the `entryPath`. Pass `provider` only if the user already said where:

<!-- claude-only -->
- `claude-artifact`: only if you have an Artifact tool (Claude Code or Claude Desktop). A private Claude artifact the user can open, and share from claude.ai when they want to. Offer it first when you have one. Add `sync: true` only if the user agreed to carry the design's working files in it, to continue on another device or session; it's stored, so later publishes keep it until `sync: false`.
<!-- /claude-only -->
- `netlify-temporary` or `cloudflare-temporary`: no account, the link lasts about an hour unless claimed
- `netlify`, `vercel`, `cloudflare-pages` or `github-pages`: the user's own account, a link that lasts

Without a provider, the tool returns the choices: show them to the user and call it again with their pick.

## 4. Follow the returned instructions exactly

<!-- claude-only -->
For `claude-artifact`, they name one file: publish it by its path with your Artifact tool, without reading it into the conversation, and mention what they say won't load in the artifact. There's no confirmation step, since the artifact stays private until the user shares it. For the other providers:
<!-- /claude-only -->

They check the host's CLI, then **stop for the user's explicit yes** before anything goes online. That stop is mandatory: say what goes out, who can see it, how long it lasts, and that the small "Made with Open Design" footer badge is included unless they ask for `badge: false`. Deploy only the bundle folder the tool names.

## 5. Finish

Give the user the link. For a temporary link, also give the claim URL and when it expires, for them only. Then record it by calling `publish_open_design_artifact` again with `published`, as the instructions show, so a later publish updates the same site.

For a redesign with a base screen, offer a before/after page for the client (`compare_open_design_before_after`). On a flow, run it before publishing: the published site links to it from the map. Otherwise publish the before/after page itself like any design.

<!-- claude-only -->
For an artifact, also say it's private until they share it from claude.ai. With sync on, also say what the instructions name: anyone it's shared with can read the design's working files, and earlier versions keep their copy. To pick a synced design up elsewhere, read the artifact with your Artifact tool and pass the saved page's path and the link to `restore_open_design_artifact`.
<!-- /claude-only -->
