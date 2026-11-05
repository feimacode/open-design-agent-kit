// Audits a live website with the kit's own checks (openspec add-site-audit):
// the browser passes that read only the DOM and computed styles (contrast,
// layout overflow, taste rules, tap targets, sideways scroll, 320 px reflow,
// large text, the first phone screen), plus three that only make sense for a
// page the kit didn't make (page weight, viewport meta, image alt text).
// Checks that need kit markup (states, flows, sample data, tokens) never run.
//
// Writes <outputDir>/.audits/<site>/: audit.json (every finding), desktop and
// phone screenshots, crops of the top finding groups and index.html, a short
// report for a business owner. The report never shows a score it didn't
// compute and says what it doesn't measure.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { CDPSession, HTTPRequest, HTTPResponse, Page } from 'puppeteer-core';
import { PNG } from 'pngjs';
import { findBrowser } from './browserDiscovery';
import {
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  blockedReason,
  gotoPage,
  hideConsentBanners,
  launchLiveBrowser,
  liveSlug,
  readPageSignals,
  validateLiveUrls,
  type LiveBrowser,
  type PageSignals,
} from './livePage';
import { collectHorizontalScroll, collectTapTargets } from '../poster/pageScripts';
import { runPreflight, type Finding } from '../poster/preflight';
import { LARGE_TEXT_ROOT_PX, SCREEN_ECONOMY_SCRIPT } from './screenChecks';
import { TASTE_CALIBRATION, applyTasteCalibration, calibrationLine } from './tasteCalibration';

export const AUDITS_DIR = '.audits';
const CARD_SELECTOR = '[data-od-card]';
const PHONE_MAX_WIDTH = 480;
const REFLOW_WIDTH = 320;
const REFLOW_HEIGHT = 800;
/** Page weight budgets for the phone load. */
export const PAGE_WEIGHT_BUDGET_BYTES = 2 * 1024 * 1024;
export const REQUEST_BUDGET = 80;
/** The report shows at most this many finding groups. */
export const TOP_GROUPS = 5;
/** Full-page screenshots are cut at this height (CSS px) so crops stay cheap. */
const MAX_SHOT_HEIGHT = 8000;

/** Preflight checks that read only the DOM and computed styles. type-scale and emoji need the kit's tokens or rules, so they stay off. */
export const LIVE_PREFLIGHT_CHECKS: ReadonlySet<string> = new Set(['contrast', 'overflow', 'overlap', 'slop-glow', 'card-row', 'uniform-surface', 'intent']);

/** Every check the audit can report, for the report's "what was checked" list. */
export const AUDIT_CHECKS: ReadonlyArray<{ check: string; label: string }> = [
  { check: 'missing-viewport', label: 'Phone layout switched on (viewport meta tag)' },
  { check: 'horizontal-scroll', label: 'No sideways scrolling on a phone' },
  { check: 'reflow', label: 'Readable at 320 px wide (WCAG reflow)' },
  { check: 'screen-economy', label: 'Something to tap on the first phone screen' },
  { check: 'contrast', label: 'Text contrast (WCAG AA)' },
  { check: 'tap-target', label: 'Tap targets big enough for a finger' },
  { check: 'large-text-overflow', label: 'Layout holds with larger text' },
  { check: 'overflow', label: 'Text that runs out of its box' },
  { check: 'overlap', label: 'Text covered by other elements' },
  { check: 'broken-asset', label: 'Images, styles and scripts that fail to load' },
  { check: 'missing-alt', label: 'Images without a text alternative' },
  { check: 'page-weight', label: 'Download size and request count on a phone' },
  { check: 'slop-glow', label: 'Stock indigo glows and gradients' },
  { check: 'card-row', label: 'Rows of identical cards' },
  { check: 'uniform-surface', label: 'Every card the same' },
  { check: 'intent', label: 'Destructive and primary actions look like what they do' },
  { check: 'template-look', label: 'Template look: two or more of the three above on one page' },
];

/** What the audit never measures; printed in every report. */
export const NOT_MEASURED = [
  'Search ranking and SEO',
  'Real visitors’ loading speed (only download size and request count are measured)',
  'Conversion, analytics or how people actually use the site',
  'Pages behind a login, forms and checkout',
  'Screen reader behaviour and keyboard order beyond what the checks above read',
];

interface CheckCopy {
  title: string;
  cost: string;
  fix: string;
  weight: number;
}

