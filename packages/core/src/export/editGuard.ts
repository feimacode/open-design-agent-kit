/// <reference lib="dom" />
// The edit guard (openspec add-steering-edits): after a steering edit, prove
// that nothing outside its scope changed (markup and pixels), that the scope
// moved in the verb's direction, and that no new finding appeared. Runs from
// check_open_design_artifact when it gets an editId.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { load, type CheerioAPI } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { PNG } from 'pngjs';
import postcss, { type AtRule, type Rule } from 'postcss';
import type { Browser, Page } from 'puppeteer-core';
import type { Finding } from '../poster/preflight';
import type { SteeringVerb } from '../generation/steeringVerbs';

export const GUARD_VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;
export type GuardViewportName = (typeof GUARD_VIEWPORTS)[number]['name'];

/** Pixels whose channels differ by more than this count as changed (anti-aliasing stays below it). */
const CHANNEL_TOLERANCE = 40;
/** A changed area smaller than this many pixels, or this share of the compared area, is noise. */
const MIN_CHANGED_PIXELS = 400;
const MIN_CHANGED_SHARE = 0.002;
/** Full-page captures are cut at this height. */
export const MAX_CAPTURE_HEIGHT = 8000;
/** A crop in the before/after image is cut at this height. */
const MAX_CROP_HEIGHT = 1400;
const MAX_LISTED = 5;

// ── Markup ────────────────────────────────────────────────────────────────

function scopedSelector(selector: string, scopeId: string, scopeOnlyClasses: Set<string>): boolean {
  if (selector.includes(`data-od-id="${scopeId}"`) || selector.includes(`data-od-id='${scopeId}'`) || selector.includes(`data-od-id=${scopeId}`)) return true;
  const classes = [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
  return classes.length > 0 && classes.some((c) => scopeOnlyClasses.has(c));
}

interface CssRuleSig {
  key: string;
  selectors: string[];
}

function cssRules(css: string): CssRuleSig[] {
  let root;
  try {
    root = postcss.parse(css);
  } catch {
    return [{ key: `unparsed:${css.replace(/\s+/g, ' ').trim()}`, selectors: [] }];
  }
  const out: CssRuleSig[] = [];
  root.walk((node) => {
    if (node.type === 'rule') {
      const rule = node as Rule;
      const parents: string[] = [];
      for (let p = rule.parent; p && p.type === 'atrule'; p = p.parent) parents.unshift(`@${(p as AtRule).name} ${(p as AtRule).params}`);
      const decls = rule.nodes
        .filter((n) => n.type === 'decl')
        .map((n) => n.toString().replace(/\s+/g, ' ').trim())
        .join(';');
      out.push({ key: `${parents.join(' ')}|${rule.selector.replace(/\s+/g, ' ').trim()}{${decls}}`, selectors: rule.selectors });
    } else if (node.type === 'atrule' && !(node as AtRule).nodes) {
      out.push({ key: `@${(node as AtRule).name} ${(node as AtRule).params}`, selectors: [] });
    }
  });
  return out;
}

function lines($: CheerioAPI, node: AnyNode, depth: number, out: string[]): void {
  if (node.type === 'text') {
    const text = ('data' in node ? String(node.data) : '').replace(/\s+/g, ' ').trim();
    if (text) out.push(`${'  '.repeat(depth)}"${text}"`);
    return;
  }
  if (node.type !== 'tag' && node.type !== 'script' && node.type !== 'style') return;
  const el = node as Element;
  if (el.tagName === 'style') return;
  const attrs = Object.entries(el.attribs ?? {})
    .filter(([k]) => k !== 'data-od-preview-only')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v.replace(/\s+/g, ' ').trim()}"`)
    .join(' ');
  out.push(`${'  '.repeat(depth)}<${el.tagName}${attrs ? ` ${attrs}` : ''}>`);
  if (el.tagName === 'script') {
    const code = $(el).text().replace(/\s+/g, ' ').trim();
    if (code) out.push(`${'  '.repeat(depth + 1)}${code}`);
    return;
  }
  for (const child of el.children ?? []) lines($, child, depth + 1, out);
}

