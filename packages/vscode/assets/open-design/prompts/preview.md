---
name: open-design-preview
description: Open an Open Design artifact in a live browser preview, where you can see it update as it changes, click elements to comment on them, and compare check screenshots before and after
argument_hint: which design to show (e.g. "the landing page"); leave empty for the most recent one or a list
placeholder: Which design should the preview show?
model_trigger: use whenever the user asks to see, show, preview or open an Open Design artifact, or wants to comment on one visually
hosts: [claude, codex, mcp]
---

Show an Open Design artifact in the browser preview.

Request: {{brief}}

{{voice}}

1. Work out which artifact is meant. Registered artifacts are the files under the Open Design output folder (default `.open-design/`) that have a `.artifact.json` file next to them. Use the one the request names; if it names none, use the one you made or changed most recently in this conversation. If that still doesn't settle it, call `open_open_design_preview` without `entryPath`: the preview then lists every design, and the user picks there.
2. Call `open_open_design_preview` with that `entryPath`.
<!-- claude-only -->
   In Claude Desktop's Code tab (its preview tool, named like `preview_start`, is in your tools), use the Browser pane instead: call `set_up_open_design_browser_pane` (tell the user once that you added a preview entry to `.claude/launch.json` if it says so), then start the `open-design-preview` configuration with that preview tool. The pane opens on the newest registered design; if the request names an older one, tell the user to pick it from the pane's list. In Claude Desktop Chat, call `show_open_design_artifact` with the `entryPath` instead, unless the user asked for a browser window.
<!-- /claude-only -->
3. Tell the user in one or two sentences what happened, using the tool's result: where the preview opened (or the URL to open, when it couldn't open a window), that it reloads by itself when the design changes, and that they can click **Comment**, then an element, to leave a comment, and **Send to agent** when they want you to apply them.
4. If the design is a redesign with a base screen (the tool's result or the check names one under `.open-design/.bases/`), offer a before/after page: `compare_open_design_before_after` puts the old page beside the new one and re-checks what the audit found.