/** Plain-language copy and impact weight per check. */
const COPY: Record<string, CheckCopy> = {
  'missing-viewport': {
    title: 'Phones show the desktop site, shrunk',
    cost: 'Without a viewport tag, phones render the page at desktop width and zoom out, so visitors pinch and zoom to read anything.',
    fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> and make the layout responsive.',
    weight: 10,
  },
  'horizontal-scroll': {
    title: 'The page scrolls sideways on a phone',
    cost: 'Content wider than the screen makes the page wobble sideways and hides part of it.',
    fix: 'Find the element wider than the screen (often a fixed-width image, table or row) and let it shrink or wrap.',
    weight: 9,
  },
  'screen-economy': {
    title: 'Nothing to tap on the first phone screen',
    cost: 'Visitors on a phone see no button or link until they scroll, so the main action (call, book, buy) is easy to miss.',
    fix: 'Put the main action in the first screen on phones, above any large image.',
    weight: 8,
  },
  reflow: {
    title: 'The page breaks at small widths',
    cost: 'People who zoom in, or use small phones, get sideways scrolling or cut-off text (WCAG 1.4.10).',
    fix: 'Let rows wrap and remove fixed widths so the page works at 320 px wide.',
    weight: 7,
  },
  contrast: {
    title: 'Text that is hard to read',
    cost: 'Low-contrast text is hard to read in sunlight and for people with weaker eyesight, and it fails WCAG AA.',
    fix: 'Darken the text or lighten its background until body text reaches 4.5:1 and large text 3:1.',
    weight: 6,
  },
  'tap-target': {
    title: 'Buttons and links too small to tap',
    cost: 'Small or crowded targets cause mis-taps on phones, so visitors open the wrong page or give up.',
    fix: 'Make tap targets at least 24 px, ideally 44 px, with space between them.',
    weight: 6,
  },
  'broken-asset': {
    title: 'Files that fail to load',
    cost: 'Missing images, styles or scripts leave gaps and broken features, and make the business look neglected.',
    fix: 'Fix or remove the broken links to these files.',
    weight: 5,
  },
  'page-weight': {
    title: 'Heavy page on a phone',
    cost: 'A large download is slow on mobile data and costs visitors data; many leave before it finishes.',
    fix: 'Compress and resize images, load below-the-fold images lazily, and drop unused scripts.',
    weight: 5,
  },
  'large-text-overflow': {
    title: 'The layout breaks with larger text',
    cost: 'Visitors who set a larger text size see text cut off or overlapping.',
    fix: 'Let boxes grow with their text: no fixed heights on text, no fixed widths on labels.',
    weight: 4,
  },
  'missing-alt': {
    title: 'Images without a description',
    cost: 'Screen readers skip or read out file names, and search engines can’t tell what the images show.',
    fix: 'Give each meaningful image a short alt text, and decorative ones alt="".',
    weight: 4,
  },
  overflow: {
    title: 'Text that runs out of its box',
    cost: 'Clipped or spilling text looks broken and can hide information.',
    fix: 'Let the box grow or the text wrap.',
    weight: 4,
  },
  overlap: {
    title: 'Text covered by other elements',
    cost: 'Overlapping elements hide text and make the page look broken.',
    fix: 'Give overlapping elements their own space in the layout.',
    weight: 3,
  },
  intent: {
    title: 'Actions that don’t look like what they do',
    cost: 'When the main action looks like the others, or a destructive one looks harmless, visitors hesitate or make mistakes.',
    fix: 'Make the main action the one filled button, and style destructive actions as danger.',
    weight: 2,
  },
  'slop-glow': {
    title: 'Stock indigo glows and gradients',
    cost: 'Stock indigo glows and gradients make the site look like every other template, not like this business.',
    fix: 'Use the brand’s own colours for accents and backgrounds.',
    weight: 1,
  },
  'card-row': {
    title: 'Rows of identical cards',
    cost: 'Three or four identical icon cards read as filler and bury the point.',
    fix: 'Lead with one clear message, and vary or cut the cards.',
    weight: 1,
  },
  'uniform-surface': {
    title: 'Every surface looks the same',
    cost: 'When every card has the same radius and shadow, nothing stands out.',
    fix: 'Give the most important block a different weight from the rest.',
    weight: 1,
  },
  // Only with two or more different tells on one page (openspec calibrate-site-audit-taste-checks).
  'template-look': {
    title: 'Looks like a stock template',
    cost: 'Several stock patterns together make the page look like many others built from the same starting point, not like this business.',
    fix: 'Keep one of the patterns at most, and build the rest from the brand’s own colours, layout and content.',
    weight: 2,
  },
};

export type AuditViewport = 'desktop' | 'phone' | `${number}px`;
export type AuditRegion = 'header' | 'main' | 'footer' | 'page';

export interface AuditRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AuditFinding {
  check: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  selector?: string;
  page: string;
  viewport: AuditViewport;
  region: AuditRegion;
  aboveFold: boolean;
  /** Document coordinates of the element in its viewport's screenshot. */
  rect?: AuditRect;
}

export interface AuditGroup {
  id: string;
  check: string;
  page: string;
  region: AuditRegion;
  viewport: AuditViewport;
  severity: 'error' | 'warning' | 'info';
  count: number;
  score: number;
  title: string;
  cost: string;
  fix: string;
  /** One developer-facing detail, from the first finding. */
  detail: string;
  examples: string[];
  /** Workspace-relative crop with the first element marked. */
  crop?: string;
}

export interface AuditBlockedPage {
  url: string;
  reason: string;
  screenshot?: string;
}

/** One audited page's screenshots, workspace-relative. */
export interface AuditPageShots {
  page: string;
  desktop: string;
  phone: string;
  desktopFull: string;
  phoneFull: string;
}

export interface AuditPageWeight {
  page: string;
  bytes: number;
  requests: number;
}