export interface MarkupComparison {
  /** Human-readable differences outside the scope, at most a few. */
  changes: string[];
  /** The scope element is missing from the edited design. */
  scopeMissing: boolean;
}

/**
 * Compares two versions of a design outside the scope: the scope element is
 * replaced by a placeholder in both, style rules may change only where they
 * match inside the scope (its data-od-id, or a class used only inside it).
 */
export function compareMarkupOutsideScope(before: string, after: string, scopeId: string | undefined): MarkupComparison {
  if (!scopeId) return { changes: [], scopeMissing: false };
  const $b = load(before);
  const $a = load(after);
  const sel = `[data-od-id="${scopeId.replace(/"/g, '\\"')}"]`;
  const scopeMissing = $a(sel).length === 0;
  if (scopeMissing) return { changes: [`The part with data-od-id="${scopeId}" is gone from the design; keep that element and its data-od-id.`], scopeMissing };

  // Classes used outside the scope in either version; a class used only inside it is the scope's own.
  const outsideClasses = new Set<string>();
  const insideClasses = new Set<string>();
  for (const $ of [$b, $a]) {
    $('[class]').each((_, el) => {
      const inside = $(el).closest(sel).length > 0;
      for (const c of ($(el).attr('class') ?? '').split(/\s+/).filter(Boolean)) (inside ? insideClasses : outsideClasses).add(c);
    });
  }
  const scopeOnly = new Set([...insideClasses].filter((c) => !outsideClasses.has(c)));

  const changes: string[] = [];
  const styleOf = ($: CheerioAPI): string =>
    $('style')
      .toArray()
      .map((el) => $(el).text())
      .join('\n');
  const rb = cssRules(styleOf($b));
  const ra = cssRules(styleOf($a));
  const keysB = new Set(rb.map((r) => r.key));
  const keysA = new Set(ra.map((r) => r.key));
  const changedRules = [...ra.filter((r) => !keysB.has(r.key)), ...rb.filter((r) => !keysA.has(r.key))];
  const shared = new Set<string>();
  for (const rule of changedRules) {
    if (rule.selectors.length > 0 && rule.selectors.every((s) => scopedSelector(s, scopeId, scopeOnly))) continue;
    const name = rule.selectors.length > 0 ? rule.selectors.join(', ') : rule.key.slice(0, 60);
    shared.add(name);
  }
  for (const name of [...shared].slice(0, MAX_LISTED)) changes.push(`The CSS rule \`${name}\` changed, and it also styles parts outside the edit. Scope the change with [data-od-id="${scopeId}"] instead.`);

  $b(sel).first().replaceWith('<od-edit-scope></od-edit-scope>');
  $a(sel).first().replaceWith('<od-edit-scope></od-edit-scope>');
  const lb: string[] = [];
  const la: string[] = [];
  for (const child of $b.root().get(0)?.children ?? []) lines($b, child, 0, lb);
  for (const child of $a.root().get(0)?.children ?? []) lines($a, child, 0, la);
  const count = (list: string[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const l of list) m.set(l.trim(), (m.get(l.trim()) ?? 0) + 1);
    return m;
  };
  const cb = count(lb);
  const ca = count(la);
  const added = [...ca].filter(([l, n]) => n > (cb.get(l) ?? 0)).map(([l]) => l);
  const removed = [...cb].filter(([l, n]) => n > (ca.get(l) ?? 0)).map(([l]) => l);
  const short = (l: string): string => (l.length > 90 ? `${l.slice(0, 87)}…` : l);
  for (const l of added.slice(0, MAX_LISTED)) changes.push(`Outside the edit, added or changed: ${short(l)}`);
  for (const l of removed.slice(0, Math.max(0, MAX_LISTED - added.length))) changes.push(`Outside the edit, removed or changed: ${short(l)}`);
  return { changes, scopeMissing };
}

