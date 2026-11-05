/// <reference lib="dom" />
// The extraction review page and its fidelity findings (openspec
// connect-brand-design-systems). The page puts the site's screenshot beside a
// fixed sample styled only by the design system's tokens.css, so it follows
// every edit to tokens.css. Checking a page marked `data-od-brand-review`
// measures the sample the way the extraction measured the site and reports
// `brand-fidelity` where the two differ, with both values.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Page } from 'puppeteer-core';
import type { Finding } from '../poster/preflight';
import { parseColor as parseCssColor } from '../generation/colorMix';
import type { BrandComponents } from '../generation/brandKit';
import { COMPONENT_BAND_CSS, componentFidelityFindings, renderComponentBand } from './componentFidelity';

export const BRAND_REVIEW_FILE = 'review.html';
export const BRAND_REVIEW_ATTR = 'data-od-brand-review';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * review.html for a design system folder. `evidence` and `reference` are
 * relative to that folder; `tokens.css` is read from beside it.
 */
export function renderBrandReviewPage(input: { name: string; evidence: string; reference?: string; components?: BrandComponents }): string {
  const name = esc(input.name);
  // Crops are relative to the evidence bundle, which holds evidence.json.
  const band = renderComponentBand(input.components, path.posix.dirname(input.evidence));
  const shot = input.reference
    ? `<img src="${esc(input.reference)}" alt="${name}: the site as measured">`
    : `<p class="none">No site screenshot was kept.</p>`;
  return `<!doctype html>
<html lang="en" ${BRAND_REVIEW_ATTR}="${esc(input.evidence)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}: review</title>
<link rel="stylesheet" href="tokens.css">
<style>
  body { margin: 0; background: #f3f3f1; color: #1a1a1a; font: 15px/1.5 system-ui, sans-serif; }
  .review { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 24px; }
  .review > section { min-width: 0; }
  .review h2.label { font: 600 13px/1.2 system-ui, sans-serif; letter-spacing: 0.04em; text-transform: uppercase; color: #555; margin: 0 0 12px; }
  .site img { display: block; width: 100%; height: 900px; object-fit: cover; object-position: top; border: 1px solid #ddd; }
  .none { color: #666; }
  .ds { background: var(--bg, #fff); color: var(--fg, #111); font-family: var(--font-body, system-ui, sans-serif); font-size: var(--text-base, 16px); line-height: var(--leading-body, 1.5); padding: var(--space-8, 40px) var(--container-gutter-desktop, 32px); border: 1px solid #ddd; min-height: 820px; }
  .ds h1 { font-family: var(--font-display, var(--font-body, inherit)); font-size: var(--text-4xl, 44px); line-height: var(--leading-display, 1.1); letter-spacing: var(--tracking-display, normal); margin: 0 0 var(--space-4, 16px); }
  .ds h3 { font-family: var(--font-display, inherit); font-size: var(--text-lg, 20px); margin: 0 0 var(--space-2, 8px); }
  .ds p { margin: 0 0 var(--space-5, 24px); }
  .ds .muted { color: var(--muted, #666); }
  .ds .actions { display: flex; gap: var(--space-3, 12px); flex-wrap: wrap; margin-bottom: var(--space-8, 40px); }
  .ds .btn { display: inline-flex; align-items: center; font: inherit; font-weight: 600; text-decoration: none; padding: var(--space-3, 12px) var(--space-5, 24px); border-radius: var(--radius-sm, 6px); border: 1px solid transparent; cursor: pointer; }
  .ds .primary { background: var(--accent, #222); color: var(--accent-on, #fff); }
  .ds .primary:hover { background: var(--accent-hover, var(--accent, #222)); }
  .ds .secondary { background: transparent; color: var(--fg, #111); border-color: var(--border, #ccc); }
  .ds .card { background: var(--surface, #fafafa); border: 1px solid var(--border-soft, var(--border, #e5e5e5)); border-radius: var(--radius-md, 10px); box-shadow: var(--elev-raised, none); padding: var(--space-6, 28px); margin-bottom: var(--space-8, 40px); }
  .ds form { display: flex; gap: var(--space-3, 12px); align-items: end; flex-wrap: wrap; }
  .ds label { display: grid; gap: var(--space-2, 8px); font-size: var(--text-sm, 14px); color: var(--fg-2, var(--fg, #111)); }
  .ds input { font: inherit; padding: var(--space-3, 12px); border: 1px solid var(--border, #ccc); border-radius: var(--radius-sm, 6px); background: var(--bg, #fff); color: var(--fg, #111); min-width: 220px; }
  .ds input:focus-visible { outline: none; box-shadow: var(--focus-ring, 0 0 0 3px rgba(0,0,0,.2)); }
  @media (max-width: 900px) { .review { grid-template-columns: 1fr; } .site img { height: auto; } }${band ? COMPONENT_BAND_CSS : ''}
</style>
</head>
<body>
<main class="review">
  <section class="site">
    <h2 class="label">The site</h2>
    ${shot}
  </section>
  <section>
    <h2 class="label">The design system</h2>
    <div class="ds" data-od-sample="page">
      <h1 data-od-sample="heading">${name}, in its own words</h1>
      <p data-od-sample="body">A sample written only with this design system's tokens, to compare with the site on the left.</p>
      <div class="actions">
        <a class="btn primary" href="#" data-od-sample="button">Get started</a>
        <a class="btn secondary" href="#">Learn more</a>
      </div>
      <div class="card" data-od-sample="card">
        <h3>A card</h3>
        <p class="muted">Muted supporting text on the surface colour, with the card radius and shadow.</p>
      </div>
      <form onsubmit="return false">
        <label>Email<input type="email" placeholder="you@example.com" data-od-sample="input"></label>
        <button class="btn primary" type="submit">Subscribe</button>
      </form>
    </div>
  </section>
  ${band}
</main>
</body>
</html>
`;
}

