#!/usr/bin/env -S npx tsx
// Scores Open Design eval runs (openspec add-output-quality-evals). Every
// number comes from the kit's own tools: the CLI `check` command (findings by
// code), the artifact manifests (critique, brief assumptions), the agent's
// transcript (questions, assumptions, tool calls) and a look signature per
// design. No pixel diffing, no model-graded score.
//
//   npx tsx scripts/evals/score.mjs --score-only <dir> [--label <text>] [--no-results]
//
// <dir> is one workspace (it has .open-design/) or a folder of workspaces,
// e.g. designs made in Claude Desktop or Codex. scripts/evals/run.mjs imports
// the same functions for its agent runs.
import { spawn } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanArtifactManifests } from '../../packages/core/src/workspace/collectionScan';
import { findBrowser } from '../../packages/core/src/export/browserDiscovery';
import { renderShapeSheetHtml } from '../../packages/core/src/poster/shapeSheet';
import { countAssumptionLines, DESIGN_FOLDERS, EVALS_DIR, htmlFiles, loadBriefs, lookSignature, REPO_ROOT, scoreTable, signatureKey, summary, total } from './lib.mjs';

export * from './lib.mjs';
const TSX = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const CLI = path.join(REPO_ROOT, 'packages', 'cli', 'src', 'index.ts');
const CONTACT_SHEET_MAX_BYTES = 1_000_000;

// ---------------------------------------------------------------- check

