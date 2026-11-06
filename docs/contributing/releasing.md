# Releasing

One version number covers the VS Code extension, the three npm packages (`content`, `mcp-server`, `cli`), the Claude Desktop extension (`.mcpb`), the ChatGPT desktop plugin (`.zip`) and the hosted gateway image. Releasing is split into **build** (automatic, on a tag) and **publish** (manual, confirmed), so a tag push alone never reaches a registry.

## 1. Bump and tag

```bash
node scripts/bump-version.mjs 0.2.0     # or 0.2.0-beta.1; --dry-run to preview
git push origin main --follow-tags
```

`bump-version.mjs` sets the version in `packages/vscode`, `packages/content`, `packages/mcp-server` (including its MCP registry `server.json`) and `packages/cli`, then commits and tags `v0.2.0` locally. It never pushes. Optionally add a `## [0.2.0]` section to `CHANGELOG.md`; the release notes use it when present.

Where tags can't be pushed (a cloud session, for example), delete the local tag, merge the bump to `main`, and run the **Release** workflow by hand with the `version` input instead. It creates the tag and the release on `main`'s head.

## 2. Release workflow (automatic)

Pushing a `vX.Y.Z` (or `-alpha.N` / `-beta.N`) tag runs [`.github/workflows/release.yml`](../../.github/workflows/release.yml):

1. Checks that the tag matches every package's version.
2. Runs `typecheck`, `lint` (every drift check and the docs check) and `test:unit`.
3. Pins the npm packages' dependency on `content` to this version (in the CI checkout only).
4. Builds the packages and runs `scripts/test-npm-publish.mjs`: a real publish to a throwaway local registry, then `npx` resolution, an MCP handshake and `init`.
5. Packs the npm tarballs and the `.vsix` (with `--no-dependencies`; esbuild already bundles everything).
6. Builds the Claude Desktop extension `open-design-X.Y.Z.mcpb` (`packages/desktop-extension`): the server with its MCP SDK inlined, plus the content from this run's own tarball, validated and packed with the pinned `@anthropic-ai/mcpb` devDependency. `scripts/test-mcpb.mjs` then checks its manifest and size (40 MB at most), unzips it outside the checkout and completes an MCP handshake with plain Node.
7. Builds the ChatGPT desktop plugin `open-design-chatgpt-plugin-X.Y.Z.zip` (`packages/chatgpt-plugin`) from the same server and content plus the Codex skills, and `scripts/test-chatgpt-plugin.mjs` unzips it, checks `plugin.json` and the skills and completes an MCP handshake. `install chatgpt` downloads it from the release by version.
8. Generates SHA-256 checksums and creates a GitHub Release with all artifacts attached. The `.mcpb` and the ChatGPT zip need no publish step: attaching them is the distribution.

The extension doesn't update itself, so when a release changes the server, start its `CHANGELOG.md` section with:

```markdown
**Claude Desktop extension:** install `open-design-X.Y.Z.mcpb` from this release to update it.
```

## 3. Publish (manual)

Both workflows publish the artifacts already built for the GitHub Release, and both require typing `PUBLISH` to confirm:

