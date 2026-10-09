# Releasing

One version number covers the VS Code extension and the three npm packages (`content`, `mcp-server`, `cli`). Releasing is split into **build** (automatic, on a tag) and **publish** (manual, confirmed), so a tag push alone never reaches a registry.

## 1. Bump and tag

```bash
node scripts/bump-version.mjs 0.2.0     # or 0.2.0-beta.1; --dry-run to preview
git push origin main --follow-tags
```

`bump-version.mjs` sets the version in `packages/vscode`, `packages/content`, `packages/mcp-server` (including its MCP registry `server.json`) and `packages/cli`, then commits and tags `v0.2.0` locally. It never pushes. Optionally add a `## [0.2.0]` section to `CHANGELOG.md`; the release notes use it when present.

## 2. Release workflow (automatic)

Pushing a `vX.Y.Z` (or `-alpha.N` / `-beta.N`) tag runs [`.github/workflows/release.yml`](../../.github/workflows/release.yml):

1. Checks that the tag matches every package's version.
2. Runs `typecheck`, `lint` (every drift check and the docs check) and `test:unit`.
3. Pins the npm packages' dependency on `content` to this version (in the CI checkout only).
4. Builds the packages and runs `scripts/test-npm-publish.mjs`: a real publish to a throwaway local registry, then `npx` resolution, an MCP handshake and `init`.
5. Packs the npm tarballs and the `.vsix` (with `--no-dependencies`; esbuild already bundles everything), and generates SHA-256 checksums.
6. Creates a GitHub Release with all artifacts attached.

## 3. Publish (manual)

Both workflows publish the artifacts already built for the GitHub Release, and both require typing `PUBLISH` to confirm:

- **Publish npm Packages** (`publish-npm.yml`): publishes `content`, then `mcp-server`, then `cli`. A follow-up job then publishes `packages/mcp-server/server.json` to the [MCP registry](https://registry.modelcontextprotocol.io) as `io.github.feimacode/open-design` (GitHub OIDC, no secret), which feeds the GitHub MCP Registry and VS Code's `@mcp` gallery. If only that job fails, re-run it. The registry checks `mcpName` in the published npm package, so it can't list a version before it's on npm.
- **Publish to Marketplace** (`publish-marketplace.yml`): verifies the `.vsix` checksum and runs `vsce publish` with the `VSCE_PAT` secret.

## 4. Update the Claude Code plugin's MCP pin (manual, after npm publish)

The Claude Code plugin (`packages/claude-plugin`) does not follow the release version automatically. It pins the MCP server to an exact version in its own `package.json` and `package-lock.json`, which Claude Code installs with `npm ci` when the plugin is installed (the Claude plugin directory requires this lockfile for its Verified badge). `.mcp.json` then launches the server from the plugin's `node_modules`, not through `npx`.

Once the new `mcp-server` version is on npm:

```bash
# set "@feimacode/open-design-agent-kit-mcp" to the new exact version (e.g. "0.2.0") in packages/claude-plugin/package.json, then:
npm run update-lock --workspace=@feimacode/open-design-agent-kit-claude-plugin
npm install                                   # refresh the root lockfile
git commit -am "chore(claude-plugin): pin MCP server 0.2.0"
```

`update-lock` resolves the plugin's standalone lockfile against the npm registry, so it only works after the version is published. The plugin's `lint` (`update-plugin-lock.mjs --check`) fails if the pin, the lockfile and `.mcp.json` disagree. It does not catch a pin that is still on the previous release, so don't skip this step.

## Checklist before tagging

- [ ] `npm run lint` and `npm run test:unit` pass locally.
- [ ] If content changed: `npm run sync-content` was run and the output committed.
- [ ] **Docs:** new or changed tools, settings, commands, flags and behavior are reflected in `docs/`. The docs check catches missing names, not wrong descriptions.
- [ ] Any new ported code is recorded in `packages/core/src/vendored/SOURCE.md`.