function runCli(args, env) {
  return new Promise((resolve) => {
    const child = spawn(TSX, [CLI, ...args], { cwd: REPO_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** The CLI `check --json` result for one design, with its first screenshot written under shotsDir. */
export async function checkDesign(workspaceRoot, entryPath, shotsDir, env = process.env) {
  const { stdout, stderr } = await runCli(['check', path.join(workspaceRoot, entryPath), '--workspace', workspaceRoot, '--json', '--screenshots', shotsDir, '--max-images', '1'], env);
  const line = stdout.trim().split('\n').pop() ?? '';
  try {
    return JSON.parse(line);
  } catch {
    return { ok: false, code: 'cli', error: (stderr || stdout).trim().split('\n').slice(-3).join(' ') || 'check printed nothing' };
  }
}

function countCodes(findings, severity) {
  const counts = {};
  for (const f of findings) if (f.severity === severity) counts[f.check] = (counts[f.check] ?? 0) + 1;
  return counts;
}

/** A design's steering edits and their guard results (openspec add-steering-edits), oldest first. */
export function steeringEdits(manifest) {
  const log = Array.isArray(manifest?.metadata?.edits) ? manifest.metadata.edits : [];
  if (log.length === 0) return undefined;
  return log.map((e) => ({
    verb: e.verb,
    scope: e.scope,
    status: e.status,
    checked: e.status === 'checked' && Boolean(e.result),
    outOfScope: e.result?.outOfScope ?? 0,
    regressions: e.result?.regressions ?? 0,
    noEffect: Boolean(e.result?.noEffect),
  }));
}

/**
 * Scores every registered design in one workspace. `run` carries what only an
 * agent run knows (transcript, rounds, wall time); without it those columns are n/a.
 */
export async function scoreWorkspace({ workspaceRoot, shotsDir, brief, run, env }) {
  const registered = await registeredDesigns(workspaceRoot);
  // A redesign's before/after page is evidence about the designs, not a design (openspec add-before-after).
  const manifests = registered.filter((m) => !m.manifest.metadata?.beforeAfter);
  const beforeAfter = registered
    .filter((m) => m.manifest.metadata?.beforeAfter)
    .map(({ entryPath, manifest }) => ({ entryPath, fixed: manifest.metadata.beforeAfter.fixed?.length ?? 0, open: manifest.metadata.beforeAfter.open?.length ?? 0, summary: manifest.metadata.beforeAfter.summary ?? 0 }));
  const entries = new Set(registered.map((m) => m.entryPath));
  const transcript = run?.transcript;
  const designs = [];
  for (const { entryPath, manifest } of manifests) {
    const checked = await checkDesign(workspaceRoot, entryPath, path.join(shotsDir, slug(entryPath)), env);
    const findings = checked.ok ? checked.findings : [];
    const critique = manifest.metadata?.critique;
    const assumptions = Array.isArray(manifest.metadata?.brief?.assumptions) ? manifest.metadata.brief.assumptions.length : undefined;
    designs.push({
      entryPath,
      title: manifest.title,
      skill: manifest.sourceSkillId,
      designSystem: manifest.designSystemId,
      checkOk: checked.ok,
      checkError: checked.ok ? undefined : checked.error,
      errors: countCodes(findings, 'error'),
      warnings: countCodes(findings, 'warning'),
      critic: critique && typeof critique.verdict === 'string' ? { verdict: critique.verdict, findings: Array.isArray(critique.findings) ? critique.findings.length : 0 } : undefined,
      assumptions: assumptions ?? (transcript ? countAssumptionLines(transcript.texts) : undefined),
      signature: await lookSignature(workspaceRoot, entryPath),
      edits: steeringEdits(manifest),
      screenshot: checked.ok ? checked.images?.[0]?.file : undefined,
    });
  }
  return {
    brief: brief?.id,
    unregistered: designs.length === 0 ? (await htmlFiles(workspaceRoot)).filter((f) => !entries.has(f)) : [],
    repeat: run?.repeat,
    workspace: workspaceRoot,
    designs,
    beforeAfter,
    questions: run?.questions,
    rounds: run?.rounds,
    toolCalls: transcript?.toolUses.length,
    wallSeconds: run?.wallSeconds,
    costUsd: run?.costUsd,
    agentError: run?.error,
  };
}

/** Every registered design in the workspace, wherever its design folder is. */
export async function registeredDesigns(workspaceRoot) {
  return (await scanArtifactManifests(workspaceRoot, '.')).filter(({ entryPath }) => !entryPath.split('/').includes('.checks'));
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'design';
}

/** Workspaces under dir: dir itself when it has a design folder (.open-design/ or Open Design/), else its direct subfolders that do. */
export async function findWorkspaces(dir) {
  const isWorkspace = (d) => DESIGN_FOLDERS.some((f) => existsSync(path.join(d, f)));
  if (isWorkspace(dir)) return [dir];
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && isWorkspace(path.join(dir, entry.name))) out.push(path.join(dir, entry.name));
  }
  return out.sort();
}

// ---------------------------------------------------------------- browser

/**
 * The browser for checks and the contact sheet. As root on Linux (containers),
 * Chromium needs --no-sandbox, which the kit never passes, so a small wrapper
 * adds it. Returns the env to give the CLI and the agent.
 */
export async function browserEnv(runDir, explicitPath) {
  const found = await findBrowser({ explicitPath });
  if (!found.ok) return { env: process.env, browserPath: undefined, problem: found.message };
  let browserPath = found.executablePath;
  if (process.platform === 'linux' && process.getuid?.() === 0) {
    const wrapper = path.join(runDir, 'browser-no-sandbox.sh');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(wrapper, `#!/bin/sh\nexec "${browserPath}" --no-sandbox "$@"\n`, { mode: 0o755 });
    browserPath = wrapper;
  }
  return { env: { ...process.env, OPEN_DESIGN_BROWSER_PATH: browserPath }, browserPath };
}

// ---------------------------------------------------------------- contact sheet

/** One image of every design in the run, labelled with brief, repeat and error count, under 1 MB. */
export async function writeContactSheet(scores, outFile, browserPath) {
  const thumbs = [];
  for (const s of scores) {
    for (const d of s.designs) {
      if (!d.screenshot) continue;
      const errors = Object.values(d.errors).reduce((a, b) => a + b, 0);
      thumbs.push({ label: `${s.brief ?? path.basename(s.workspace)}${s.repeat ? ` #${s.repeat}` : ''}`, png: await fs.readFile(d.screenshot), mime: 'image/jpeg', errors });
    }
  }
  if (thumbs.length === 0 || !browserPath) return undefined;
  const { default: puppeteer } = await import('puppeteer-core');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'od-evals-sheet-'));
  const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, userDataDir: profile, args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
  let png;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 2448, height: 800 });
    await page.setContent(renderShapeSheetHtml(thumbs, undefined, 'Open Design evals — every design'), { waitUntil: 'load' });
    png = Buffer.from(await page.screenshot({ type: 'png', fullPage: true }));
  } finally {
    await browser.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
  const { default: sharp } = await import('sharp');
  let width = Math.min(2400, (await sharp(png).metadata()).width ?? 2400);
  let out = png;
  for (let i = 0; i < 6; i++) {
    out = await sharp(png).resize({ width, withoutEnlargement: true }).png({ palette: true, quality: 80, compressionLevel: 9 }).toBuffer();
    if (out.length <= CONTACT_SHEET_MAX_BYTES) break;
    width = Math.round(width * 0.8);
  }
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, out);
  return outFile;
}

// ---------------------------------------------------------------- results