// ── Pixels ────────────────────────────────────────────────────────────────

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Capture {
  png: Buffer;
  /** The scope's box in document coordinates; the whole first screen for a page scope. */
  scope: Box;
  measurements: ScopeMeasurements;
}

function rowsDiffer(a: PNG, ay: number, b: PNG, by: number, width: number): number[] {
  const changed: number[] = [];
  const ao = ay * a.width * 4;
  const bo = by * b.width * 4;
  for (let x = 0; x < width; x++) {
    const i = ao + x * 4;
    const j = bo + x * 4;
    if (Math.abs(a.data[i] - b.data[j]) > CHANNEL_TOLERANCE || Math.abs(a.data[i + 1] - b.data[j + 1]) > CHANNEL_TOLERANCE || Math.abs(a.data[i + 2] - b.data[j + 2]) > CHANNEL_TOLERANCE) changed.push(x);
  }
  return changed;
}

export interface PixelLeak {
  /** Where the change is, in the edited design's document coordinates. */
  box: Box;
  pixels: number;
  where: 'above' | 'below';
}

/**
 * The parts of the page outside the scope that look different: above the
 * scope compared directly, below it compared after shifting by the scope's
 * change in height (a taller part legitimately moves what follows).
 */
export function comparePixelsOutsideScope(before: Capture, after: Capture): PixelLeak[] {
  const b = PNG.sync.read(before.png);
  const a = PNG.sync.read(after.png);
  const width = Math.min(a.width, b.width);
  const leaks: PixelLeak[] = [];
  const scan = (where: 'above' | 'below', bStart: number, aStart: number, rows: number): void => {
    if (rows <= 0) return;
    let pixels = 0;
    let minX = Infinity;
    let maxX = -1;
    let minY = Infinity;
    let maxY = -1;
    for (let r = 0; r < rows; r++) {
      const changed = rowsDiffer(a, aStart + r, b, bStart + r, width);
      if (changed.length === 0) continue;
      pixels += changed.length;
      minX = Math.min(minX, changed[0]);
      maxX = Math.max(maxX, changed[changed.length - 1]);
      minY = Math.min(minY, aStart + r);
      maxY = Math.max(maxY, aStart + r);
    }
    if (pixels >= Math.max(MIN_CHANGED_PIXELS, MIN_CHANGED_SHARE * width * rows)) leaks.push({ where, pixels, box: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } });
  };
  const topB = Math.max(0, Math.floor(before.scope.y));
  const topA = Math.max(0, Math.floor(after.scope.y));
  scan('above', 0, 0, Math.min(topB, topA, a.height, b.height));
  const endB = Math.ceil(before.scope.y + before.scope.height);
  const endA = Math.ceil(after.scope.y + after.scope.height);
  scan('below', endB, endA, Math.min(b.height - endB, a.height - endA));
  return leaks;
}

function cropPng(png: PNG, box: Box): PNG {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.max(1, Math.min(png.width - x, Math.ceil(box.width)));
  const h = Math.max(1, Math.min(png.height - y, Math.ceil(box.height), MAX_CROP_HEIGHT));
  const out = new PNG({ width: w, height: h });
  for (let r = 0; r < h; r++) png.data.copy(out.data, r * w * 4, ((y + r) * png.width + x) * 4, ((y + r) * png.width + x + w) * 4);
  return out;
}

function drawBox(png: PNG, box: Box): void {
  const set = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
    const i = (y * png.width + x) * 4;
    png.data[i] = 230;
    png.data[i + 1] = 30;
    png.data[i + 2] = 60;
    png.data[i + 3] = 255;
  };
  for (let t = 0; t < 3; t++) {
    for (let x = box.x - t; x <= box.x + box.width + t; x++) {
      set(x, box.y - t);
      set(x, box.y + box.height + t);
    }
    for (let y = box.y - t; y <= box.y + box.height + t; y++) {
      set(box.x - t, y);
      set(box.x + box.width + t, y);
    }
  }
}

