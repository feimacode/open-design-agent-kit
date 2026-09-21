#!/usr/bin/env node
// Process safeguard, same family as check-content-mirror.mjs/check-skills-sync.mjs:
// confirms packages/cli's mirrored assets/{claude-skills,codex-skills} are
// byte-for-byte identical to their real sources, so a content refresh that
// forgot to also re-run copy-skill-content.mjs (and commit the refresh) is
// caught, not silently shipped stale in the published CLI package.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(cliRoot, '..', '..');

const PAIRS = [
  { src: path.join(repoRoot, 'packages', 'claude-plugin', 'skills'), dst: path.join(cliRoot, 'assets', 'claude-skills'), label: 'claude-skills' },
  { src: path.join(repoRoot, '.agents', 'skills'), dst: path.join(cliRoot, 'assets', 'codex-skills'), label: 'codex-skills' },
];

async function listFilesRecursive(dir, baseDir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(full, baseDir)));
    } else if (entry.isFile()) {
      out.push(path.relative(baseDir, full).split(path.sep).join('/'));
    }
  }
  return out;
}

async function main() {
  const problems = [];

  for (const { src, dst, label } of PAIRS) {
    const [srcFiles, dstFiles] = await Promise.all([listFilesRecursive(src, src), listFilesRecursive(dst, dst)]);
    const srcSet = new Set(srcFiles);
    const dstSet = new Set(dstFiles);

    for (const f of srcFiles) if (!dstSet.has(f)) problems.push(`${label}: missing mirrored file "${f}"`);
    for (const f of dstFiles) if (!srcSet.has(f)) problems.push(`${label}: stale mirrored file not in source: "${f}"`);

    for (const f of srcFiles) {
      if (!dstSet.has(f)) continue;
      const [a, b] = await Promise.all([fs.readFile(path.join(src, f)), fs.readFile(path.join(dst, f))]);
      if (!a.equals(b)) problems.push(`${label}: content drift for "${f}"`);
    }
  }

  if (problems.length > 0) {
    console.error(`packages/cli asset mirror drift detected:\n${problems.map((p) => `  - ${p}`).join('\n')}\nRun \`npm run sync-content\` and commit the refreshed packages/cli/assets/.`);
    process.exit(1);
  }

  console.log('packages/cli/assets/{claude-skills,codex-skills} are in sync with their sources.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