export interface AuditSiteInput {
  url: string;
  extraUrls?: string[];
  workspaceRoot: string;
  outputDir: string;
  executablePath?: string;
  browserPath?: string;
  resolveHost?: (host: string) => Promise<string[]>;
  /** Hosts exempt from the private-address rules. Tests and the eval runner only. */
  allowHostsForTesting?: string[];
}

export type AuditSiteResult =
  | { status: 'invalid-args'; error: string }
  | { status: 'no-browser'; error: string }
  | {
      status: 'ok' | 'partial' | 'blocked';
      slug: string;
      auditDir: string;
      report: string;
      capturedAt: string;
      pages: string[];
      groups: AuditGroup[];
      findings: AuditFinding[];
      screenshots: string[];
      blocked: AuditBlockedPage[];
      pageWeight: AuditPageWeight[];
      notes: string[];
    };

// ── In-page helpers (serialized into the page) ───────────────────────────

/** Viewport meta, images missing alt, and the first-screen actions. Self-contained. */
function readLivePageFacts(): { viewportMeta: boolean; missingAlt: Array<{ name: string }> } {
  const meta = document.querySelector('meta[name="viewport" i]');
  const viewportMeta = !!meta && /width\s*=\s*device-width/i.test(meta.getAttribute('content') || '');
  const missingAlt: Array<{ name: string }> = [];
  const imgs = Array.prototype.slice.call(document.querySelectorAll('img')) as HTMLImageElement[];
  for (const img of imgs) {
    if (img.hasAttribute('alt') || img.closest('[aria-hidden="true"]') || img.getAttribute('role') === 'presentation') continue;
    const r = img.getBoundingClientRect();
    if (r.width < 48 || r.height < 48) continue;
    const src = (img.currentSrc || img.src || '').split('/').pop() || '';
    let name = 'img';
    if (img.id) name += '#' + img.id;
    else if (img.classList.length > 0) name += '.' + img.classList[0];
    missingAlt.push({ name: name + (src ? ' (' + src.slice(0, 60) + ')' : '') });
    if (missingAlt.length >= 40) break;
  }
  return { viewportMeta, missingAlt };
}

/** Finds the elements the findings name (`tag#id "text"` or `tag.class "text"`), returning rects in document coordinates. Self-contained. */
export function locateDescribed(descriptions: string[]): Array<{ rect?: { x: number; y: number; width: number; height: number }; region: 'header' | 'main' | 'footer' | 'page'; aboveFold: boolean }> {
  const fold = window.innerHeight;
  return descriptions.map((d) => {
    const m = /^([a-z][a-z0-9-]*)(#[^\s"(]+|\.[^\s"(]+)?(?:\s+\(.*\))?(?:\s+"(.*)")?/i.exec(String(d || '').trim());
    if (!m) return { region: 'page' as const, aboveFold: false };
    const tag = m[1].toLowerCase();
    const hook = m[2] || '';
    const text = (m[3] || '').replace(/…$/, '');
    let sel = tag;
    try {
      if (hook.startsWith('#')) sel += '#' + CSS.escape(hook.slice(1));
      else if (hook.startsWith('.')) sel += '.' + CSS.escape(hook.slice(1));
    } catch {
      sel = tag;
    }
    let els: Element[] = [];
    try {
      els = Array.prototype.slice.call(document.querySelectorAll(sel));
    } catch {
      els = [];
    }
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
    const match = els.find((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      if (!text) return true;
      const own = norm((el as HTMLElement).innerText || el.textContent || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '');
      return own.startsWith(text);
    });
    if (!match) return { region: 'page' as const, aboveFold: false };
    const r = match.getBoundingClientRect();
    const top = r.top + window.scrollY;
    const region = match.closest('footer, [role="contentinfo"]') ? 'footer' : match.closest('header, nav, [role="banner"], [role="navigation"]') ? 'header' : 'main';
    return {
      rect: { x: Math.max(0, r.left + window.scrollX), y: Math.max(0, top), width: r.width, height: r.height },
      region: region as 'header' | 'main' | 'footer',
      aboveFold: top < fold,
    };
  });
}

// ── Node side ────────────────────────────────────────────────────────────

interface NetworkTally {
  bytes: number;
  requests: number;
  broken: Array<{ url: string; status: string }>;
  reset(): void;
}

async function watchNetwork(page: Page, siteHost: string): Promise<{ tally: NetworkTally; client: CDPSession }> {
  const tally: NetworkTally = {
    bytes: 0,
    requests: 0,
    broken: [],
    reset() {
      this.bytes = 0;
      this.requests = 0;
      this.broken = [];
    },
  };
  const client = await page.createCDPSession();
  await client.send('Network.enable');
  client.on('Network.requestWillBeSent', () => {
    tally.requests++;
  });
  client.on('Network.loadingFinished', (e: { encodedDataLength?: number }) => {
    tally.bytes += e.encodedDataLength ?? 0;
  });
  page.on('response', (res: HTTPResponse) => {
    const req = res.request();
    if (req.isNavigationRequest() || res.status() < 400) return;
    if (!['image', 'stylesheet', 'script', 'font', 'media'].includes(req.resourceType())) return;
    tally.broken.push({ url: res.url(), status: String(res.status()) });
  });
  page.on('requestfailed', (req: HTTPRequest) => {
    const reason = req.failure()?.errorText ?? '';
    if (/blockedbyclient|aborted/i.test(reason) || req.isNavigationRequest()) return;
    if (!['image', 'stylesheet', 'script', 'font', 'media'].includes(req.resourceType())) return;
    let host = '';
    try {
      host = new URL(req.url()).hostname;
    } catch {
      return;
    }
    // Third-party trackers that fail are not the site's problem.
    if (host !== siteHost && !host.endsWith(`.${siteHost.replace(/^www\./, '')}`)) return;
    tally.broken.push({ url: req.url(), status: reason || 'failed' });
  });
  return { tally, client };
}

async function settle(page: Page, ms = 150): Promise<void> {
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))').catch(() => undefined);
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

