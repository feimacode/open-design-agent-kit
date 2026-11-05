#!/usr/bin/env -S npx tsx
// Re-checks the benchmark's truth against the live sites (openspec
// add-extraction-benchmark): for each claimed brand colour, the closest colour
// the homepage paints at 1440×900 (CIEDE2000) and how much area it covers; and
// the family that renders body copy (the first family in the body text's
// computed stack with a loaded face).
//
//   npm run bench:evidence                           every site, both sets
//   npm run bench:evidence -- --only stripe.com
//   npm run bench:evidence -- --write                also date entries that still hold (`verified`)
//
// An entry holds when every claimed colour is painted within ΔE 3 and the body
// font is one of the claimed names. Entries that don't are listed with what
// the page paints instead; fix them by hand with an official source.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { findBrowser } from '../../packages/core/src/export/browserDiscovery';
import { deltaEHex, normaliseFont } from './score.mjs';

const DIR = __dirname;
const PAINTED = 3;

// In-page, as source text: tsx would otherwise add helpers to a function that
// don't exist in the page. Returns painted colours with their area, and the body font.
const COLLECT = `(() => {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const hex = (c) => {
    if (!c || c === 'transparent') return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#010203';
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    if (d[3] < 128) return null;
    return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  const area = new Map();
  const add = (c, a) => { const h = hex(c); if (h && a > 0) area.set(h, (area.get(h) || 0) + a); };
  const vw = innerWidth, vh = innerHeight;
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > vh * 3) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.1) continue;
    const a = Math.min(r.width, vw) * Math.min(r.height, vh);
    add(s.backgroundColor, a);
    const text = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (text) add(s.color, r.width * r.height * 0.15);
    if (parseFloat(s.borderTopWidth) > 0) add(s.borderTopColor, r.width * parseFloat(s.borderTopWidth));
    if (el instanceof SVGElement) { add(s.fill, a * 0.3); add(s.stroke, r.width * 2); }
  }
  add(getComputedStyle(document.body).backgroundColor, vw * vh);
  const paras = Array.from(document.querySelectorAll('p, li, td, dd')).filter((p) => (p.textContent || '').trim().length > 40);
  const counts = new Map();
  for (const p of paras) { const f = getComputedStyle(p).fontFamily; counts.set(f, (counts.get(f) || 0) + (p.textContent || '').length); }
  const stack = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || getComputedStyle(document.body).fontFamily;
  const families = stack.split(',').map((f) => f.trim().replace(/^["']|["']$/g, ''));
  const loaded = Array.from(document.fonts).filter((f) => f.status === 'loaded').map((f) => f.family.replace(/^["']|["']$/g, '').toLowerCase());
  const generic = ['serif', 'sans-serif', 'monospace', 'system-ui', 'ui-sans-serif', 'ui-serif', '-apple-system', 'blinkmacsystemfont'];
  const bodyFont = families.find((f) => loaded.includes(f.toLowerCase())) || families.find((f) => !generic.includes(f.toLowerCase())) || families[0];
  return { painted: [...area.entries()].map(([hex, a]) => ({ hex, area: Math.round(a) })), bodyFont, stack };
})()`;

interface Entry {
  site: string;
  url: string;
  accent: string[];
  font: string[];
  verified: string | null;
}

async function main(): Promise<void> {
  const a = process.argv.slice(2);
  const only = a.includes('--only') ? a[a.indexOf('--only') + 1].split(',') : undefined;
  const write = a.includes('--write');
  const found = await findBrowser({});
  if (!found.ok) throw new Error('No Chrome, Edge or Chromium found. Install one or set OPEN_DESIGN_BROWSER_PATH.');
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: found.executablePath, headless: true });
  const today = new Date().toISOString().slice(0, 10);
  const report: string[] = [];
  try {
    for (const file of ['sites.json', 'holdout.json']) {
      const full = path.join(DIR, file);
      const data = JSON.parse(await fs.readFile(full, 'utf8')) as { sites: Entry[] };
      for (const entry of data.sites) {
        if (only && !only.includes(entry.site)) continue;
        const start = report.length;
        const page = await browser.newPage();
        try {
          await page.setViewport({ width: 1440, height: 900 });
          await page.goto(entry.url, { waitUntil: 'networkidle2', timeout: 45_000 }).catch(() => page.goto(entry.url, { waitUntil: 'load', timeout: 45_000 }));
          await new Promise((r) => setTimeout(r, 1500));
          const got = (await page.evaluate(COLLECT)) as { painted: Array<{ hex: string; area: number }>; bodyFont: string; stack: string };
          const colours = entry.accent.map((claim) => {
            const best = got.painted.map((p) => ({ ...p, deltaE: deltaEHex(claim, p.hex) })).sort((x, y) => x.deltaE - y.deltaE)[0];
            return { claim, closest: best?.hex, deltaE: best ? Math.round(best.deltaE * 10) / 10 : null, area: best?.area ?? 0 };
          });
          const fontOk = entry.font.length === 0 || entry.font.some((f) => normaliseFont(f) === normaliseFont(got.bodyFont));
          const coloursOk = colours.every((c) => c.deltaE !== null && c.deltaE <= PAINTED);
          const ok = fontOk && coloursOk;
          if (ok && write) entry.verified = today;
          const desc = colours.map((c) => `${c.claim} → ${c.closest} ΔE ${c.deltaE} (${c.area} px²)`).join('; ') || 'no colour claimed';
          report.push(`${ok ? '✓' : '✗'} ${entry.site}: ${desc}; body font ${got.bodyFont}${fontOk ? '' : ` (claimed ${entry.font.join(', ')})`}`);
          if (!coloursOk) {
            const top = got.painted.sort((x, y) => y.area - x.area).slice(0, 8).map((p) => p.hex).join(' ');
            report.push(`    most painted: ${top}`);
          }
        } catch (e) {
          report.push(`? ${entry.site}: ${(e as Error).message.split('\n')[0]}`);
        } finally {
          await page.close();
        }
        console.log(report.slice(start).join('\n'));
      }
      if (write) await fs.writeFile(full, JSON.stringify(data, null, 2) + '\n');
    }
  } finally {
    await browser.close();
  }
  const bad = report.filter((l) => /^[✗?]/.test(l)).length;
  console.log(`\n${bad} entr${bad === 1 ? 'y needs' : 'ies need'} a look.${write ? ` Entries that hold are dated ${today}.` : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