/** The edited design around a leak, with the changed area outlined. */
export function leakCrop(after: Buffer, leak: PixelLeak): Buffer {
  const png = PNG.sync.read(after);
  const pad = 48;
  const area = { x: 0, y: Math.max(0, leak.box.y - pad), width: png.width, height: Math.min(MAX_CROP_HEIGHT, leak.box.height + pad * 2) };
  const crop = cropPng(png, area);
  drawBox(crop, { x: leak.box.x, y: leak.box.y - area.y, width: leak.box.width, height: Math.min(leak.box.height, crop.height - (leak.box.y - area.y) - 1) });
  return PNG.sync.write(crop);
}

/** The scope's crop from a full-page capture. */
export function scopeCrop(capture: Capture): Buffer {
  const png = PNG.sync.read(capture.png);
  return PNG.sync.write(cropPng(png, { x: 0, y: capture.scope.y, width: png.width, height: Math.max(1, capture.scope.height) }));
}

// ── Measurements ──────────────────────────────────────────────────────────

export interface ScopeMeasurements {
  maxFont: number;
  maxWeight: number;
  accentColors: number;
  /** Share of the scope covered by saturated fills, 0–1. */
  accentArea: number;
  decorative: number;
  /** Mean of the non-zero paddings, margins and gaps. */
  spacing: number;
  distinctSpacing: number;
  distinctFonts: number;
  distinctRadii: number;
  visible: number;
  words: number;
  height: number;
  stateFrames: number;
}

/** Runs in the page: the scope's box and its measurements. Self-contained for page.evaluate. */
export function measureScopeInPage(scopeId: string | null): { box: { x: number; y: number; width: number; height: number }; m: ScopeMeasurements } | null {
  const root = scopeId ? document.querySelector(`[data-od-id="${CSS.escape(scopeId)}"]`) : document.body;
  if (!root) return null;
  const rect = root.getBoundingClientRect();
  const box = scopeId
    ? { x: rect.left + window.scrollX, y: rect.top + window.scrollY, width: rect.width, height: rect.height }
    : { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  const rgb = (value: string): [number, number, number, number] | null => {
    const m = /rgba?\(([^)]+)\)/.exec(value);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const saturated = (c: [number, number, number, number] | null): boolean => {
    if (!c || c[3] < 0.5) return false;
    const [r, g, b] = [c[0] / 255, c[1] / 255, c[2] / 255];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min || l < 0.12 || l > 0.92) return false;
    const s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
    return s > 0.3;
  };
  const all = [root, ...Array.from(root.querySelectorAll('*'))].filter((el) => !['SCRIPT', 'STYLE', 'TEMPLATE'].includes(el.tagName));
  let maxFont = 0;
  let maxWeight = 0;
  let accentArea = 0;
  let decorative = 0;
  let visible = 0;
  const accents = new Set<string>();
  const spacingValues: number[] = [];
  const spacingSet = new Set<number>();
  const fonts = new Set<number>();
  const radii = new Set<number>();
  const scopeArea = Math.max(1, rect.width * rect.height);
  for (const el of all) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    visible++;
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
    if (hasText) {
      const size = parseFloat(style.fontSize);
      maxFont = Math.max(maxFont, size);
      maxWeight = Math.max(maxWeight, parseInt(style.fontWeight, 10) || 400);
      fonts.add(Math.round(size));
      const color = rgb(style.color);
      if (saturated(color)) accents.add(color!.slice(0, 3).map((v) => Math.round(v / 32)).join(','));
    }
    const bg = rgb(style.backgroundColor);
    if (saturated(bg)) {
      accents.add(bg!.slice(0, 3).map((v) => Math.round(v / 32)).join(','));
      accentArea += (r.width * r.height) / scopeArea;
    }
    if (parseFloat(style.borderTopWidth) > 0) {
      const border = rgb(style.borderTopColor);
      if (saturated(border)) accents.add(border!.slice(0, 3).map((v) => Math.round(v / 32)).join(','));
    }
    if (style.boxShadow !== 'none' || style.backgroundImage !== 'none' || (el.tagName === 'svg' && !el.closest('a, button'))) decorative++;
    for (const prop of ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'marginTop', 'marginBottom', 'rowGap', 'columnGap'] as const) {
      const v = parseFloat(style[prop]);
      if (v > 0) {
        spacingValues.push(v);
        spacingSet.add(Math.round(v));
      }
    }
    const radius = parseFloat(style.borderTopLeftRadius);
    if (radius > 0) radii.add(Math.round(radius));
  }
  const text = (root as HTMLElement).innerText ?? root.textContent ?? '';
  return {
    box,
    m: {
      maxFont,
      maxWeight,
      accentColors: accents.size,
      accentArea: Math.min(1, accentArea),
      decorative,
      spacing: spacingValues.length ? spacingValues.reduce((a, b) => a + b, 0) / spacingValues.length : 0,
      distinctSpacing: spacingSet.size,
      distinctFonts: fonts.size,
      distinctRadii: radii.size,
      visible,
      words: text.split(/\s+/).filter(Boolean).length,
      height: rect.height,
      stateFrames: root.querySelectorAll('[data-od-state]').length,
    },
  };
}

