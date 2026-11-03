---
name: "open-design-preview"
description: Open an Open Design artifact in a live browser preview, where you can see it update as it changes, click elements to comment on them, and compare check screenshots before and after — use whenever the user asks to see, show, preview or open an Open Design artifact, or wants to comment on one visually
argument-hint: which design to show (e.g. "the landing page"); leave empty for the most recent one or a list
---

<!-- generated:curated-entry -->

Show an Open Design artifact in the browser preview.

Request: "$ARGUMENTS" — or, if that is empty, the user's request in this conversation (if it isn't clear, ask the user: "Which design should the preview show?")

**How to talk to the user.** Many people using Open Design don't write code, so:
- Use the user's own words. If they say "artifact", "design tokens" or give a file path, use those terms back; otherwise use the plain words below.
- Keep the machinery out of replies: no tool names, no ids like `od:prototype:poster-hero`, no internal files (`.artifact.json`, `.comments.json`, `config.json`), and not the words "register", "manifest", "sidecar", "entry" or "surface", unless the user used them first.
- Explain a print term the first time it comes up, in one short clause, and not again.
- Say where a file is the way the user would find it ("in your Open Design folder, under seed-swap-flyer"). Give a raw path only where the user can click it (Claude Code, Claude Desktop's Code tab, VS Code) or asks for it.
- End each reply that finishes a step with one line on what they can do next, with at most two options ("Want it in Instagram sizes too, or is it ready to print?").

| Instead of | Say |
|---|---|
| artifact, entry, registered | your design, saved |
| design system, active design system | your style (the first time: "a saved style: colours, fonts and spacing") |
| surface, skill, template, recipe | kind of design, starting layout, or nothing |
| workspace, output directory | your folder, your Open Design folder |
| bleed | print edge ("a few millimetres extra that the printer trims off") |
| trim size | final size |
| preflight findings, errors | "I checked it and fixed…", "one thing to look at:" |
| export | save as PDF, save as an image |
| inline preview, MCP App | the preview above |

1. Work out which artifact is meant. Registered artifacts are the files under the Open Design output folder (default `.open-design/`) that have a `.artifact.json` file next to them. Use the one the request names; if it names none, use the one you made or changed most recently in this conversation. If that still doesn't settle it, call `open_open_design_preview` without `entryPath`: the preview then lists every design, and the user picks there.
2. Call `open_open_design_preview` with that `entryPath`.
<!-- claude-only -->
   In Claude Desktop's Code tab (its preview tool, named like `preview_start`, is in your tools), use the Browser pane instead: call `set_up_open_design_browser_pane` (tell the user once that you added a preview entry to `.claude/launch.json` if it says so), then start the `open-design-preview` configuration with that preview tool. The pane opens on the newest registered design; if the request names an older one, tell the user to pick it from the pane's list. In Claude Desktop Chat, call `show_open_design_artifact` with the `entryPath` instead, unless the user asked for a browser window.
<!-- /claude-only -->
3. Tell the user in one or two sentences what happened, using the tool's result: where the preview opened (or the URL to open, when it couldn't open a window), that it reloads by itself when the design changes, and that they can click **Comment**, then an element, to leave a comment, and **Send to agent** when they want you to apply them.
4. If the design is a redesign with a base screen (the tool's result or the check names one under `.open-design/.bases/`), offer a before/after page: `compare_open_design_before_after` puts the old page beside the new one and re-checks what the audit found.
