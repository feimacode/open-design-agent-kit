#!/usr/bin/env -S npx tsx
// Runs the site audit's taste rules on hand-made sites and AI-default pages,
// and reports each rule's false-alarm and hit rates
// (openspec calibrate-site-audit-taste-checks).
//
//   npm run calibrate:taste                          every page, writes results/<date>.md and .json
//   npm run calibrate:taste -- --only gov.uk,bbc.co.uk
//   npm run calibrate:taste -- --offline             replay the cached pages in cache/ (no network)
//   npm run calibrate:taste -- --write               also update the audit's taste-calibration.json
//
// Needs network access to the public sites (unless --offline) and a Chrome,
// Edge or Chromium (or OPEN_DESIGN_BROWSER_PATH). No model tokens.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { findBrowser } from '../../packages/core/src/export/browserDiscovery';
import { DESKTOP_VIEWPORT, gotoPage, hideConsentBanners, launchLiveBrowser } from '../../packages/core/src/export/livePage';
import { desktopPasses } from '../../packages/core/src/export/siteAudit';
import { calibrate, firedOn, resultMarkdown } from './rates.mjs';

interface Entry {
  site: string;
  url?: string;
  file?: string;
  why: string;
}

const DIR = __dirname;
const CACHE = path.join(DIR, 'cache');
const CALIBRATION_FILE = path.join(DIR, '..', '..', 'packages', 'core', 'src', 'export', 'taste-calibration.json');

function args(): { only?: string[]; offline: boolean; write: boolean; out?: string } {
  const a = process.argv.slice(2);
  const get = (flag: string) => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return { only: get('--only')?.split(','), offline: a.includes('--offline'), write: a.includes('--write'), out: get('--out') };
}

async function load(file: string): Promise<Entry[]> {
  return (JSON.parse(await fs.readFile(path.join(DIR, file), 'utf8')) as { sites: Entry[] }).sites;
}

/** Replaces each readable stylesheet link with its rules, so the cached HTML renders without the network. A string, so tsx adds no helpers to it. */
const INLINE_STYLESHEETS = `(() => {
  let missed = 0;
  for (const link of Array.from(document.querySelectorAll('link[rel="stylesheet"]'))) {
    try {
      const css = link.sheet ? Array.from(link.sheet.cssRules).map((r) => r.cssText).join('\\n') : '';
      const style = document.createElement('style');
      style.textContent = css;
      link.replaceWith(style);
    } catch (e) {
      missed += 1;
    }
  }
  document.querySelectorAll('script').forEach((s) => s.remove());
  return missed;
})()`;

async function runPage(live: Awaited<ReturnType<typeof launchLiveBrowser>>, entry: Entry, set: 'handMade' | 'aiDefault', offline: boolean) {
  const { page } = live;
  const cacheDir = path.join(CACHE, entry.site.replace(/[^a-z0-9.-]/gi, '_'));
  try {
    await page.setViewport({ ...DESKTOP_VIEWPORT, deviceScaleFactor: 1 });
    if (entry.file) {
      // The live browser only loads http(s); a local page is set as content (keep its styles inline).
      await page.setContent(await fs.readFile(path.join(DIR, entry.file), 'utf8'), { waitUntil: 'load' });
    } else if (offline) {
      const html = await fs.readFile(path.join(cacheDir, 'page.html'), 'utf8');
      await page.setContent(html, { waitUntil: 'load' });
    } else {
      await gotoPage(page, entry.url!);
      await page.evaluate(hideConsentBanners);
    }
    // setContent opens no new document, so the live browser's __name shim for tsx-compiled page functions isn't there yet.
    await page.evaluate('globalThis.__name = globalThis.__name || ((fn) => fn)');
    const checks = (await desktopPasses(page)).map((f) => f.check);
    if (!offline && !entry.file) {
      await fs.mkdir(cacheDir, { recursive: true });
      await page.screenshot({ path: path.join(cacheDir, 'desktop.png') });
      const missed = Number(await page.evaluate(INLINE_STYLESHEETS));
      await fs.writeFile(path.join(cacheDir, 'page.html'), await page.content());
      if (missed) await fs.writeFile(path.join(cacheDir, 'NOTE.txt'), `${missed} cross-origin stylesheet(s) could not be inlined; an offline replay renders without them.\n`);
    }
    return { site: entry.site, set, status: 'ok' as const, fired: firedOn(checks) };
  } catch (e) {
    return { site: entry.site, set, status: 'failed' as const, fired: [] as string[], error: (e as Error).message.split('\n')[0] };
  }
}

async function main(): Promise<void> {
  const opts = args();
  const found = await findBrowser({});
  if (!found.ok) throw new Error('No Chrome, Edge or Chromium found. Install one or set OPEN_DESIGN_BROWSER_PATH.');
  const sets: Array<['handMade' | 'aiDefault', Entry[]]> = [
    ['handMade', await load('handmade.json')],
    ['aiDefault', await load('ai-default.json')],
  ];
  const pages = [];
  const live = await launchLiveBrowser(found.executablePath, [], 'od-taste-cal-');
  try {
    for (const [set, entries] of sets) {
      for (const entry of entries.filter((e) => !opts.only || opts.only.includes(e.site))) {
        const r = await runPage(live, entry, set, opts.offline);
        console.log(`${set.padEnd(9)} ${entry.site.padEnd(24)} ${r.status.padEnd(7)} ${r.fired.join(', ') || '-'}${'error' in r && r.error ? `  ${r.error}` : ''}`);
        pages.push(r);
      }
    }
  } finally {
    await live.close();
  }
  const date = new Date().toISOString().slice(0, 10);
  const cal = calibrate(pages, date);
  const outDir = path.join(DIR, 'results');
  await fs.mkdir(outDir, { recursive: true });
  const base = path.join(outDir, opts.out ?? date);
  await fs.writeFile(`${base}.json`, JSON.stringify({ ...cal, offline: opts.offline, pages }, null, 2) + '\n');
  await fs.writeFile(`${base}.md`, resultMarkdown(cal, pages));
  console.log(`\n${resultMarkdown(cal, pages).split('\n## ')[0]}`);
  if (opts.write) {
    if (opts.only) throw new Error('--write needs the whole set: drop --only.');
    await fs.writeFile(CALIBRATION_FILE, JSON.stringify(cal, null, 2) + '\n');
    console.log(`Updated ${path.relative(process.cwd(), CALIBRATION_FILE)}`);
  }
  console.log(`Wrote ${path.relative(process.cwd(), base)}.json and .md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
