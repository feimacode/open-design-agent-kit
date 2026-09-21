#!/usr/bin/env node
// Mirrors packages/content/assets/open-design/ into this extension's own
// assets/open-design/, because a packaged VS Code extension (.vsix) must
// contain its content physically — context.extensionUri only ever resolves
// paths inside the extension's own installed directory, it cannot reach a
// sibling npm workspace package. packages/content remains the single place
// this content is synced from upstream; this is a mechanical mirror step,
// not a second independent vendoring path — run every time as part of
// `npm run sync-content`, and drift-checked by check-content-mirror.mjs.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const srcDir = path.resolve(repoRoot, '..', 'content', 'assets', 'open-design');
const dstDir = path.join(repoRoot, 'assets', 'open-design');

async function main() {
  await fs.rm(dstDir, { recursive: true, force: true });
  await fs.cp(srcDir, dstDir, { recursive: true });
  console.log(`Mirrored ${srcDir} -> ${dstDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
