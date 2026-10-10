---
name: "open-design-integrations"
description: Show which services Open Design can use directly (Canva, Figma, Notion, Google Drive, Slack, social posting), whether each is connected, and how to set one up
mode: agent
---

Show the user Open Design's integrations and whether each one is connected here.

Request: ${input:brief:Anything you'd like to connect? (or leave empty to just see the list)}

## 1. Get the list

Call `list_open_design_integrations` with no arguments. It returns every integration grouped by purpose, each with what it does, the tool names that show it's connected on this agent, whether it can be set up here, and how to manage without it.

## 2. Work out each status

Use exactly three statuses:
- 🟢 **Connected**: your own tools include one matching its "Connected if your tools include" hints. Check deferred or on-demand tools too (search for them) before deciding one is missing.
- 🟡 **Installed, not connected**: it's configured but its tools aren't available (it needs sign-in, failed to connect, or needs a restart). If you can run shell commands, run the read-only `claude mcp list` (Claude Code) or `codex mcp list` (Codex) and look for its server name or URL; a configured server without matching tools is 🟡. Run nothing else.
- ⚪ **Not installed**: neither of the above.

If you can't run those commands, use only 🟢 and ⚪, and say that an integration you've already added may need a restart to show up.

## 3. Reply

Show one short table per group (Design, Docs & storage, Team, Social posting), in the order the list gives:

| | Integration | What it does in Open Design | Next step |
|---|---|---|---|

- The first column is the dot only.
- Next step: "Ready to use" for 🟢; "Sign in or restart (`/mcp` in Claude Code, `codex mcp login <name>` in Codex)" for 🟡; "Ask me to set it up" for ⚪ when it can be set up here, otherwise "Manual setup" plus one line from its manual path.

End with a one-line legend (🟢 connected · 🟡 installed, not connected · ⚪ not installed) and offer to set up any ⚪ integration the user names.

## 4. Setting one up (only when asked)

Don't install anything from the list itself. If the request above, or the user's answer, names an integration to set up: call `list_open_design_integrations` with that `integration`, and follow its setup steps and rules. That means asking for and getting the user's yes before installing anything, and never asking for or writing an API key.