async function fullShot(page: Page, file: string): Promise<{ width: number; height: number }> {
  const size = (await page.evaluate('({ w: document.documentElement.clientWidth, h: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0) })')) as { w: number; h: number };
  const height = Math.max(1, Math.min(size.h, MAX_SHOT_HEIGHT));
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: size.w, height }, captureBeyondViewport: true });
  return { width: size.w, height };
}

const liveOnly = (findings: Finding[]): Finding[] =>
  findings.filter((f) => LIVE_PREFLIGHT_CHECKS.has(f.check) && !(f.check === 'overflow' && / (extends outside|runs past the edge of) the card/.test(f.message)));

/** Crops a marked region out of a PNG, with a 2 px red outline round the element. */
export function cropMarked(png: Buffer, rect: AuditRect, scale = 1, pad = 24, maxWidth = 900, maxHeight = 520): Buffer {
  const src = PNG.sync.read(png);
  const rx = Math.round(rect.x * scale);
  const ry = Math.round(rect.y * scale);
  const rw = Math.max(1, Math.round(rect.width * scale));
  const rh = Math.max(1, Math.round(rect.height * scale));
  const w = Math.min(src.width, Math.min(maxWidth, rw + pad * 2));
  const h = Math.min(src.height, Math.min(maxHeight, rh + pad * 2));
  const x0 = Math.max(0, Math.min(src.width - w, rx - Math.max(pad, Math.round((w - rw) / 2))));
  const y0 = Math.max(0, Math.min(src.height - h, ry - Math.max(pad, Math.round((h - rh) / 2))));
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(src, out, x0, y0, w, h, 0, 0);
  const mark = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    out.data[i] = 220;
    out.data[i + 1] = 38;
    out.data[i + 2] = 38;
    out.data[i + 3] = 255;
  };
  const left = rx - x0 - 3;
  const top = ry - y0 - 3;
  const right = rx - x0 + rw + 2;
  const bottom = ry - y0 + rh + 2;
  for (let t = 0; t < 2; t++) {
    for (let x = left; x <= right; x++) {
      mark(x, top + t);
      mark(x, bottom - t);
    }
    for (let y = top; y <= bottom; y++) {
      mark(left + t, y);
      mark(right - t, y);
    }
  }
  return PNG.sync.write(out);
}

/** Groups findings by check, page and region, and ranks the groups by what they cost a visitor. */
export function groupFindings(findings: AuditFinding[]): AuditGroup[] {
  const groups = new Map<string, AuditFinding[]>();
  for (const f of findings) {
    const key = `${f.check}|${f.page}|${f.region}`;
    const list = groups.get(key);
    if (list) list.push(f);
    else groups.set(key, [f]);
  }
  const ranked: AuditGroup[] = [];
  for (const list of groups.values()) {
    const first = list.find((f) => f.rect) ?? list[0];
    const copy = COPY[first.check] ?? { title: first.check, cost: '', fix: '', weight: 1 };
    const severity = list.some((f) => f.severity === 'error') ? 'error' : list.some((f) => f.severity === 'warning') ? 'warning' : 'info';
    const aboveFold = list.some((f) => f.aboveFold);
    const phoneOnly = list.every((f) => f.viewport !== 'desktop');
    const distinct = new Set(list.map((f) => f.selector ?? f.message)).size;
    const score =
      copy.weight *
      (1 + Math.log10(distinct)) *
      (severity === 'error' ? 1.3 : 1) *
      (aboveFold ? 1.5 : 1) *
      (first.region === 'footer' ? 0.5 : 1) *
      (phoneOnly && first.region !== 'page' ? 1.1 : 1);
    ranked.push({
      id: '',
      check: first.check,
      page: first.page,
      region: first.region,
      viewport: first.viewport,
      severity,
      count: distinct,
      score: Math.round(score * 100) / 100,
      title: copy.title,
      cost: copy.cost,
      fix: copy.fix,
      detail: first.message,
      examples: [...new Set(list.map((f) => f.selector).filter((s): s is string => !!s))].slice(0, 3),
    });
  }
  ranked.sort((a, b) => b.score - a.score || b.count - a.count);
  ranked.forEach((g, i) => (g.id = `F${i + 1}`));
  return ranked;
}

/** Runs the audit. Never throws for a site problem; reports it. */
export const MISSING_VIEWPORT_MESSAGE = 'The page has no <meta name="viewport" content="width=device-width">, so phones render it at desktop width and zoom out.';

