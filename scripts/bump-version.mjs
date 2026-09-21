#!/usr/bin/env node
// Bumps the version of every package that release.yml's "Validate ... version"
// steps require to match the release tag, in one command, so they can't drift
// apart again the way packages/vscode (0.1.1) and the three npm packages
// (0.1.0) already have. Commits and tags locally; never pushes — pushing the
// tag is what fires release.yml, so that stays a deliberate separate step.
//
// Usage:
//   node scripts/bump-version.mjs <x.y.z|x.y.z-alpha.N|x.y.z-beta.N> [--dry-run]
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Matches the pattern release.yml/publish-npm.yml validate against — kept in
// one place here since this is the tool responsible for producing a version
// that will later need to satisfy both.
export const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta)\.[0-9]+)?$/;

const RELEASED_PACKAGE_DIRS = ['packages/vscode', 'packages/content', 'packages/mcp-server', 'packages/cli'];

function log(msg) {
  console.log(`[bump-version] ${msg}`);
}

async function updatePackageVersion(pkgDir, version, dryRun) {
  const pkgJsonPath = path.join(repoRoot, pkgDir, 'package.json');
  const raw = await fs.readFile(pkgJsonPath, 'utf8');
  const pkg = JSON.parse(raw);
  const from = pkg.version;
  if (from === version) {
    log(`${pkgDir}: already at ${version}, leaving untouched`);
    return null;
  }
  log(`${pkgDir}: ${from} -> ${version}${dryRun ? ' (dry run)' : ''}`);
  if (dryRun) return pkgJsonPath;

  pkg.version = version;
  // Preserve the file's existing 2-space/trailing-newline style rather than
  // reformatting the whole file.
  await fs.writeFile(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return pkgJsonPath;
}

async function checkChangelog(version) {
  const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
  let contents;
  try {
    contents = await fs.readFile(changelogPath, 'utf8');
  } catch {
    log('no CHANGELOG.md found — skipping changelog check (release.yml tolerates this too)');
    return;
  }
  if (!contents.includes(`## [${version}]`)) {
    log(`⚠️  CHANGELOG.md has no "## [${version}]" section yet — release.yml will fall back to a generic release body`);
  } else {
    log(`CHANGELOG.md has an entry for ${version}`);
  }
}

async function main() {
  const version = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');

  if (!version || !VERSION_PATTERN.test(version)) {
    console.error(`Usage: node scripts/bump-version.mjs <x.y.z|x.y.z-alpha.N|x.y.z-beta.N> [--dry-run]`);
    process.exit(1);
  }

  await checkChangelog(version);

  const changedPaths = [];
  for (const dir of RELEASED_PACKAGE_DIRS) {
    const changed = await updatePackageVersion(dir, version, dryRun);
    if (changed) changedPaths.push(changed);
  }

  if (dryRun) {
    log('dry run complete — nothing written, nothing committed');
    return;
  }

  if (changedPaths.length === 0) {
    log('every package already at the target version — nothing to commit');
    return;
  }

  log('syncing package-lock.json...');
  execFileSync('npm', ['install', '--package-lock-only'], { cwd: repoRoot, stdio: 'inherit' });

  const lockPath = path.join(repoRoot, 'package-lock.json');
  const relPaths = [...changedPaths, lockPath].map((p) => path.relative(repoRoot, p));

  execFileSync('git', ['add', ...relPaths], { cwd: repoRoot, stdio: 'inherit' });
  execFileSync('git', ['commit', '-m', `chore: release v${version}`], { cwd: repoRoot, stdio: 'inherit' });
  execFileSync('git', ['tag', '-a', `v${version}`, '-m', `v${version}`], { cwd: repoRoot, stdio: 'inherit' });

  log(`committed and tagged v${version}. Review with 'git show HEAD' and 'git tag -v v${version}', then:`);
  log(`  git push && git push origin v${version}`);
}

main().catch((err) => {
  console.error(`[bump-version] FAILED: ${err.message}`);
  process.exit(1);
});