const up = (a: number, b: number): boolean => b > a * 1.03 && b - a >= 0.5;
const down = (a: number, b: number): boolean => b < a * 0.97 && a - b >= 0.5;

/** Hover, focus and overflow handling in the source: what polish and harden add without changing the still picture. */
export function hardeningSignals(html: string): number {
  return (html.match(/:hover|:focus-visible|:focus\b|:active|text-overflow|overflow-wrap|word-break|min-width:\s*0|line-clamp|data-od-state\s*=/g) ?? []).length;
}

export interface EffectEvidence {
  before: ScopeMeasurements;
  after: ScopeMeasurements;
  findingsBefore: number;
  findingsAfter: number;
  signalsBefore: number;
  signalsAfter: number;
}

/** Which signals moved in the verb's direction; empty means no measurable effect. */
export function verbEffect(verb: SteeringVerb, e: EffectEvidence): string[] {
  const { before: b, after: a } = e;
  const moved: string[] = [];
  const add = (cond: boolean, what: string): void => {
    if (cond) moved.push(what);
  };
  switch (verb) {
    case 'bolder':
      add(up(b.maxFont, a.maxFont), `largest text ${Math.round(b.maxFont)}→${Math.round(a.maxFont)} px`);
      add(a.maxWeight > b.maxWeight, `heaviest weight ${b.maxWeight}→${a.maxWeight}`);
      add(a.accentArea > b.accentArea + 0.01, 'more of it in the brand colour');
      break;
    case 'quieter':
      add(a.accentColors < b.accentColors, `accent colours ${b.accentColors}→${a.accentColors}`);
      add(down(b.maxFont, a.maxFont), `largest text ${Math.round(b.maxFont)}→${Math.round(a.maxFont)} px`);
      add(a.decorative < b.decorative, `decorative elements ${b.decorative}→${a.decorative}`);
      add(a.accentArea < b.accentArea - 0.01, 'less of it in the brand colour');
      break;
    case 'denser':
      add(down(b.spacing, a.spacing), `mean spacing ${b.spacing.toFixed(1)}→${a.spacing.toFixed(1)} px`);
      add(down(b.height, a.height) && a.visible >= b.visible, `height ${Math.round(b.height)}→${Math.round(a.height)} px with every item kept`);
      break;
    case 'roomier':
      add(up(b.spacing, a.spacing), `mean spacing ${b.spacing.toFixed(1)}→${a.spacing.toFixed(1)} px`);
      break;
    case 'distill':
      add(a.visible < b.visible && a.words <= b.words, `visible elements ${b.visible}→${a.visible}`);
      add(a.words < b.words && a.visible <= b.visible, `words ${b.words}→${a.words}`);
      break;
    case 'polish':
      add(e.findingsAfter < e.findingsBefore, `findings ${e.findingsBefore}→${e.findingsAfter}`);
      add(a.distinctSpacing < b.distinctSpacing, `spacing values ${b.distinctSpacing}→${a.distinctSpacing}`);
      add(a.distinctFonts < b.distinctFonts, `text sizes ${b.distinctFonts}→${a.distinctFonts}`);
      add(a.distinctRadii < b.distinctRadii, `corner radii ${b.distinctRadii}→${a.distinctRadii}`);
      add(e.signalsAfter > e.signalsBefore, 'states added (hover, focus, pressed)');
      break;
    case 'harden':
      add(e.findingsAfter < e.findingsBefore, `findings ${e.findingsBefore}→${e.findingsAfter}`);
      add(a.stateFrames > b.stateFrames, `state frames ${b.stateFrames}→${a.stateFrames}`);
      add(e.signalsAfter > e.signalsBefore, 'long-content and state handling added');
      break;
  }
  return moved;
}