/** What the review's sample measures, the same way the extraction measured the site. */
export interface SampleMeasure {
  bg?: string;
  fg?: string;
  accent?: string;
  headingFont?: string;
  bodyFont?: string;
  buttonRadius?: number;
  buttonHeight?: number;
  cardRadius?: number;
  inputRadius?: number;
}

/** In-page: measures the review sample. Self-contained, for page.evaluate. */
export function measureBrandSample(): SampleMeasure {
  const q = (role: string): Element | null => document.querySelector(`[data-od-sample="${role}"]`);
  const cs = (el: Element | null): CSSStyleDeclaration | undefined => (el ? getComputedStyle(el) : undefined);
  const family = (s: CSSStyleDeclaration | undefined): string | undefined => s?.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
  const px = (v: string | undefined): number | undefined => (v ? Number.parseFloat(v) : undefined);
  const page = cs(q('page'));
  const button = q('button');
  return {
    bg: page?.backgroundColor,
    fg: cs(q('body'))?.color,
    accent: cs(button)?.backgroundColor,
    headingFont: family(cs(q('heading'))),
    bodyFont: family(cs(q('body'))),
    buttonRadius: px(cs(button)?.borderTopLeftRadius),
    buttonHeight: button ? Math.round(button.getBoundingClientRect().height) : undefined,
    cardRadius: px(cs(q('card'))?.borderTopLeftRadius),
    inputRadius: px(cs(q('input'))?.borderTopLeftRadius),
  };
}

interface EvidenceFile {
  pages?: Array<{
    roles?: Record<string, { value?: string }>;
    textRoles?: Array<{ role: string; fontFamily: string }>;
    radii?: Array<{ px: number; count: number; kind: string }>;
  }>;
  /** From the brand-kit capture (add-brand-kit-capture), when present. */
  components?: { button?: { primary?: { height?: number; radius?: number } }; card?: { radius?: number }; input?: { radius?: number } };
}

/** The site's values the sample should match, from evidence.json. */
export function expectedFromEvidence(ev: EvidenceFile): SampleMeasure {
  const p = ev.pages?.[0];
  const role = (r: string): string | undefined => p?.roles?.[r]?.value;
  const text = (r: string): string | undefined => p?.textRoles?.find((t) => t.role === r)?.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
  const radius = (kind: string): number | undefined =>
    p?.radii
      ?.filter((r) => r.kind === kind)
      .sort((a, b) => b.count - a.count)[0]?.px;
  return {
    bg: role('bg'),
    fg: role('fg'),
    accent: role('accent'),
    headingFont: text('h1') ?? text('h2'),
    bodyFont: text('body'),
    buttonRadius: ev.components?.button?.primary?.radius ?? radius('button'),
    buttonHeight: ev.components?.button?.primary?.height,
    cardRadius: ev.components?.card?.radius ?? radius('card'),
    inputRadius: ev.components?.input?.radius ?? radius('input'),
  };
}

