## Context

`publish_open_design_artifact_to_canva` (VS Code only) returns instructions; the preview's "Publish to Canva" menu just opens chat and asks the agent to call it. The `integration-registry` capability now provides `list_open_design_integrations` and the consent rules.

A live test on the user's Canva account (2026-10-10, with consent) found:
- `create-upload-url` → POST raw bytes → `{"fileId":"…"}` (HTTP 201). No design was created: the file sits in the user's uploads. No Canva tool turns a `fileId` into a design; `asset_ids` are only inserted into designs Canva generates itself.
- `import-design-from-url` takes a public HTTPS URL to a PDF, PPTX or webpage and returns a design id. It refuses local paths. Multi-page static HTML needs `data-document-role="page"` markers.

The user chose to **ask each time and recommend the editable import**, importing the **exported PDF/PPTX** rather than the HTML page.

## Goals / Non-Goals

**Goals:** an editable Canva design without leaving the chat when Canva is connected; a private alternative; an unchanged manual fallback; the same behaviour on every host.

**Non-Goals:**
- Importing the HTML page itself.
- Editing designs inside Canva.
- Canva Creator (public marketplace) templates, which stay manual.
- Automatically deleting the temporary public link afterwards (it expires on its own, or the user removes it from their host).
- Any Canva API call from our code.

## Decisions

### D1. Three routes, chosen by the user
The instructions first check for Canva tools: lookup via `list_open_design_integrations` with `integration: "canva"`, then the agent's own tool list including deferred tools.

**When Canva is connected,** the instructions present A and B in two or three sentences each, recommend A, and wait for the choice.

**When it isn't,** they follow the integration rules (offer setup once). If the user declines, they continue with route C, today's manual steps unchanged.

*Alternative:* always route B, so nothing is published. Rejected by the user: B can't produce a design id, so no verification and no brand template.

### D2. Route A hosts the export through the existing publish flow
`publish_open_design_artifact` gets `includeFiles: string[]`.

**Each path must:**
- resolve inside the artifact's own `exports/` folder;
- exist;
- not be the site bundle itself.

Otherwise the tool returns an error and builds nothing.

**Files are copied** to `<bundle>/files/<basename>` after the site export, with duplicate basenames rejected. The result lists them, with "public at `<site URL>/files/<name>`" once the link is known. They join the preflight file list, so the existing stop-and-confirm stage shows them as going public.

**Route A instructions require:**
- `provider` `cloudflare-temporary` (about 60 minutes, public, no account) or one of the user's own hosts;
- never `netlify-temporary`: its links are password-protected, so Canva can't fetch them;
- the badge is irrelevant to a PDF and stays the publish flow's business.

*Alternative:* a separate "host this file" tool. Rejected: it would duplicate the provider recipes, confirmation and share records the publish flow already has.

### D3. Canva calls in route A
1. `import-design-from-url` with:
   - `url`: the hosted file;
   - `name`: the derived title;
   - `intended_design_type` from D4, omitted when unmapped;
   - a short `user_intent`.
2. `read-design` with `fields: ["design_metadata", "thumbnails"]` to confirm the page count and look. Report problems honestly: decks arrive as full-bleed slide images, and PDF conversion may shift fonts.
3. Share the design's edit link.
4. **Brand Template:** explain it needs a Canva plan with brand templates. Call `publish-brand-template` with the design id only after an explicit yes. If Canva answers "Missing scopes", tell the user to disconnect and reconnect the Canva connector.

Tools are named by their bare server-defined names, per the integration rules.

### D4. Design type mapping (core helper)
`canvaDesignTypeFor(kind, format)`:

| From | Canva type |
|---|---|
| kind `deck` | `presentation` |
| `ig-square`, `ig-portrait` | `instagram_post` |
| `story` | `your_story` |
| `x-image` | `twitter_post` |
| `yt-thumbnail` | `youtube_thumbnail` |
| `linkedin-image` | `other` |
| `a4` | `a4` |
| `letter` | `us_letter` |
| `a3`, `a2`, `a1`, `a0`, `tabloid`, `poster-*` | `poster` |
| email kind (`[data-od-email]` artifacts) | `email` |
| anything else | `undefined` (omitted) |

### D5. Route B, precisely
1. `create-upload-url`.
2. Run `curl -sS -X POST -H "Content-Type: application/octet-stream" --data-binary @<export path> "<upload_url>"`, which prints `{"fileId":…}`.
3. Tell the user the file is in Canva's **Uploads**, and that opening it there makes an editable design.
4. Don't claim a design exists.

A used or expired URL means calling `create-upload-url` again, never retrying the same one.

### D6. MCP parity
The MCP server gets `publish_open_design_artifact_to_canva` with the same input (`entryPath`), reading the manifest the same way the VS Code tool does. `includeFiles` is added to both publish tool schemas.

### D7. Consent points
There are three, each needing the user's yes in the conversation:
1. Choosing route A or B.
2. The publish flow's existing go-public confirmation, which now lists the export file.
3. Publishing a Brand Template.

Setting up the Canva integration is a fourth, governed by the integration rules.

## Risks / Trade-offs

- **[Canva fetches after a temporary link expires]** → the import runs immediately after the deploy, inside the roughly 60-minute window. The instructions say to redo the publish step if the import reports an unreachable URL.
- **[Brand design briefly public]** → that's why route A needs explicit consent, why route B exists, and why the confirmation stage names the file.
- **[PPTX decks import as images]** → as today; stated before importing.
- **[Canva tool names or behaviour change]** → the registry caveat carries `verifiedAt`; tool names are referenced by capability through the registry.