// ── Findings ──────────────────────────────────────────────────────────────

const IGNORED_FOR_REGRESSION = new Set(['stale-sources', 'edit-unchecked', 'edit-out-of-scope', 'edit-no-effect', 'edit-regression']);

function findingKey(f: Finding): string {
  const where = f.selector ?? f.message.replace(/\d+(\.\d+)?/g, '#');
  return `${f.check}|${f.viewport ?? ''}|${f.state ?? ''}|${where}`;
}

/** Findings the edited design has and the snapshot didn't (info notes left out). */
export function newFindings(before: Finding[], after: Finding[]): Finding[] {
  const seen = new Set(before.filter((f) => !IGNORED_FOR_REGRESSION.has(f.check)).map(findingKey));
  return after.filter((f) => f.severity !== 'info' && !IGNORED_FOR_REGRESSION.has(f.check) && !seen.has(findingKey(f)));
}

export function countedFindings(findings: Finding[]): number {
  return findings.filter((f) => f.severity !== 'info' && !IGNORED_FOR_REGRESSION.has(f.check)).length;
}

// ── Capture ───────────────────────────────────────────────────────────────

/** Loads a served page at each guard viewport: a full-page capture (animations off) and the scope's measurements. */
export async function captureForGuard(
  page: Page,
  url: string,
  scopeId: string | undefined,
  load: (page: Page, url: string) => Promise<void>,
): Promise<Map<GuardViewportName, Capture> | string> {
  const out = new Map<GuardViewportName, Capture>();
  for (const viewport of GUARD_VIEWPORTS) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    await load(page, url);
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
    await page.evaluate('window.scrollTo(0, 0)');
    await new Promise((r) => setTimeout(r, 120));
    const measured = (await page.evaluate(measureScopeInPage, scopeId ?? null)) as ReturnType<typeof measureScopeInPage>;
    if (!measured) return `The part with data-od-id="${scopeId}" isn't in the page.`;
    const fullHeight = (await page.evaluate('Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)')) as number;
    const height = Math.min(MAX_CAPTURE_HEIGHT, Math.max(viewport.height, fullHeight));
    const png = Buffer.from(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: viewport.width, height }, captureBeyondViewport: true }));
    out.set(viewport.name, { png, scope: measured.box, measurements: measured.m });
  }
  return out;
}

/** The before/after sheet: the scope at desktop and phone width, old beside new. */
export async function composeEditSheet(
  browser: Browser,
  compose: (browser: Browser, shots: Array<{ label: string; png: Buffer }>) => Promise<Buffer>,
  before: Map<GuardViewportName, Capture>,
  after: Map<GuardViewportName, Capture>,
): Promise<Buffer> {
  const shots: Array<{ label: string; png: Buffer }> = [];
  for (const v of GUARD_VIEWPORTS) {
    const b = before.get(v.name);
    const a = after.get(v.name);
    if (b) shots.push({ label: `before · ${v.name === 'mobile' ? 'phone' : v.name}`, png: scopeCrop(b) });
    if (a) shots.push({ label: `after · ${v.name === 'mobile' ? 'phone' : v.name}`, png: scopeCrop(a) });
  }
  return compose(browser, shots);
}

export async function writeWorkspaceFile(workspaceRoot: string, rel: string, data: Buffer | string): Promise<void> {
  const abs = path.join(workspaceRoot, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
}