function rgb(value: string | undefined): number[] | undefined {
  if (!value) return undefined;
  const h = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (h) return [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16));
  const m = /rgba?\(([^)]+)\)/.exec(value);
  if (!m) {
    const c = parseCssColor(value.trim());
    if (!c || c.a < 0.5) return undefined;
    return [c.r, c.g, c.b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
  }
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length > 3 && parts[3] < 0.5) return undefined;
  return parts.slice(0, 3);
}
const hex = (c: number[]): string => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
function deltaE(a: number[], b: number[]): number {
  const lab = (c: number[]): number[] => {
    const lin = c.map((v) => {
      const x = v / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    const X = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
    const Y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
    const Z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** brand-fidelity findings: each place the sample differs from the site, with both values. Pure. */
export function compareBrandSample(site: SampleMeasure, sample: SampleMeasure): Finding[] {
  const out: Finding[] = [];
  const add = (what: string, siteValue: string, sampleValue: string, fix: string, selector?: string) =>
    out.push({ check: 'brand-fidelity', severity: 'warning', message: `${what}: the site has ${siteValue}, the design system gives ${sampleValue}. ${fix}`, selector });
  const colours: Array<[keyof SampleMeasure, string, string]> = [
    ['accent', 'Primary button colour', '--accent'],
    ['fg', 'Text colour', '--fg'],
    ['bg', 'Page background', '--bg'],
  ];
  for (const [key, label, token] of colours) {
    const a = rgb(site[key] as string | undefined);
    const b = rgb(sample[key] as string | undefined);
    if (a && b && deltaE(a, b) > 3) add(label, hex(a), hex(b), `Set ${token} to ${hex(a)}.`, token);
  }
  const fonts: Array<[keyof SampleMeasure, string, string]> = [
    ['headingFont', 'Heading font', '--font-display'],
    ['bodyFont', 'Body font', '--font-body'],
  ];
  for (const [key, label, token] of fonts) {
    const a = site[key] as string | undefined;
    const b = sample[key] as string | undefined;
    if (a && b && a.toLowerCase() !== b.toLowerCase()) add(label, a, b, `Put ${a} first in ${token} (load it, or name a free match if it isn't available).`, token);
  }
  const radii: Array<[keyof SampleMeasure, string, string]> = [
    ['buttonRadius', 'Button radius', '--radius-sm'],
    ['cardRadius', 'Card radius', '--radius-md'],
  ];
  const pill = (n: number): number => (n >= 999 ? 999 : n);
  for (const [key, label, token] of radii) {
    const a = site[key] as number | undefined;
    const b = sample[key] as number | undefined;
    if (a === undefined || b === undefined) continue;
    if (Math.abs(pill(a) - pill(b)) > 2 && !(a >= 100 && b >= 100)) add(label, `${pill(a)}px`, `${pill(b)}px`, `Set ${token} to ${a >= 999 ? 'var(--radius-pill)' : `${a}px`}.`, token);
  }
  if (site.buttonHeight !== undefined && sample.buttonHeight !== undefined && Math.abs(site.buttonHeight - sample.buttonHeight) > 4) {
    add('Button height', `${site.buttonHeight}px`, `${sample.buttonHeight}px`, 'Say the button height in DESIGN.md, and adjust the spacing tokens if the padding differs.');
  }
  return out;
}

/** The fidelity pass for a page marked data-od-brand-review: reads its evidence and compares. Undefined when the page isn't a review. */
export async function brandReviewFindings(page: Page, workspaceRoot: string, entryPath: string, html: string, warnings: string[]): Promise<Finding[]> {
  const m = new RegExp(`${BRAND_REVIEW_ATTR}\\s*=\\s*"([^"]+)"`).exec(html);
  if (!m) return [];
  const file = path.resolve(workspaceRoot, path.dirname(entryPath), m[1]);
  if (!file.startsWith(path.resolve(workspaceRoot) + path.sep)) return [];
  let ev: EvidenceFile;
  try {
    ev = JSON.parse(await fs.readFile(file, 'utf8')) as EvidenceFile;
  } catch {
    warnings.push(`The review names ${m[1]} as its evidence, which couldn't be read, so the brand fidelity wasn't compared.`);
    return [];
  }
  const sample = (await page.evaluate(measureBrandSample)) as SampleMeasure;
  const findings = compareBrandSample(expectedFromEvidence(ev), sample);
  // Components rebuilt from the tokens, against the site's crops (openspec add-component-restyle-review).
  if (html.includes('id="od-components"')) findings.push(...(await componentFidelityFindings(page, path.dirname(file), warnings)));
  return findings;
}