/** The desktop pass on a loaded page: the preflight checks that need no kit markup. */
export async function desktopPasses(page: Page): Promise<Finding[]> {
  return liveOnly(await runPreflight(page, { cardSelector: CARD_SELECTOR }));
}

/**
 * The phone passes on a page loaded at the phone size: image alt text, the
 * preflight, sideways scroll, tap targets, the first screen and larger text.
 * Shared by the audit and the before/after re-check, so both measure the same way.
 */
export async function phonePasses(page: Page): Promise<{ viewportMeta: boolean; phone: Finding[]; scrollsSideways: boolean }> {
  const phone: Finding[] = [];
  const facts = (await page.evaluate(readLivePageFacts)) as ReturnType<typeof readLivePageFacts>;
  phone.push(...facts.missingAlt.map((m) => ({ check: 'missing-alt', severity: 'warning' as const, message: `${m.name} has no alt attribute.`, selector: m.name.replace(/ \(.*\)$/, '') })));
  const phonePreflight = liveOnly(await runPreflight(page, { cardSelector: CARD_SELECTOR }));
  phone.push(...phonePreflight);
  const sideways = (await page.evaluate(collectHorizontalScroll, PHONE_MAX_WIDTH)) as Finding[];
  phone.push(...sideways);
  phone.push(...((await page.evaluate(collectTapTargets)) as Finding[]));
  const economy = (await page.evaluate(SCREEN_ECONOMY_SCRIPT)) as { exempt: boolean; actions: number };
  if (!economy.exempt && economy.actions === 0) {
    phone.push({ check: 'screen-economy', severity: 'warning', message: `The first phone screen (${MOBILE_VIEWPORT.width}×${MOBILE_VIEWPORT.height}) has no button, link or field; visitors have to scroll to do anything.` });
  }

  // Larger text on the phone: only layout problems it newly causes.
  const key = (f: Finding) => f.selector ?? f.message;
  const isLayout = (f: Finding) => f.check === 'overflow' || f.check === 'overlap';
  const before = new Set(phonePreflight.filter(isLayout).map(key));
  await page.evaluate(`document.documentElement.setAttribute('data-od-large-text', document.documentElement.style.fontSize || ''); document.documentElement.style.fontSize = '${LARGE_TEXT_ROOT_PX}px'`);
  await settle(page);
  const larger = (await runPreflight(page, { cardSelector: CARD_SELECTOR })).filter((f) => isLayout(f) && !before.has(key(f)) && !/ (extends outside|runs past the edge of) the card/.test(f.message));
  phone.push(...larger.map((f) => ({ ...f, check: 'large-text-overflow', severity: 'warning' as const, message: `With the reader's text size at ${LARGE_TEXT_ROOT_PX} px: ${f.message}` })));
  await page.evaluate("const r = document.documentElement; r.style.fontSize = r.getAttribute('data-od-large-text') || ''; r.removeAttribute('data-od-large-text')");

  return { viewportMeta: facts.viewportMeta, phone, scrollsSideways: sideways.some((f) => f.severity === 'error') };
}

/** Reflow at 320 px wide (WCAG 1.4.10). Leaves the viewport at 320 px. */
export async function reflowPass(page: Page): Promise<Finding[]> {
  await page.setViewport({ width: REFLOW_WIDTH, height: REFLOW_HEIGHT, hasTouch: true, deviceScaleFactor: 1 });
  await settle(page);
  const narrow = (await page.evaluate(collectHorizontalScroll, PHONE_MAX_WIDTH)) as Finding[];
  return narrow.map((f) => ({ ...f, check: 'reflow', severity: 'error' as const, message: `At ${REFLOW_WIDTH}px wide: ${f.message}` }));
}

