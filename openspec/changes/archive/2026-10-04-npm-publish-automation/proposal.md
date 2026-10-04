## Why

Tested the npm-publish path for real this session (a local Verdaccio registry, real `npm publish` for `packages/content`/`packages/mcp-server`/`packages/cli`, then a fresh-machine `npx` resolution and a real MCP JSON-RPC handshake) rather than assuming the earlier packaging fixes worked. They did — zero runtime bugs found. But the exercise exposed that everything about *actually publishing* these three packages is manual today, with no CI safety net, unlike the VS Code extension's already-careful two-stage release pipeline (`release.yml` build/validate → separately-confirmed `publish-marketplace.yml`). This proposal closes that gap the same way.

## What Changes

- **One shared release, not a second parallel pipeline**: extend the existing `release.yml` (not a new `release-npm.yml`) so the same tag/`workflow_dispatch` run that builds the `.vsix` also builds and `npm pack`s all three npm packages, runs the local-Verdaccio smoke test (below) as a hard gate, and attaches all four artifacts — the `.vsix` and three `.tgz` files, each with its own checksum — to the *same* GitHub Release. One version, one tag, one release page lists everything that shipped together; the VS Code extension and the npm packages can never silently drift to different released versions.
  - The build job's new smoke-test step — directly informed by this session's manual test — spins up a local Verdaccio registry, really publishes all three packages to it, then resolves `@feimacode/open-design-agent-kit-mcp` and `@feimacode/open-design-agent-kit` via `npx` from a completely isolated directory and drives a real MCP JSON-RPC handshake, so a regression like the original private-package bug would be caught by CI, not discovered by hand.
  - A new `publish-npm.yml`, structured exactly like the existing `publish-marketplace.yml`: manual-only (`workflow_dispatch`, typed `"PUBLISH"` confirmation, `NPM_TOKEN` secret), and it *downloads the already-built tarballs from that same GitHub Release* (verifying their checksums) rather than rebuilding — the artifact that gets published is provably the exact one that passed the shared release's checks, not a fresh rebuild that could differ. Publishes in dependency order: `content` before `mcp-server`; `cli` is independent. `publish-marketplace.yml` itself is unchanged — it already follows this same download-from-release pattern for the `.vsix`.
- A version-pinning fix for `packages/mcp-server`'s one real cross-package runtime dependency (`@feimacode/open-design-agent-kit-content: "*"`) so a future breaking `content` release can't silently break every existing `mcp-server` install.
- `packages/content/README.md` and `packages/cli/README.md` (currently missing; `packages/mcp-server` already has one).
- An `engines.node` field on all three publishable packages.

## Capabilities

### New Capabilities
- `npm-package-publishing`: the correctness guarantees this session's manual test actually verified (no published package depends on a private, unpublishable one at runtime; a real registry-resolution round trip is verified before any real publish is allowed), now made explicit and CI-enforced instead of only checked once by hand.

### Modified Capabilities
- none.

## Impact

- `.github/workflows/release.yml`: extended (not replaced) to also build/pack/smoke-test the three npm packages and attach them to the same GitHub Release as the `.vsix`.
- New: `.github/workflows/publish-npm.yml` (mirrors `publish-marketplace.yml`'s download-from-release pattern), plus whatever small script implements version-pinning and the Verdaccio smoke test.
- `packages/content/package.json`, `packages/mcp-server/package.json`, `packages/cli/package.json`: `engines.node` added; `mcp-server`'s dependency range on `content` addressed per the version-pinning decision.
- New: `packages/content/README.md`, `packages/cli/README.md`.
- No changes to `packages/core`, `packages/vscode`, `packages/claude-plugin`, `packages/codex`, or any runtime tool behavior — everything here is about how the already-correct three packages get published and verified, not what they do.
- No implementation this round — planning only, per this session's established pattern.