- **Publish npm Packages** (`publish-npm.yml`): publishes `content`, then `mcp-server`, then `cli`. A follow-up job then publishes `packages/mcp-server/server.json` to the [MCP registry](https://registry.modelcontextprotocol.io) as `io.github.feimacode/open-design` (GitHub OIDC, no secret), which feeds the GitHub MCP Registry and VS Code's `@mcp` gallery. If only that job fails, re-run it. The registry checks `mcpName` in the published npm package, so it can't list a version before it's on npm.
- **Publish to Marketplace** (`publish-marketplace.yml`): verifies the `.vsix` checksum and runs `vsce publish` with the `VSCE_PAT` secret.

## 4. Update the Claude Code plugin's MCP pin (manual, after npm publish)

The Claude Code plugin the marketplace installs (`packages/claude-plugin-local`) does not follow the release version automatically. It pins the MCP server to an exact version in its own `package.json` and `package-lock.json`, which Claude Code installs with `npm ci` when the plugin is installed. `.mcp.json` then starts `scripts/open-design-mcp.mjs`, which runs the server from the plugin's `node_modules`. Claude Desktop doesn't install plugin dependencies, so there the launcher runs `npx` with the same pinned version instead.

Once the new `mcp-server` version is on npm:

```bash
# set "@feimacode/open-design-agent-kit-mcp" to the new exact version (e.g. "0.2.0") in packages/claude-plugin-local/package.json, then:
npm run update-lock --workspace=@feimacode/open-design-agent-kit-claude-plugin
npm install                                   # refresh the root lockfile
git commit -am "chore(claude-plugin): pin MCP server 0.2.0"
```

`update-lock` resolves the plugin's standalone lockfile against the npm registry, so it only works after the version is published. The plugin's `lint` (`update-plugin-lock.mjs --check`) fails if the pin, the lockfile and `.mcp.json` disagree. It does not catch a pin that is still on the previous release, so don't skip this step. `packages/claude-plugin`, the directory's copy, uses the hosted server and has no pin.

## 5. Update the hosted gateway (manual)

The hosted gateway behind the directory listings runs a container image, not the npm packages. After a release that should reach it, run the **Gateway image** workflow (`remote-image.yml`) with **push** ticked: it builds `deploy/Dockerfile`, smoke-tests it, and pushes `ghcr.io/feimacode/open-design-gateway:<version>` (plus `latest` for a stable version). Then redeploy it as described in [deploy/README.md](../../deploy/README.md).

The directory-listing ChatGPT zip (`build-chatgpt-plugin.ts --hosted <url>`) only changes when its metadata does; it isn't part of each release.

## Test before the stable release

Release a prerelease first, test it, then release the same code as the stable version. Nobody gets a prerelease unless they ask for it by version or tag:

1. `node scripts/bump-version.mjs 0.3.0-beta.1` and push the tag. The release workflow builds everything and creates a GitHub **pre-release**, which the docs' "latest release" links skip.
2. Run **Publish npm Packages** with `0.3.0-beta.1`. A prerelease is published under the npm dist-tag `next`, not `latest`, so `npx @feimacode/open-design-agent-kit-mcp` and every `.mcp.json` that `init` wrote keep resolving the stable version. The MCP registry job is skipped for prereleases. Skip **Publish to Marketplace**: it only takes stable versions.
3. Test against it:
   - Claude Code and Codex: `npx -y @feimacode/open-design-agent-kit@next init` in a test project. `init` pins the server and the preview to its own version, so the project runs the beta's server with the beta's skills.
   - Claude Desktop extension: install the `.mcpb` from the pre-release.
   - ChatGPT desktop: `npx @feimacode/open-design-agent-kit@next install chatgpt`, or `install chatgpt --from` the zip from the pre-release.
   - Plugin: on a local branch, pin the plugin to `0.3.0-beta.1` (step 4 below, without pushing), then in Claude Code add your checkout as a marketplace with `/plugin marketplace add <path to checkout>` and install Open Design from it. The public marketplace keeps the stable pin.
4. Fix and repeat with `-beta.2` as needed. When it passes, `node scripts/bump-version.mjs 0.3.0`, release, publish (it goes to `latest` and the MCP registry, and `next` moves to it too so it's never older than `latest`), and pin the plugin to `0.3.0`.

npm keeps every published version, so a prerelease stays downloadable by its exact version. It's public, just never picked by default.

## Checklist before tagging

- [ ] `npm run lint` and `npm run test:unit` pass locally.
- [ ] If content changed: `npm run sync-content` was run and the output committed.
- [ ] **Docs:** new or changed tools, settings, commands, flags and behavior are reflected in `docs/`. The docs check catches missing names, not wrong descriptions.
- [ ] Any new ported code is recorded in `packages/core/src/vendored/SOURCE.md`.