export async function auditSite(input: AuditSiteInput): Promise<AuditSiteResult> {
  const valid = await validateLiveUrls(input.url, input.extraUrls ?? [], input.resolveHost, input.allowHostsForTesting);
  if (!valid.ok) return { status: 'invalid-args', error: valid.error };
  const browserPath = input.executablePath ?? (await findBrowser({ explicitPath: input.browserPath }).then((r) => (r.ok ? r.executablePath : undefined)));
  if (!browserPath) return { status: 'no-browser', error: 'No Chrome, Edge or Chromium browser was found, so the site can’t be audited. Install one or set OPEN_DESIGN_BROWSER_PATH.' };

  const [main] = valid.urls;
  const slug = liveSlug(main);
  const auditRel = path.posix.join(input.outputDir, AUDITS_DIR, slug);
  const auditDir = path.join(input.workspaceRoot, auditRel);
  await fs.rm(auditDir, { recursive: true, force: true });
  await fs.mkdir(path.join(auditDir, 'crops'), { recursive: true });
  const rel = (file: string): string => path.posix.join(auditRel, file);
  const capturedAt = new Date().toISOString();

  const findings: AuditFinding[] = [];
  const screenshots: string[] = [];
  const blocked: AuditBlockedPage[] = [];
  const pageWeight: AuditPageWeight[] = [];
  const notes: string[] = [];
  const audited: string[] = [];
  const pageShots: AuditPageShots[] = [];
  /** Full-page shots by `<page>|<viewport>`, for crops. */
  const shots = new Map<string, string>();
  let live: LiveBrowser | undefined;

  try {
    live = await launchLiveBrowser(browserPath, input.allowHostsForTesting ?? [], 'od-audit-profile-');
    const { page } = live;
    const { tally } = await watchNetwork(page, main.hostname);

    for (const [i, url] of valid.urls.entries()) {
      const pageUrl = url.toString();
      const prefix = valid.urls.length > 1 ? `page-${i + 1}-` : '';
      const add = async (raw: Finding[], viewport: AuditViewport): Promise<void> => {
        if (raw.length === 0) return;
        const located = (await page.evaluate(locateDescribed, raw.map((f) => f.selector ?? ''))) as ReturnType<typeof locateDescribed>;
        raw.forEach((f, k) => {
          const loc = located[k] ?? { region: 'page', aboveFold: false };
          findings.push({ check: f.check, severity: f.severity, message: f.message, selector: f.selector, page: pageUrl, viewport, region: f.selector ? loc.region : 'page', aboveFold: loc.aboveFold, rect: loc.rect });
        });
      };

      // Desktop.
      await page.setViewport({ ...DESKTOP_VIEWPORT, deviceScaleFactor: 1 });
      try {
        await gotoPage(page, pageUrl);
      } catch (err) {
        blocked.push({ url: pageUrl, reason: `the page didn't load (${err instanceof Error ? err.message.split('\n')[0] : String(err)})` });
        continue;
      }
      const consent = Number(await page.evaluate(hideConsentBanners));
      if (consent > 0) notes.push(`${pageUrl}: hid ${consent} cookie or consent banner(s) before measuring.`);
      const signals = (await page.evaluate(readPageSignals)) as PageSignals;
      const desktopShot = `${prefix}desktop.png`;
      const reason = blockedReason(url, page.url(), signals);
      if (reason) {
        await page.screenshot({ path: path.join(auditDir, desktopShot) });
        blocked.push({ url: pageUrl, reason, screenshot: rel(desktopShot) });
        continue;
      }
      audited.push(pageUrl);
      await page.screenshot({ path: path.join(auditDir, desktopShot) });
      screenshots.push(rel(desktopShot));
      const desktopFull = `${prefix}desktop-full.png`;
      await fullShot(page, path.join(auditDir, desktopFull));
      shots.set(`${pageUrl}|desktop`, desktopFull);
      await add(await desktopPasses(page), 'desktop');

      // Phone: a fresh load, measured for weight.
      // Not isMobile: mobile emulation zooms out to fit overflowing content, which hides sideways scroll. The viewport meta is checked from the DOM.
      await page.setViewport({ ...MOBILE_VIEWPORT, hasTouch: true, deviceScaleFactor: 1 });
      tally.reset();
      await gotoPage(page, pageUrl).catch(() => undefined);
      const weight = { page: pageUrl, bytes: tally.bytes, requests: tally.requests };
      pageWeight.push(weight);
      const broken = [...tally.broken];
      await page.evaluate(hideConsentBanners);
      const phoneShot = `${prefix}phone.png`;
      await page.screenshot({ path: path.join(auditDir, phoneShot) });
      screenshots.push(rel(phoneShot));
      const phoneFull = `${prefix}phone-full.png`;
      await fullShot(page, path.join(auditDir, phoneFull));
      shots.set(`${pageUrl}|phone`, phoneFull);
      pageShots.push({ page: pageUrl, desktop: rel(desktopShot), phone: rel(phoneShot), desktopFull: rel(desktopFull), phoneFull: rel(phoneFull) });

      const passes = await phonePasses(page);
      const pageLevel: Finding[] = passes.viewportMeta ? [] : [{ check: 'missing-viewport', severity: 'error', message: MISSING_VIEWPORT_MESSAGE }];
      if (weight.bytes > PAGE_WEIGHT_BUDGET_BYTES) {
        pageLevel.push({ check: 'page-weight', severity: 'warning', message: `The phone load downloads ${(weight.bytes / 1024 / 1024).toFixed(1)} MB (budget ${(PAGE_WEIGHT_BUDGET_BYTES / 1024 / 1024).toFixed(0)} MB).` });
      }
      if (weight.requests > REQUEST_BUDGET) {
        pageLevel.push({ check: 'page-weight', severity: 'warning', message: `The phone load makes ${weight.requests} requests (budget ${REQUEST_BUDGET}).` });
      }
      for (const b of broken.slice(0, 20)) pageLevel.push({ check: 'broken-asset', severity: 'warning', message: `${b.url} failed to load (${b.status}).` });
      await add(pageLevel, 'phone');
      await add(passes.phone, 'phone');
      // Reflow at 320 px, unless the phone already scrolls sideways.
      if (!passes.scrollsSideways) {
        const reflow = await reflowPass(page);
        if (reflow.length > 0) {
          const reflowFull = `${prefix}reflow-full.png`;
          await fullShot(page, path.join(auditDir, reflowFull));
          shots.set(`${pageUrl}|${REFLOW_WIDTH}px`, reflowFull);
          await add(reflow, `${REFLOW_WIDTH}px`);
        }
      }
    }
  } catch (err) {
    notes.push(`The browser stopped early: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
  } finally {
    await live?.close();
  }

  // Taste rules over their calibrated false-alarm bar become notes; two or more tells make one template-look finding.
  const taste = applyTasteCalibration(findings);
  notes.push(...taste.notes);
  const counted: AuditFinding[] = [
    ...taste.findings,
    ...taste.templateLook
      .filter((t) => t.counted)
      .map((t) => ({ check: 'template-look', severity: 'warning' as const, message: `${t.tells.length} template tells on this page: ${t.tells.join(', ')}.`, page: t.page, viewport: 'desktop' as const, region: 'page' as const, aboveFold: false })),
  ];
  const groups = groupFindings(counted);
  // Crops for the groups the report shows.
  for (const g of groups.slice(0, TOP_GROUPS)) {
    const f = counted.find((x) => x.check === g.check && x.page === g.page && x.region === g.region && x.rect);
    const shot = f ? shots.get(`${f.page}|${f.viewport}`) : undefined;
    if (!f?.rect || !shot) continue;
    try {
      const png = await fs.readFile(path.join(auditDir, shot));
      const file = `crops/${g.id}.png`;
      await fs.writeFile(path.join(auditDir, file), cropMarked(png, f.rect));
      g.crop = rel(file);
    } catch {
      // No crop for this group.
    }
  }

  const status = audited.length === 0 ? 'blocked' : blocked.length > 0 ? 'partial' : 'ok';
  const reportRel = rel('index.html');
  const result = { status, slug, auditDir: auditRel, report: reportRel, capturedAt, pages: audited, groups, findings, screenshots, blocked, pageWeight, notes } as const;
  await fs.writeFile(
    path.join(auditDir, 'audit.json'),
    JSON.stringify({ url: main.toString(), capturedAt, status, pages: audited, pageShots, pageWeight, blocked, notes, checks: AUDIT_CHECKS.map((c) => c.check), notMeasured: NOT_MEASURED, tasteCalibration: { calibratedAt: TASTE_CALIBRATION.calibratedAt, rules: TASTE_CALIBRATION.rules }, groups, findings }, null, 2) + '\n',
  );
  await fs.writeFile(path.join(auditDir, 'index.html'), renderAuditReport({ ...result, url: main.toString() }, auditRel));
  return result;
}

/** 3.1 MB, 412 KB. */
export const formatBytes = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** The report page: top groups with crops, the rest as a table, what was checked and what wasn't. Paths are relative to the audit folder. */
export function renderAuditReport(
  r: { url: string; capturedAt: string; pages: string[]; groups: AuditGroup[]; screenshots: string[]; blocked: AuditBlockedPage[]; pageWeight: AuditPageWeight[]; notes: string[] },
  auditRel: string,
): string {
  const local = (p: string): string => (p.startsWith(auditRel + '/') ? p.slice(auditRel.length + 1) : p);
  const host = (() => {
    try {
      return new URL(r.url).hostname.replace(/^www\./, '');
    } catch {
      return r.url;
    }
  })();
  const when = new Date(r.capturedAt).toUTCString().replace(/:\d\d GMT$/, ' UTC');
  const pagePath = (u: string): string => {
    try {
      return new URL(u).pathname || '/';
    } catch {
      return u;
    }
  };
  const where = (g: AuditGroup): string =>
    `${pagePath(g.page)} · ${g.viewport === 'desktop' ? 'desktop' : g.viewport === 'phone' ? 'phone' : g.viewport + ' wide'}${g.region === 'page' ? '' : ` · ${g.region}`}${g.count > 1 ? ` · ${g.count} places` : ''}`;
  const top = r.groups.slice(0, TOP_GROUPS);
  const rest = r.groups.slice(TOP_GROUPS);
  const topHtml = top.length
    ? top
        .map(
          (g, i) => `<article class="finding">
  <div class="num">${i + 1}</div>
  <div class="body">
    <h3>${esc(g.title)}</h3>
    <p class="where">${esc(where(g))}</p>
    <p><strong>What it costs.</strong> ${esc(g.cost)}</p>
    <p><strong>The fix.</strong> ${esc(g.fix)}</p>
    <details><summary>Detail for the developer</summary><p>${esc(g.detail)}</p>${g.examples.length ? `<p class="ex">${g.examples.map(esc).join('<br>')}</p>` : ''}</details>
  </div>
  ${g.crop ? `<img class="crop" src="${esc(local(g.crop))}" alt="${esc(g.title)}, marked in red">` : ''}
</article>`,
        )
        .join('\n')
    : '<p class="clean">None of the checks below found a problem on the pages audited.</p>';
  const restHtml = rest.length
    ? `<h2>Smaller issues</h2><table><thead><tr><th>Issue</th><th>Where</th></tr></thead><tbody>${rest
        .map((g) => `<tr><td>${esc(g.title)}</td><td>${esc(where(g))}</td></tr>`)
        .join('')}</tbody></table>`
    : '';
  const shotsHtml = r.screenshots
    .filter((s) => /(desktop|phone)\.png$/.test(s))
    .map((s) => `<figure><img src="${esc(local(s))}" alt="${esc(s.endsWith('phone.png') ? 'Phone' : 'Desktop')} screenshot"><figcaption>${esc(s.split('/').pop() ?? s)}</figcaption></figure>`)
    .join('');
  const weightHtml = r.pageWeight
    .map((w) => `<li>${esc(pagePath(w.page))}: ${formatBytes(w.bytes)} in ${w.requests} request${w.requests === 1 ? '' : 's'} on a phone</li>`)
    .join('');
  const blockedHtml = r.blocked.length ? `<h2>Pages not audited</h2><ul>${r.blocked.map((b) => `<li>${esc(b.url)}: ${esc(b.reason)}</li>`).join('')}</ul>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Site audit: ${esc(host)}</title>
<style>
:root{--bg:#fbfaf8;--fg:#1d1c1a;--muted:#5d5a55;--line:#e3e0da;--card:#fff;--accent:#b4232a;--ok:#2f6b3a}
@media (prefers-color-scheme:dark){:root{--bg:#161514;--fg:#f1efe9;--muted:#aaa59c;--line:#34312d;--card:#1f1e1c;--accent:#f06a6f;--ok:#7bc58a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:960px;margin:0 auto;padding:40px 20px 64px}
h1{font-size:clamp(28px,4vw,40px);line-height:1.15;margin:0 0 8px}h2{font-size:20px;margin:40px 0 12px}h3{font-size:18px;margin:0 0 4px}
.meta{color:var(--muted);margin:0 0 24px}.finding{display:grid;grid-template-columns:40px 1fr;gap:12px 16px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin:0 0 16px}
.finding .crop{grid-column:2;max-width:100%;border:1px solid var(--line);border-radius:8px}.num{font-weight:700;font-size:22px;color:var(--accent)}
.where{color:var(--muted);font-size:14px;margin:0 0 8px}.body p{margin:6px 0}details{margin-top:8px;color:var(--muted);font-size:14px}.ex{font-family:ui-monospace,monospace;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:15px}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:top}
.shots{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}.shots figure{margin:0;flex:1 1 200px;max-width:560px}.shots img{width:100%;border:1px solid var(--line);border-radius:8px}
figcaption{font-size:13px;color:var(--muted)}.cal{color:var(--muted);font-size:14px}ul{padding-left:20px}.clean{color:var(--ok);font-weight:600}.scope{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}
</style>
</head>
<body>
<main>
<h1>What’s holding ${esc(host)} back</h1>
<p class="meta">Audited ${esc(r.pages.map(pagePath).join(', ') || 'no pages')} on ${esc(when)}, at desktop (1440 px) and phone (390 px) sizes.</p>
<h2>The ${top.length > 1 ? `${top.length} biggest problems` : top.length === 1 ? 'biggest problem' : 'result'}</h2>
${topHtml}
${restHtml}
${blockedHtml}
<h2>Screenshots</h2>
<div class="shots">${shotsHtml}</div>
<div class="scope">
<section><h2>What this audit checked</h2><ul>${AUDIT_CHECKS.map((c) => `<li>${esc(c.label)}</li>`).join('')}</ul><p class="cal">${esc(calibrationLine())}</p>${weightHtml ? `<p>Measured download size:</p><ul>${weightHtml}</ul>` : ''}</section>
<section><h2>What it doesn’t measure</h2><ul>${NOT_MEASURED.map((n) => `<li>${esc(n)}</li>`).join('')}</ul><p>No overall score is given: the findings above are the result.</p></section>
</div>
${r.notes.length ? `<h2>Notes</h2><ul>${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
</main>
</body>
</html>
`;
}

/** The tool's text. */
export function formatAuditSiteResult(result: AuditSiteResult): string {
  if (result.status === 'invalid-args' || result.status === 'no-browser') return JSON.stringify({ status: result.status, error: result.error }, null, 2);
  const next =
    result.status === 'blocked'
      ? 'Nothing could be audited. Show the person the screenshot and why, and ask for another public page. Don’t retry with other settings.'
      : 'Tell the person the top findings in plain words (title, where, what it costs), and point them to the report. Quote only what the audit found; don’t add scores, speed or SEO claims. To redesign the site, the open-design-redesign skill starts from this audit.';
  return JSON.stringify(
    {
      status: result.status,
      report: result.report,
      auditJson: `${result.auditDir}/audit.json`,
      capturedAt: result.capturedAt,
      pages: result.pages,
      top: result.groups.slice(0, TOP_GROUPS).map((g) => ({ id: g.id, title: g.title, check: g.check, where: `${g.page} (${g.viewport}${g.region === 'page' ? '' : `, ${g.region}`})`, count: g.count, cost: g.cost, fix: g.fix, detail: g.detail, crop: g.crop })),
      otherGroups: result.groups.slice(TOP_GROUPS).map((g) => ({ id: g.id, title: g.title, page: g.page, count: g.count })),
      totalFindings: result.findings.length,
      pageWeight: result.pageWeight,
      blocked: result.blocked,
      screenshots: result.screenshots,
      notes: result.notes,
      next,
    },
    null,
    2,
  );
}
