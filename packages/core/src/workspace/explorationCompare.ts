// The exploration's comparison page (`compare.html`) and its contact-sheet
// PNG. The page is generated chrome around the designs, not a design, so it
// is never registered as an artifact (design.md decision 6): no scripts, no
// network, relative paths only, so it works straight from `file://`.

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Browser } from 'puppeteer-core';
import { findBrowser } from '../export/browserDiscovery';
import { loadPage } from '../export/exportArtifact';
import { startStaticServer, urlForPath } from '../export/staticServer';
import {
  directionArtifactMap,
  explorationPaths,
  findExplorationArtifacts,
  readExplorationPlan,
  type ExplorationArtifact,
  type ExplorationPlan,
} from './explorationStore';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** An href/src for a workspace-relative path, relative to the comparison page's own directory. */
function relHref(fromDir: string, toPath: string): string {
  return path.posix
    .relative(fromDir, toPath)
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

const AXIS_LABEL: Record<string, string> = { visual: 'Visual direction', structure: 'Structure', custom: 'Custom' };

/** Pure: plan + registered artifacts → the comparison page's HTML. */
export function renderExplorationCompareHtml(plan: ExplorationPlan, artifacts: ExplorationArtifact[], outputDir: string): string {
  const dir = explorationPaths(outputDir, plan.explorationId).dir;
  const byDirection = directionArtifactMap(artifacts);
  const total = plan.directions.length;
  const cols = total <= 3 ? total : 2;
  const chosenId = plan.chosen?.directionId;

  const cards = plan.directions
    .map((d, i) => {
      const artifact = byDirection.get(d.id);
      const chosen = d.id === chosenId;
      const preview = artifact
        ? `<div class="frame"><iframe src="${esc(relHref(dir, artifact.entryPath))}" title="${esc(d.label)}" scrolling="no"></iframe></div>`
        : `<div class="frame placeholder"><span>Not generated yet</span><code>${esc(d.entryPath)}</code></div>`;
      const link = artifact
        ? `<a href="${esc(relHref(dir, artifact.entryPath))}">Open full size</a> <code>${esc(artifact.entryPath)}</code>`
        : `<span class="muted">Planned at</span> <code>${esc(d.entryPath)}</code>`;
      return `<article class="card${chosen ? ' chosen' : ''}" data-direction="${esc(d.id)}">
  <header>
    <span class="index">${String.fromCharCode(65 + i)}</span>
    <h2 title="${esc(d.label)}">${esc(d.label)}</h2>
  </header>
  <div class="badges"><span class="badge">${esc(AXIS_LABEL[d.axis] ?? d.axis)}</span>${chosen ? '<span class="badge chosen-badge">Chosen</span>' : ''}</div>
  ${preview}
  <p class="summary">${esc(d.summary)}</p>
  <p class="link">${link}</p>
</article>`;
    })
    .join('\n');

  const builtOut = artifacts.filter((a) => !a.directionId);
  const builtOutHtml =
    builtOut.length > 0
      ? `<section class="built"><h2>Built from this exploration</h2><ul>${builtOut
          .map((a) => `<li><a href="${esc(relHref(dir, a.entryPath))}">${esc(a.title)}</a> <code>${esc(a.entryPath)}</code></li>`)
          .join('')}</ul></section>`
      : '';

  const meta = [
    `${total} directions`,
    AXIS_LABEL[plan.axis] ?? plan.axis,
    plan.designSystemName && !plan.designSystemSetAside ? `Design system: ${plan.designSystemName}` : undefined,
    plan.designSystemSetAside ? `Design system ${plan.designSystemName ?? ''} set aside for this visual exploration` : undefined,
  ]
    .filter(Boolean)
    .map((m) => esc(m!))
    .join(' · ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Open Design Agent Kit">
<title>${esc(plan.title)} — directions</title>
<style>
:root { --bg: #f6f6f4; --surface: #fff; --fg: #1b1b1a; --muted: #6b6b66; --border: #e2e2dd; --accent: #2f6fde; --chosen: #1f8a4c; }
@media (prefers-color-scheme: dark) { :root { --bg: #151514; --surface: #1e1e1c; --fg: #ededea; --muted: #a3a39d; --border: #34342f; --accent: #7aa7ff; --chosen: #4cc283; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
main { max-width: 1680px; margin: 0 auto; padding: 32px 24px 48px; }
h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.01em; }
.meta, .muted { color: var(--muted); }
.brief { color: var(--muted); max-width: 900px; margin: 8px 0 0; }
.grid { display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: 24px; margin-top: 28px; }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px; min-width: 0; }
.card.chosen { border: 2px solid var(--chosen); }
.card header { display: flex; align-items: center; gap: 10px; }
.card h2 { font-size: 16px; margin: 0; flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.badges { display: flex; gap: 6px; margin: 8px 0 12px 36px; }
.index { flex: none; display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--fg); color: var(--surface); font-weight: 600; font-size: 13px; }
.badge { font-size: 12px; color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; }
.chosen-badge { color: var(--chosen); border-color: var(--chosen); font-weight: 600; }
.frame { position: relative; aspect-ratio: 16 / 10; overflow: hidden; border: 1px solid var(--border); border-radius: 6px; background: #fff; }
/* One-third scale: each preview gets a desktop-width virtual viewport (~1400px for a 470px card). */
.frame iframe { position: absolute; top: 0; left: 0; width: 300%; height: 300%; border: 0; transform: scale(0.3333); transform-origin: 0 0; }
.placeholder { display: grid; place-content: center; gap: 6px; text-align: center; color: var(--muted); background: repeating-linear-gradient(45deg, transparent 0 10px, var(--border) 10px 11px); }
.summary { margin: 12px 0 4px; }
.link { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
a { color: var(--accent); }
code { font: 12px/1.4 ui-monospace, Menlo, monospace; color: var(--muted); }
.built { margin-top: 32px; }
.built h2 { font-size: 16px; }
footer { margin-top: 32px; font-size: 13px; color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>${esc(plan.title)}</h1>
  <div class="meta">${meta}</div>
  ${plan.brief.trim() !== plan.title ? `<p class="brief">${esc(plan.brief)}</p>` : ''}
  <div class="grid">
${cards}
  </div>
  ${builtOutHtml}
  <footer>Generated by Open Design Agent Kit. Tell your agent which direction you want, e.g. “go with B” or “B, with A’s hero”.</footer>
</main>
</body>
</html>
`;
}

export type RefreshCompareResult =
  | { ok: true; comparePath: string; plan: ExplorationPlan; artifacts: ExplorationArtifact[]; registered: string[]; missing: string[] }
  | { ok: false; warning: string };

/** Rewrites `compare.html` from the plan and the registered sidecars. Never throws. */
export async function refreshExplorationCompare(workspaceRoot: string, outputDir: string, explorationId: string): Promise<RefreshCompareResult> {
  try {
    const plan = await readExplorationPlan(workspaceRoot, outputDir, explorationId);
    if (!plan) {
      return { ok: false, warning: `No exploration plan found for explorationId "${explorationId}", so no comparison page was updated.` };
    }
    const artifacts = await findExplorationArtifacts(workspaceRoot, outputDir, explorationId, plan);
    const comparePath = explorationPaths(outputDir, explorationId).compare;
    await fs.writeFile(path.join(workspaceRoot, comparePath), renderExplorationCompareHtml(plan, artifacts, outputDir), 'utf8');
    const byDirection = directionArtifactMap(artifacts);
    return {
      ok: true,
      comparePath,
      plan,
      artifacts,
      registered: plan.directions.filter((d) => byDirection.has(d.id)).map((d) => d.id),
      missing: plan.directions.filter((d) => !byDirection.has(d.id)).map((d) => d.id),
    };
  } catch (err) {
    return { ok: false, warning: `Couldn't update the comparison page: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export type ContactSheetResult = { ok: true; path: string; warnings: string[] } | { ok: false; reason: string };

const CONTACT_SHEET_WIDTH = 1600;

/** Renders `compare.html` full-page to `<exploration>/exports/contact-sheet.png` with the installed browser. Never throws. */
export async function renderExplorationContactSheet(options: {
  workspaceRoot: string;
  outputDir: string;
  explorationId: string;
  browserPath?: string;
}): Promise<ContactSheetResult> {
  const paths = explorationPaths(options.outputDir, options.explorationId);
  const browser = await findBrowser({ explicitPath: options.browserPath });
  if (!browser.ok) return { ok: false, reason: `Contact sheet skipped: ${browser.message}` };

  const warnings: string[] = [];
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-contact-sheet-'));
  const server = await startStaticServer(options.workspaceRoot);
  let instance: Browser | undefined;
  try {
    const { default: puppeteer } = await import('puppeteer-core');
    instance = await puppeteer.launch({
      executablePath: browser.executablePath,
      headless: true,
      userDataDir: profileDir,
      protocolTimeout: 60_000,
      args: ['--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb'],
    });
    const page = await instance.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.setViewport({ width: CONTACT_SHEET_WIDTH, height: 600, deviceScaleFactor: 1 });
    await loadPage(page, urlForPath(server.baseUrl, paths.compare), 20000, 1200, warnings);
    const buffer = Buffer.from(await page.screenshot({ type: 'png', fullPage: true }));
    const abs = path.join(options.workspaceRoot, paths.contactSheet);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer);
    return { ok: true, path: paths.contactSheet, warnings };
  } catch (err) {
    return { ok: false, reason: `Contact sheet failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    await instance?.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
