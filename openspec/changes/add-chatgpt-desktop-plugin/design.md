## Context

OpenAI's plugin build guide describes the portable format. The root `plugin.json` is required. Skills are discovered from `skills/`. Servers go in root `mcp.json` under `mcpServers`, each with a `type`. OpenAI settings go under `extensions.com.openai`. `.codex-plugin/plugin.json` is a legacy fallback, used only when `extensions.com.openai` is absent.

The desktop-only guide says a stdio entry with `"command": "node"` and the built-in `${PLUGIN_ROOT}` placeholder is how a local server is declared, and that the server and its dependencies must be packaged with the plugin. ChatGPT installs plugins into `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`, using `local` as the version for local sources, and needs a restart after a local plugin changes.

Our Claude plugin starts the server through `scripts/open-design-mcp.mjs`, which falls back to `npx` with a pinned version. The `.mcpb` build (`packages/desktop-extension/scripts/build-mcpb.ts`) already produces a self-contained server folder.

## Goals / Non-Goals

**Goals**
- A ChatGPT desktop user with Node installed goes from one command to a working design in the Work tab.
- The same skills as Codex, so the content can't drift.
- Nothing downloaded when the server starts.

**Non-Goals**
- ChatGPT web or mobile.
- Getting into the public directory.
- Removing the Node requirement (see Risks).

## Decisions

**1. Portable `plugin.json`, no `.codex-plugin/`.** The portable format is what OpenAI documents going forward, and it's the format the submission portal takes. Codex's own plugin system reads the same package, so we don't add a legacy manifest. If testing shows the desktop app's local marketplace still needs `.codex-plugin/plugin.json`, we add it as a generated copy (task 6.2).

**2. Bundle the server, don't use npx.** OpenAI's guide asks for it, and it avoids the "npx not found" and notarget failures we hit with the Claude plugin. The zip reuses the `.mcpb` build's `server/` folder (bundled server, SDK and vendored content). The build step is moved into a shared script that both packages call.

**3. `install chatgpt` writes to the home folder, outside `init`.** A local marketplace is personal (`~/.agents/plugins/marketplace.json`), and `init`'s spec says it never writes outside the target path. A separate command keeps that promise and is easy to explain in a guide. It prints every path it writes. It refuses to change a malformed `marketplace.json` and prints the entry to add by hand instead. The plugin folder has a fixed path (decision 4), and an upgrade replaces its contents.

**4. The marketplace entry's shape (confirmed 2026-10-31 from developers.openai.com/codex/plugins/build).** The file is `{ name, interface: { displayName }, plugins: [...] }`; each plugin is `{ name, source: { source: "local", path }, policy: { installation, authentication }, category }`. `source.path` is relative to the marketplace root (the home folder for the personal file), starts with `./` and must stay inside it, and `./.codex/plugins/<name>` is the documented personal pattern. So the plugin lives at `~/.codex/plugins/open-design/` with no version in the path: an upgrade unpacks beside it, swaps folders, and leaves the entry unchanged. The `mcp.json` stdio entry is `{ type: "stdio", command, args, env }`.

**5. Launcher value `chatgpt-plugin`.** `isPluginLaunched()` becomes "launched by a plugin" (Claude or ChatGPT). A new `launcherHost()` returns `claude` or `chatgpt`. Text that names Claude-only features (Claude Design systems, Claude artifacts, Cowork) checks it.

## Risks / Trade-offs

- **Node is still needed on PATH.** ChatGPT's docs show `"command": "node"` and say nothing about a bundled runtime. A non-technical user without Node gets a startup failure. Mitigation: the guide says it up front, and the server's start error names Node. Follow-up: find out whether the ChatGPT desktop app ships a Node that plugins can use (task 6.4).
- **Plans are unclear.** Some sources say Work isn't on Free or Go. The guide states what we verified and on which plan.
- **Without partner approval, nobody finds it in ChatGPT.** People find the plugin through our docs, gallery and Reddit, not the directory.
- **Content drift.** The plugin's `skills/` is generated from the same sources as `.agents/skills/`, and a drift check runs with `npm run lint`.