/** Kit version, git commit and whether the tree had local changes. */
export async function kitVersion() {
  const pkg = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'packages', 'mcp-server', 'package.json'), 'utf8'));
  const git = async (args) =>
    new Promise((resolve) => {
      const child = spawn('git', args, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      child.stdout.on('data', (d) => (out += d));
      child.on('close', () => resolve(out.trim()));
      child.on('error', () => resolve(''));
    });
  const sha = await git(['rev-parse', '--short', 'HEAD']);
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const dirty = (await git(['status', '--porcelain', '--', 'packages'])) !== '';
  return `${pkg.version} (${branch || '?'} ${sha || '?'}${dirty ? ', local changes' : ''})`;
}

/** Appends one dated section to evals/RESULTS.md. */
export async function appendResults({ scores, briefs, mode, model, label, contactSheet, runDir, resultsFile = path.join(EVALS_DIR, 'RESULTS.md') }) {
  const briefsById = new Map((briefs ?? []).map((b) => [b.id, b]));
  const date = new Date().toISOString().slice(0, 10);
  const rel = (p) => path.relative(path.dirname(resultsFile), p).split(path.sep).join('/');
  const lines = [
    '',
    `## ${date}${label ? ` — ${label}` : ''}`,
    '',
    `- Kit: ${await kitVersion()}`,
    `- Mode: ${mode}${model ? `, model ${model}` : ''}`,
    `- Run folder (not committed): \`${rel(runDir)}/\``,
    contactSheet ? `- Contact sheet: [${rel(contactSheet)}](${rel(contactSheet)})` : '- Contact sheet: none (no screenshots)',
    '',
    summary(scores),
    '',
    scoreTable(scores, briefsById),
    '',
  ];
  const usedBriefs = [...new Set(scores.map((s) => s.brief).filter(Boolean))].map((id) => briefsById.get(id)).filter(Boolean);
  if (usedBriefs.length > 0) {
    lines.push('Must notes (ticked by the reviewer from the contact sheet):', '');
    for (const b of usedBriefs) for (const note of b.must) lines.push(`- [ ] ${b.id}: ${note}`);
    lines.push('');
  }
  await fs.appendFile(resultsFile, lines.join('\n'));
  return resultsFile;
}

// ---------------------------------------------------------------- CLI

export async function scoreOnly(dir, { label, writeResults = true, browser } = {}) {
  const root = path.resolve(dir);
  const workspaces = await findWorkspaces(root);
  if (workspaces.length === 0) throw new Error(`No workspace with ${DESIGN_FOLDERS.join('/ or ')}/ found at ${root} or in its subfolders.`);
  const runDir = path.join(EVALS_DIR, 'runs', `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}-score-only`);
  const { env, browserPath, problem } = await browserEnv(runDir, browser);
  if (problem) console.error(`Browser: ${problem}`);
  const briefs = await loadBriefs();
  const ids = new Set(briefs.map((b) => b.id));
  const scores = [];
  for (const ws of workspaces) {
    // A subfolder named after a brief (optionally with -<n>) is scored as that brief.
    const m = /^(.*?)(?:-(\d+))?$/.exec(path.basename(ws));
    const brief = m && ids.has(m[1]) ? briefs.find((b) => b.id === m[1]) : undefined;
    console.error(`Scoring ${ws}…`);
    const score = await scoreWorkspace({ workspaceRoot: ws, shotsDir: path.join(runDir, 'shots', path.basename(ws)), brief, env });
    if (brief && m[2]) score.repeat = Number(m[2]);
    scores.push(score);
  }
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'scores.json'), JSON.stringify(scores, null, 2) + '\n');
  const contactSheet = await writeContactSheet(scores, path.join(runDir, 'contact-sheet.png'), browserPath);
  console.log(summary(scores));
  console.log(scoreTable(scores, new Map(briefs.map((b) => [b.id, b]))));
  if (writeResults) console.log(`\nAppended to ${await appendResults({ scores, briefs, mode: 'score-only', label, contactSheet, runDir })}`);
  return scores;
}

function parseArgs(argv) {
  const out = { results: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--score-only') out.dir = argv[++i];
    else if (a === '--label') out.label = argv[++i];
    else if (a === '--browser') out.browser = argv[++i];
    else if (a === '--no-results') out.results = false;
    else throw new Error(`Unknown argument ${a}`);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.dir) throw new Error('Usage: npx tsx scripts/evals/score.mjs --score-only <dir> [--label <text>] [--browser <path>] [--no-results]');
    await scoreOnly(args.dir, { label: args.label, writeResults: args.results, browser: args.browser });
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
