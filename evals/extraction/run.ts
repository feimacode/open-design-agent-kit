#!/usr/bin/env -S npx tsx
// Runs the kit's website extraction on every benchmark site and scores the
// draft against the sites' truth (openspec add-extraction-benchmark).
//
//   npm run bench:extraction                         main and held-out sets
//   npm run bench:extraction -- --only stripe.com    one site
//   npm run bench:extraction -- --set main --label "before add-accent-candidates"
//   npm run bench:extraction -- --compare results/2026-11-05.json
//
// Needs network access to the public sites and a Chrome, Edge or Chromium
// (or OPEN_DESIGN_BROWSER_PATH). No model tokens. Writes results/<date>.json
// and results/<date>.md; commit both.
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { extractSite } from '../../packages/core/src/generation/siteExtraction';
import { findBrowser } from '../../packages/core/src/export/browserDiscovery';
import { compareRuns, resultMarkdown, scoreSite, summarise } from './score.mjs';

interface Entry {
  site: string;
  url: string;
  accent: string[];
  font: string[];
  bg?: string;
  fg?: string;
}

const DIR = __dirname;
const TIMEOUT_MS = 90_000;

function args(): { only?: string[]; sets: string[]; label?: string; compare?: string; out?: string } {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const set = get('--set');
  return { only: get('--only')?.split(','), sets: set ? [set] : ['main', 'holdout'], label: get('--label'), compare: get('--compare'), out: get('--out') };
}

async function load(set: string): Promise<Entry[]> {
  const file = path.join(DIR, set === 'main' ? 'sites.json' : 'holdout.json');
  return (JSON.parse(await fs.readFile(file, 'utf8')) as { sites: Entry[] }).sites;
}

const isNetworkError = (msg: string) => /net::|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|Navigation timeout/i.test(msg);

async function extractOnce(entry: Entry, executablePath: string): Promise<{ status: string; tokens?: Record<string, string>; error?: string }> {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-bench-'));
  try {
    const timer = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS).unref());
    const r = await Promise.race([extractSite({ url: entry.url, workspaceRoot, outputDir: '.open-design', executablePath }), timer]);
    if (r.status === 'ok' || r.status === 'partial') return { status: r.status, tokens: r.draft?.tokens };
    if (r.status === 'blocked') return { status: 'blocked', error: r.blocked?.[0]?.reason };
    return { status: 'failed', error: 'error' in r ? String(r.error) : r.status };
  } catch (e) {
    return { status: 'failed', error: (e as Error).message };
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function runSite(entry: Entry, executablePath: string) {
  const t0 = Date.now();
  let outcome = await extractOnce(entry, executablePath);
  if (outcome.status === 'failed' && isNetworkError(outcome.error ?? '')) outcome = await extractOnce(entry, executablePath);
  return scoreSite(entry, { ...outcome, ms: Date.now() - t0 });
}

function browserVersion(executablePath: string): string {
  try {
    return execFileSync(executablePath, ['--version'], { encoding: 'utf8', timeout: 10_000 }).trim();
  } catch {
    return path.basename(executablePath);
  }
}

async function main(): Promise<void> {
  const opts = args();
  const found = await findBrowser({});
  if (!found.ok) throw new Error('No Chrome, Edge or Chromium found. Install one or set OPEN_DESIGN_BROWSER_PATH.');
  const pkg = JSON.parse(await fs.readFile(path.join(DIR, '..', '..', 'packages', 'mcp-server', 'package.json'), 'utf8')) as { version: string };
  const sets = [];
  for (const name of opts.sets) {
    const entries = (await load(name)).filter((e) => !opts.only || opts.only.includes(e.site));
    const scores = [];
    for (const entry of entries) {
      const s = await runSite(entry, found.executablePath);
      const m = (r: { hit: boolean } | null) => (r === null ? '·' : r.hit ? '✓' : '✗');
      console.log(`${name.padEnd(8)} ${entry.site.padEnd(28)} ${s.status.padEnd(8)} accent ${m(s.accent)} ${s.accent?.drafted ?? ''}  font ${m(s.font)} ${s.font?.drafted ?? ''}`);
      scores.push(s);
    }
    sets.push({ name, summary: summarise(scores), scores });
  }
  const date = new Date().toISOString().slice(0, 10);
  const run = { date, kitVersion: pkg.version, browser: browserVersion(found.executablePath), label: opts.label, sets };
  const outDir = path.join(DIR, 'results');
  await fs.mkdir(outDir, { recursive: true });
  const base = path.join(outDir, opts.out ?? date);
  await fs.writeFile(`${base}.json`, JSON.stringify(run, null, 2) + '\n');
  await fs.writeFile(`${base}.md`, resultMarkdown(run));
  console.log(`\n${resultMarkdown({ ...run, sets: sets.map((s) => ({ ...s, scores: [] })) }).split('\n## ')[0]}`);
  if (opts.compare) {
    const before = JSON.parse(await fs.readFile(path.resolve(opts.compare), 'utf8')) as typeof run;
    for (const set of sets) {
      const prev = before.sets.find((s) => s.name === set.name);
      if (!prev) continue;
      const { lost, gained } = compareRuns(prev.scores, set.scores);
      console.log(`${set.name}: gained ${gained.length} (${gained.join(', ') || 'none'}), lost ${lost.length} (${lost.join(', ') || 'none'})`);
      if (set.name === 'main' && lost.length - gained.length >= 2) process.exitCode = 2;
    }
  }
  console.log(`Wrote ${path.relative(process.cwd(), base)}.json and .md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
