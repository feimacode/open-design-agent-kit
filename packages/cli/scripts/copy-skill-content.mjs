#!/usr/bin/env node
// Mirrors this repo's already-generated skill content into packages/cli's
// own assets/, so the published @feimacode/open-design-agent-kit package is
// fully self-contained at `init`-run time — no runtime dependency on
// packages/claude-plugin or packages/codex (both private, workspace-only
// packages that will never be published to npm). Same "vendor a mechanical
// copy, guard it against drift" pattern as
// packages/vscode/scripts/copy-content-assets.mjs; run as part of
// `npm run sync-content`, right after the two generators whose output this
// copies.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(cliRoot, '..', '..');

const CLAUDE_SRC = path.join(repoRoot, 'packages', 'claude-plugin', 'skills');
const CLAUDE_DST = path.join(cliRoot, 'assets', 'claude-skills');
const CODEX_SRC = path.join(repoRoot, '.agents', 'skills');
const CODEX_DST = path.join(cliRoot, 'assets', 'codex-skills');

async function mirror(src, dst) {
  await fs.rm(dst, { recursive: true, force: true });
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.cp(src, dst, { recursive: true });
}

async function main() {
  await mirror(CLAUDE_SRC, CLAUDE_DST);
  await mirror(CODEX_SRC, CODEX_DST);
  console.log(`Mirrored ${CLAUDE_SRC} -> ${CLAUDE_DST}`);
  console.log(`Mirrored ${CODEX_SRC} -> ${CODEX_DST}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
