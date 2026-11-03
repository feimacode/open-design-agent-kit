/// <reference lib="dom" />
// The before/after page for a redesign (openspec add-before-after): each
// page's base screen beside a fresh capture of the design, at desktop and
// phone sizes, with a drag slider; the site audit's findings for that page,
// each re-checked on the design with the same check at the same size (fixed
// only when it passes); the copy edits with their originals; and up to three
// summary lines, each citing fixed findings. One self-contained HTML file,
// registered as its own artifact so it publishes and exports like any design.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as cheerio from 'cheerio';
import type { Page } from 'puppeteer-core';
import { openArtifactPage } from './artifactPage';
import { findBrowser } from './browserDiscovery';
import { loadPage } from './exportArtifact';
import { DESKTOP_VIEWPORT, MOBILE_VIEWPORT, liveSlug } from './livePage';
import { hasConceptRibbon, redesignSiteOf } from './redesignChecks';
import { AUDITS_DIR, desktopPasses, locateDescribed, MISSING_VIEWPORT_MESSAGE, phonePasses, reflowPass, type AuditFinding, type AuditGroup, type AuditPageShots } from './siteAudit';
import type { Finding } from '../poster/preflight';
import { findBaseScreen, readBaseScreenOrigin } from '../generation/baseScreen';
import { readArtifact, writeArtifactManifest } from '../vendored/artifactCreate';
import { findCollectionArtifacts } from '../workspace/collectionScan';

export const BEFORE_AFTER_FILE = 'before-after.html';
export const MAX_SUMMARY_LINES = 3;
const MAX_SUMMARY_CHARS = 160;
const STALE_DAYS = 30;
const MAX_EMBEDDED_BYTES = 12 * 1024 * 1024;

export type PairStatus = 'fixed' | 'open' | 'not-rechecked';

export interface PairedFinding {
  id: string;
  title: string;
  check: string;
  viewport: string;
  region: string;
  status: PairStatus;
  /** What the audit measured, e.g. `"Book a table" 1.43:1` or `3 found`. */
  before: string;
  /** What the same check measures on the design. */
  after: string;
  fix: string;
}

export interface CopyEdit {
  original: string;
  text: string;
}

export interface SummaryLine {
  text: string;
  cites: string[];
}

export interface BeforeAfterPage {
  entryPath: string;
  title: string;
  /** The old page's address, when the base screen can be traced back to it. */
  oldUrl?: string;
  baseScreen: string;
  beforeCapturedAt?: string;
  findings: PairedFinding[];
  copyEdits: CopyEdit[];
  /** The design's own results for the live-safe checks, when there is no audit to pair with. */
  designPasses: string[];
  /** Whether the old page was audited: `none` when the site wasn't, `not-this-page` when other pages were. */
  audited: 'yes' | 'none' | 'not-this-page';
  notes: string[];
}

export interface BeforeAfterInput {
  workspaceRoot: string;
  outputDir: string;
  entryPath?: string;
  collectionId?: string;
  summary?: unknown;
  executablePath?: string;
  browserPath?: string;
  now?: Date;
}

export type BeforeAfterResult =
  | { status: 'invalid-args' | 'no-base' | 'no-browser'; error: string }
  | {
      status: 'ok';
      /** Workspace-relative path of the page. */
      page: string;
      pages: BeforeAfterPage[];
      summary: SummaryLine[];
      rejectedSummary: Array<{ text: string; reason: string }>;
      concept: boolean;
      notes: string[];
    };

// ── Pure parts ───────────────────────────────────────────────────────────

const RATIO = /contrast ratio of ([\d.]+):1/;
const QUOTED = /"([^"]+)"/;

/** Validates summary lines against the findings: each needs text and cites fixed findings only. */
export function validateSummary(input: unknown, findings: PairedFinding[]): { lines: SummaryLine[]; rejected: Array<{ text: string; reason: string }>; error?: string } {
  if (input === undefined) return { lines: [], rejected: [] };
  if (!Array.isArray(input)) return { lines: [], rejected: [], error: 'summary must be a list of { text, cites } (at most 3).' };
  const byId = new Map(findings.map((f) => [f.id, f]));
  const lines: SummaryLine[] = [];
  const rejected: Array<{ text: string; reason: string }> = [];
  for (const raw of input) {
    const text = raw && typeof raw === 'object' && typeof (raw as SummaryLine).text === 'string' ? (raw as SummaryLine).text.trim() : '';
    const cites = raw && typeof raw === 'object' && Array.isArray((raw as SummaryLine).cites) ? (raw as SummaryLine).cites.filter((c): c is string => typeof c === 'string').map((c) => c.trim()) : [];
    if (!text) {
      rejected.push({ text: String((raw as SummaryLine)?.text ?? ''), reason: 'it has no text' });
      continue;
    }
    if (lines.length >= MAX_SUMMARY_LINES) {
      rejected.push({ text, reason: `only ${MAX_SUMMARY_LINES} lines are kept` });
      continue;
    }
    if (text.length > MAX_SUMMARY_CHARS) {
      rejected.push({ text, reason: `it is over ${MAX_SUMMARY_CHARS} characters` });
      continue;
    }
    if (cites.length === 0) {
      rejected.push({ text, reason: 'it cites no finding: every line must name the fixed findings (e.g. "F1") it is based on' });
      continue;
    }
    const unknown = cites.filter((c) => !byId.has(c));
    if (unknown.length > 0) {
      rejected.push({ text, reason: `it cites ${unknown.join(', ')}, which ${unknown.length === 1 ? "isn't a finding" : "aren't findings"} on this page` });
      continue;
    }
    const notFixed = cites.filter((c) => byId.get(c)!.status !== 'fixed');
    if (notFixed.length > 0) {
      rejected.push({ text, reason: `it cites ${notFixed.join(', ')}, which ${notFixed.length === 1 ? 'is' : 'are'} not fixed (${notFixed.map((c) => byId.get(c)!.status).join(', ')})` });
      continue;
    }
    lines.push({ text, cites });
  }
  return { lines, rejected };
}

/** The copy edits in a design: every `data-od-copy-edit` element with its original. */
export function copyEditsOf(html: string): CopyEdit[] {
  const $ = cheerio.load(html);
  const out: CopyEdit[] = [];
  $('[data-od-copy-edit]').each((_, el) => {
    const node = $(el);
    out.push({ original: (node.attr('data-od-original') ?? '').trim(), text: node.text().replace(/\s+/g, ' ').trim() });
  });
  return out;
}

interface DesignMeasure {
  findings: Array<Finding & { viewport: string; region: string }>;
  /** Contrast of the design's text that matches a quoted audit text, by `<viewport>|<text>`. */
  contrast: Map<string, number>;
}

/** Pairs the audit's groups for one page with the design's findings at the same size. */
export function pairFindings(groups: AuditGroup[], auditFindings: AuditFinding[], design: DesignMeasure): PairedFinding[] {
  return groups.map((g) => {
    const before = auditFindings.filter((f) => f.check === g.check && f.page === g.page && f.viewport === g.viewport && (g.region === 'page' || f.region === g.region));
    const base = { id: g.id, title: g.title, check: g.check, viewport: g.viewport, region: g.region, fix: g.fix };
    if (g.check === 'page-weight') {
      return { ...base, status: 'not-rechecked' as const, before: g.detail.replace(/^The phone load /, ''), after: "not re-checked: the design isn't served the way the live site is, so its download can't be compared" };
    }
    const after = design.findings.filter((f) => f.check === g.check && f.viewport === g.viewport && (g.region === 'page' || f.region === 'page' || f.region === g.region));
    const status: PairStatus = after.length === 0 ? 'fixed' : 'open';
    if (g.check === 'contrast') {
      const worst = before.map((f) => ({ f, ratio: Number(RATIO.exec(f.message)?.[1]) })).filter((x) => Number.isFinite(x.ratio)).sort((a, b) => a.ratio - b.ratio)[0];
      const text = worst ? QUOTED.exec(worst.f.selector ?? worst.f.message)?.[1]?.replace(/…$/, '') : undefined;
      const beforeText = worst ? `${text ? `"${text}" ` : ''}${worst.ratio}:1` : `${g.count} found`;
      const measured = text ? design.contrast.get(`${g.viewport}|${text}`) : undefined;
      const afterText =
        measured !== undefined
          ? `"${text}" ${Math.floor(measured * 100) / 100}:1`
          : status === 'fixed'
            ? 'no text below 4.5:1 (3:1 for large text) in this part of the page'
            : `${after.length} still below the bar, e.g. ${RATIO.exec(after[0].message)?.[1] ?? '?'}:1`;
      return { ...base, status, before: beforeText, after: afterText };
    }
    const n = before.length || g.count;
    return { ...base, status, before: `${n} found`, after: status === 'fixed' ? 'none found' : `${after.length} still found` };
  });
}

// ── In-page ──────────────────────────────────────────────────────────────

/** Contrast of the visible elements whose text starts with each given text. Self-contained. */
function contrastOfTexts(texts: string[]): Array<number | null> {
  const parse = (c: string): { r: number; g: number; b: number; a: number } | null => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c: { r: number; g: number; b: number }) => {
    const ch = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  };
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const all = Array.prototype.slice.call(document.body.querySelectorAll('*')) as HTMLElement[];
  return texts.map((t) => {
    const want = norm(t);
    const el = all.find((e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const own = norm(e.innerText || '');
      return own.startsWith(want) && !Array.prototype.some.call(e.children, (c: HTMLElement) => norm(c.innerText || '').startsWith(want));
    });
    if (!el) return null;
    let bg: { r: number; g: number; b: number; a: number } | null = null;
    for (let a: HTMLElement | null = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a >= 0.99) {
        bg = c;
        break;
      }
      if (c && c.a > 0.01) return null;
    }
    if (!bg) bg = { r: 255, g: 255, b: 255, a: 1 };
    const f0 = parse(getComputedStyle(el).color);
    if (!f0) return null;
    const fg = { r: f0.r * f0.a + bg.r * (1 - f0.a), g: f0.g * f0.a + bg.g * (1 - f0.a), b: f0.b * f0.a + bg.b * (1 - f0.a) };
    const l1 = lum(fg);
    const l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  });
}

function readViewportMeta(): boolean {
  const meta = document.querySelector('meta[name="viewport" i]');
  return !!meta && /width\s*=\s*device-width/i.test(meta.getAttribute('content') || '');
}

// ── Node side ────────────────────────────────────────────────────────────

interface Captures {
  desktop: Buffer;
  phone: Buffer;
  desktopFull: Buffer;
  phoneFull: Buffer;
  capturedAt: string;
}

async function locate(page: Page, list: Finding[], viewport: string): Promise<Array<Finding & { viewport: string; region: string }>> {
  if (list.length === 0) return [];
  const located = (await page.evaluate(locateDescribed, list.map((f) => f.selector ?? ''))) as Array<{ region: string }>;
  return list.map((f, i) => ({ ...f, viewport, region: f.selector ? (located[i]?.region ?? 'page') : 'page' }));
}

/** Captures the design at both sizes and runs the audit's checks on it, the same way the audit does. */
async function measureDesign(executablePath: string, workspaceRoot: string, entryPath: string, quoted: Array<{ viewport: string; text: string }>): Promise<{ measure: DesignMeasure; captures: Captures }> {
  const session = await openArtifactPage({ workspaceRoot, relEntry: entryPath, executablePath });
  const warnings: string[] = [];
  const findings: DesignMeasure['findings'] = [];
  const contrast = new Map<string, number>();
  try {
    const { page } = session;
    const broken: string[] = [];
    page.on('response', (res) => {
      if (res.status() >= 400) broken.push(`${res.url()} failed to load (${res.status()}).`);
    });
    page.on('requestfailed', (req) => broken.push(`${req.url()} failed to load (${req.failure()?.errorText ?? 'failed'}).`));
    const contrastAt = async (viewport: string): Promise<void> => {
      const want = quoted.filter((q) => q.viewport === viewport);
      if (want.length === 0) return;
      const ratios = (await page.evaluate(contrastOfTexts, want.map((q) => q.text))) as Array<number | null>;
      want.forEach((q, i) => {
        if (typeof ratios[i] === 'number') contrast.set(`${viewport}|${q.text}`, ratios[i] as number);
      });
    };

    await page.setViewport({ ...DESKTOP_VIEWPORT, deviceScaleFactor: 1 });
    await loadPage(page, session.url, 15000, 500, warnings);
    const desktop = Buffer.from(await page.screenshot({ type: 'jpeg', quality: 82 }));
    const desktopFull = Buffer.from(await page.screenshot({ type: 'jpeg', quality: 72, fullPage: true }));
    findings.push(...(await locate(page, await desktopPasses(page), 'desktop')));
    await contrastAt('desktop');

    await page.setViewport({ ...MOBILE_VIEWPORT, hasTouch: true, deviceScaleFactor: 1 });
    broken.length = 0;
    await loadPage(page, session.url, 15000, 500, warnings);
    const phone = Buffer.from(await page.screenshot({ type: 'jpeg', quality: 82 }));
    const phoneFull = Buffer.from(await page.screenshot({ type: 'jpeg', quality: 72, fullPage: true }));
    const passes = await phonePasses(page);
    const pageLevel: Finding[] = [];
    if (!((await page.evaluate(readViewportMeta)) as boolean)) pageLevel.push({ check: 'missing-viewport', severity: 'error', message: MISSING_VIEWPORT_MESSAGE });
    for (const b of broken.slice(0, 20)) pageLevel.push({ check: 'broken-asset', severity: 'warning', message: b });
    findings.push(...(await locate(page, pageLevel, 'phone')));
    findings.push(...(await locate(page, passes.phone, 'phone')));
    await contrastAt('phone');
    if (!passes.scrollsSideways) findings.push(...(await locate(page, await reflowPass(page), '320px')));
    return { measure: { findings, contrast }, captures: { desktop, phone, desktopFull, phoneFull, capturedAt: new Date().toISOString() } };
  } finally {
    await session.close();
  }
}

interface AuditFile {
  url?: string;
  pages?: string[];
  capturedAt?: string;
  pageShots?: AuditPageShots[];
  groups?: AuditGroup[];
  findings?: AuditFinding[];
}

const samePage = (a: string, b: string): boolean => {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.origin === y.origin && x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, '') && x.search === y.search;
  } catch {
    return a === b;
  }
};

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

/** The old page a base screen shows: its URL, or the extraction or audit page whose screenshot it was copied from. */
async function tracePage(workspaceRoot: string, from: string): Promise<{ url?: string; phoneShot?: string }> {
  if (/^https?:\/\//i.test(from)) return { url: from };
  const dir = path.posix.dirname(from);
  const evidence = await readJson<{ pageShots?: Array<{ url: string; desktop: string; mobile: string }> }>(path.join(workspaceRoot, dir, 'evidence.json'));
  const fromEvidence = evidence?.pageShots?.find((s) => s.desktop === from || s.mobile === from);
  if (fromEvidence) return { url: fromEvidence.url, phoneShot: fromEvidence.mobile };
  const audit = await readJson<AuditFile>(path.join(workspaceRoot, dir, 'audit.json'));
  const fromAudit = audit?.pageShots?.find((s) => s.desktop === from || s.phone === from);
  if (fromAudit) return { url: fromAudit.page, phoneShot: fromAudit.phone };
  return {};
}

const mimeOf = (file: string): string => (/\.jpe?g$/i.test(file) ? 'image/jpeg' : /\.webp$/i.test(file) ? 'image/webp' : 'image/png');
const dataUri = (buf: Buffer, mime: string): string => `data:${mime};base64,${buf.toString('base64')}`;
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Writes the before/after page for a design or a collection. Never throws for a design problem; reports it. */
export async function compareBeforeAfter(input: BeforeAfterInput): Promise<BeforeAfterResult> {
  if (!input.entryPath === !input.collectionId) return { status: 'invalid-args', error: 'Give entryPath (one design) or collectionId (every page of a redesign), not both.' };
  const now = input.now ?? new Date();
  let entries: Array<{ entryPath: string; title: string }>;
  if (input.collectionId) {
    const screens = await findCollectionArtifacts(input.workspaceRoot, input.outputDir, input.collectionId);
    if (screens.length === 0) return { status: 'invalid-args', error: `No designs in collection "${input.collectionId}".` };
    entries = screens.map((s) => ({ entryPath: s.entryPath, title: s.title }));
  } else {
    const artifact = await readArtifact({ workspaceRoot: input.workspaceRoot, entryPath: input.entryPath! }).catch(() => undefined);
    if (!artifact) return { status: 'invalid-args', error: `No design at ${input.entryPath}.` };
    entries = [{ entryPath: input.entryPath!, title: typeof artifact.manifest?.title === 'string' ? artifact.manifest.title : path.posix.basename(input.entryPath!) }];
  }

  const notes: string[] = [];
  const withBase: Array<{ entryPath: string; title: string; base: string }> = [];
  for (const e of entries) {
    const base = await findBaseScreen(input.workspaceRoot, input.outputDir, e.entryPath);
    if (base) withBase.push({ ...e, base });
    else notes.push(`${e.entryPath} has no base screen, so it isn't compared.`);
  }
  if (withBase.length === 0) {
    return {
      status: 'no-base',
      error: `${entries.length === 1 ? `${entries[0].entryPath} has` : 'None of these designs has'} no base screen, the "before" to compare with. Prepare the brief again with baseScreen: the old page's URL, or its screenshot (for a redesign, the extraction's desktop screenshot of that page), then run this again.`,
    };
  }

  const browserPath = input.executablePath ?? (await findBrowser({ explicitPath: input.browserPath }).then((r) => (r.ok ? r.executablePath : undefined)));
  if (!browserPath) return { status: 'no-browser', error: 'No Chrome, Edge or Chromium browser was found, so the design can’t be captured. Install one or set OPEN_DESIGN_BROWSER_PATH.' };

  const pages: BeforeAfterPage[] = [];
  const images: Array<{ before: string; beforePhone?: string; after: string; afterPhone: string; beforeFull?: string; beforePhoneFull?: string; afterFull: string; afterPhoneFull: string; afterAt: string }> = [];
  let concept = false;
  let siteName: string | undefined;
  const auditCache = new Map<string, AuditFile | undefined>();
  let embedded = 0;

  for (const e of withBase) {
    const html = await fs.readFile(path.join(input.workspaceRoot, e.entryPath), 'utf8').catch(() => '');
    concept ||= hasConceptRibbon(html);
    const origin = await readBaseScreenOrigin(input.workspaceRoot, input.outputDir, e.entryPath);
    const traced = origin ? await tracePage(input.workspaceRoot, origin.from) : {};
    const pageNotes: string[] = [];
    if (!origin) pageNotes.push("The base screen was stored before the kit recorded where it came from, so the audit can't be matched to this page.");
    if (origin && now.getTime() - Date.parse(origin.capturedAt) > STALE_DAYS * 86_400_000) {
      pageNotes.push(`The before screenshot is from ${origin.capturedAt.slice(0, 10)}, over ${STALE_DAYS} days ago; the live site may have changed. Store a fresh one with baseScreen and run this again.`);
    }

    const site = redesignSiteOf(html) ?? traced.url;
    let audit: AuditFile | undefined;
    if (site) {
      try {
        const slug = liveSlug(new URL(site));
        if (!auditCache.has(slug)) auditCache.set(slug, await readJson<AuditFile>(path.join(input.workspaceRoot, input.outputDir, AUDITS_DIR, slug, 'audit.json')));
        audit = auditCache.get(slug);
        siteName ??= new URL(site).hostname.replace(/^www\./, '');
      } catch {
        // not a URL
      }
    }
    const groups = traced.url && audit?.groups ? audit.groups.filter((g) => samePage(g.page, traced.url!)) : [];
    const auditFindings = traced.url && audit?.findings ? audit.findings.filter((f) => samePage(f.page, traced.url!)) : [];
    const audited: BeforeAfterPage['audited'] = !audit ? 'none' : traced.url && (audit.pages ?? []).some((p) => samePage(p, traced.url!)) ? 'yes' : 'not-this-page';
    if (site && !audit) pageNotes.push(`${site} hasn't been audited, so there are no findings to pair; the design's own check results are shown instead.`);

    const quoted: Array<{ viewport: string; text: string }> = [];
    for (const g of groups.filter((x) => x.check === 'contrast')) {
      for (const f of auditFindings.filter((x) => x.check === 'contrast' && x.viewport === g.viewport)) {
        const t = QUOTED.exec(f.selector ?? '')?.[1]?.replace(/…$/, '');
        if (t) quoted.push({ viewport: g.viewport, text: t });
      }
    }
    let measured: Awaited<ReturnType<typeof measureDesign>>;
    try {
      measured = await measureDesign(browserPath, input.workspaceRoot, e.entryPath, quoted);
    } catch (err) {
      notes.push(`${e.entryPath} couldn't be captured: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
      continue;
    }
    const findings = pairFindings(groups, auditFindings, measured.measure);
    const designPasses =
      findings.length === 0
        ? ['contrast', 'tap-target', 'horizontal-scroll', 'reflow', 'missing-alt', 'overflow'].filter((c) => !measured.measure.findings.some((f) => f.check === c))
        : [];

    const shot = async (rel: string | undefined): Promise<string | undefined> => {
      if (!rel) return undefined;
      const buf = await fs.readFile(path.join(input.workspaceRoot, rel)).catch(() => undefined);
      if (!buf) return undefined;
      embedded += buf.length;
      return dataUri(buf, mimeOf(rel));
    };
    const shots = traced.url ? audit?.pageShots?.find((s) => samePage(s.page, traced.url!)) : undefined;
    const before = (await shot(e.base))!;
    const beforePhone = await shot(shots?.phone ?? traced.phoneShot);
    const c = measured.captures;
    embedded += c.desktop.length + c.phone.length;
    const fullBudget = embedded + c.desktopFull.length + c.phoneFull.length < MAX_EMBEDDED_BYTES;
    const beforeFull = fullBudget ? await shot(shots?.desktopFull) : undefined;
    const beforePhoneFull = fullBudget ? await shot(shots?.phoneFull) : undefined;
    if (fullBudget) embedded += c.desktopFull.length + c.phoneFull.length;
    else pageNotes.push('Full-page screenshots were left out to keep the page small.');
    if (!beforePhone) pageNotes.push('There is no phone screenshot of the old page (audit the site to get one), so the phone view shows the new design alone.');
    images.push({
      before,
      beforePhone,
      after: dataUri(c.desktop, 'image/jpeg'),
      afterPhone: dataUri(c.phone, 'image/jpeg'),
      beforeFull,
      beforePhoneFull,
      afterFull: fullBudget ? dataUri(c.desktopFull, 'image/jpeg') : '',
      afterPhoneFull: fullBudget ? dataUri(c.phoneFull, 'image/jpeg') : '',
      afterAt: c.capturedAt,
    });
    pages.push({ entryPath: e.entryPath, title: e.title, oldUrl: traced.url, baseScreen: e.base, beforeCapturedAt: origin?.capturedAt, findings, copyEdits: copyEditsOf(html), designPasses, audited, notes: pageNotes });
  }
  if (pages.length === 0) return { status: 'invalid-args', error: `Nothing could be captured. ${notes.join(' ')}` };

  const allFindings = pages.flatMap((p) => p.findings);
  const summary = validateSummary(input.summary, allFindings);
  if (summary.error) return { status: 'invalid-args', error: summary.error };

  const dir = input.collectionId ? path.posix.dirname(pages[0].entryPath) : path.posix.dirname(input.entryPath!);
  const out = path.posix.join(dir, input.collectionId ? BEFORE_AFTER_FILE : `${path.posix.basename(input.entryPath!).replace(/\.html?$/i, '')}.${BEFORE_AFTER_FILE}`);
  const name = siteName ?? pages[0].title;
  const htmlOut = renderBeforeAfterHtml({ name, pages, images, summary: summary.lines, concept, generatedAt: now.toISOString() });
  await fs.writeFile(path.join(input.workspaceRoot, out), htmlOut);
  await writeArtifactManifest({
    workspaceRoot: input.workspaceRoot,
    entryPath: out,
    artifactManifest: {
      kind: 'html',
      renderer: 'html',
      exports: ['html', 'pdf'],
      title: `Before and after: ${name}`,
      metadata: { beforeAfter: { pages: pages.map((p) => p.entryPath), fixed: allFindings.filter((f) => f.status === 'fixed').map((f) => f.id), open: allFindings.filter((f) => f.status === 'open').map((f) => f.id), summary: summary.lines.length } },
    },
  });
  return { status: 'ok', page: out, pages, summary: summary.lines, rejectedSummary: summary.rejected, concept, notes };
}

// ── Page ─────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<PairStatus, string> = { fixed: 'Fixed', open: 'Still open', 'not-rechecked': 'Not re-checked' };
const when = (iso?: string): string => (iso ? iso.replace('T', ' ').slice(0, 16) + ' UTC' : 'unknown');

function compareFigure(label: string, before: string | undefined, after: string, phone: boolean): string {
  if (!before) {
    return `<figure class="cmp single${phone ? ' phone' : ''}"><figcaption>${esc(label)}: the new design</figcaption><img src="${after}" alt="${esc(label)}, new design"></figure>`;
  }
  return `<figure class="cmp${phone ? ' phone' : ''}" style="--pos:50%">
<figcaption>${esc(label)} <button type="button" class="toggle">Side by side</button></figcaption>
<div class="stage"><img class="after" src="${after}" alt="${esc(label)}, new design"><img class="before" src="${before}" alt="${esc(label)}, the site today"><span class="tag tb">Before</span><span class="tag ta">After</span><input type="range" min="0" max="100" value="50" aria-label="Drag to compare before and after"></div>
<div class="pair"><div><span>Before</span><img src="${before}" alt=""></div><div><span>After</span><img src="${after}" alt=""></div></div>
</figure>`;
}

export function renderBeforeAfterHtml(input: {
  name: string;
  pages: BeforeAfterPage[];
  images: Array<{ before: string; beforePhone?: string; after: string; afterPhone: string; beforeFull?: string; beforePhoneFull?: string; afterFull: string; afterPhoneFull: string; afterAt: string }>;
  summary: SummaryLine[];
  concept: boolean;
  generatedAt: string;
}): string {
  const all = input.pages.flatMap((p) => p.findings);
  const fixed = all.filter((f) => f.status === 'fixed').length;
  const summary = input.summary.length
    ? `<ul class="summary">${input.summary.map((l) => `<li>${esc(l.text)} ${l.cites.map((c) => `<a class="cite" href="#${esc(c)}">${esc(c)}</a>`).join(' ')}</li>`).join('')}</ul>`
    : '';
  const sections = input.pages
    .map((p, i) => {
      const img = input.images[i];
      const rows = p.findings.length
        ? `<table class="findings"><thead><tr><th>Problem</th><th>Where</th><th>Before</th><th>After</th><th></th></tr></thead><tbody>${p.findings
            .map((f) => `<tr id="${esc(f.id)}"><td><b>${esc(f.id)}</b> ${esc(f.title)}</td><td>${esc(f.viewport)}${f.region !== 'page' ? `, ${esc(f.region)}` : ''}</td><td>${esc(f.before)}</td><td>${esc(f.after)}</td><td><span class="st ${f.status}">${STATUS_LABEL[f.status]}</span></td></tr>`)
            .join('')}</tbody></table><p class="fine">Fixed means the same check that found the problem passes on the new design at the same size. Anything else is listed as it is.</p>`
        : p.designPasses.length
          ? `<p>${p.audited === 'yes' ? 'The audit found no problems on this page.' : p.audited === 'not-this-page' ? "This page wasn't part of the audit." : 'The site has no audit to compare with.'} On the new design, these checks find nothing: ${p.designPasses.map(esc).join(', ')}.</p>`
          : '';
      const edits = p.copyEdits.length
        ? `<h3>Copy edits</h3><table class="edits"><thead><tr><th>The site says</th><th>The new design says</th></tr></thead><tbody>${p.copyEdits.map((c) => `<tr><td>${c.original ? esc(c.original) : '<i>original missing</i>'}</td><td>${esc(c.text)}</td></tr>`).join('')}</tbody></table>`
        : '';
      const full =
        img.afterFull && (img.beforeFull || img.beforePhoneFull)
          ? `<details class="full"><summary>Full pages side by side</summary><div class="pair">${img.beforeFull ? `<div><span>Before, desktop</span><img src="${img.beforeFull}" alt=""></div>` : ''}<div><span>After, desktop</span><img src="${img.afterFull}" alt=""></div>${img.beforePhoneFull ? `<div><span>Before, phone</span><img src="${img.beforePhoneFull}" alt=""></div>` : ''}<div><span>After, phone</span><img src="${img.afterPhoneFull}" alt=""></div></div></details>`
          : '';
      return `<section class="page">
<h2>${esc(p.title)}</h2>
<p class="meta">${p.oldUrl ? `Before: ${esc(p.oldUrl)}, captured ${when(p.beforeCapturedAt)}. ` : `Before: captured ${when(p.beforeCapturedAt)}. `}After: ${esc(p.entryPath)}, captured ${when(img.afterAt)}.</p>
${p.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')}
<div class="views">${compareFigure('Desktop', img.before, img.after, false)}${compareFigure('Phone', img.beforePhone, img.afterPhone, true)}</div>
${full}
${rows}
${edits}
</section>`;
    })
    .join('\n');
  const band = input.concept
    ? `<aside data-od-concept role="note" style="display:block;margin:0;background:#111;color:#fff;font:600 12px/1.4 system-ui,sans-serif;padding:6px 16px;text-align:center">A redesign concept of ${esc(input.name)}, not affiliated with it. The "before" screenshots show the site as it is.</aside>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Before and after: ${esc(input.name)}</title>
<style>
:root{--ink:#16181d;--muted:#5b616e;--line:#dfe2e8;--bg:#f6f7f9;--card:#fff;--ok:#0f7a3f;--open:#b42318;--na:#6b7280}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1120px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:30px;line-height:1.2;margin:0 0 6px}h2{font-size:22px;margin:0 0 4px}h3{font-size:16px;margin:24px 0 8px}
.lead{color:var(--muted);margin:0 0 20px}.summary{margin:0 0 28px;padding:16px 20px 16px 36px;background:var(--card);border:1px solid var(--line);border-radius:10px;font-size:18px}
.summary li{margin:4px 0}.cite{font-size:12px;font-weight:600;color:var(--muted);border:1px solid var(--line);border-radius:4px;padding:0 5px;text-decoration:none}
.page{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px;margin:0 0 28px}
.meta{color:var(--muted);font-size:13px;margin:0 0 12px}.note{font-size:13px;background:#fff7e6;border-radius:6px;padding:6px 10px;margin:0 0 8px}
.views{display:grid;grid-template-columns:3fr 1fr;gap:20px;align-items:start}
.cmp{margin:0}.cmp figcaption{display:flex;justify-content:space-between;align-items:center;font-weight:600;margin:0 0 6px}
.toggle{font:inherit;font-size:12px;border:1px solid var(--line);background:var(--card);border-radius:6px;padding:4px 8px;cursor:pointer}
.stage{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:8px;line-height:0}
.stage img{width:100%;display:block}.stage .before{position:absolute;inset:0;height:100%;object-fit:cover;object-position:top left;clip-path:inset(0 calc(100% - var(--pos)) 0 0)}
.stage input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:ew-resize;margin:0}
.stage::after{content:"";position:absolute;top:0;bottom:0;left:var(--pos);width:2px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.35);pointer-events:none}
.tag{position:absolute;top:8px;font:600 11px/1 system-ui,sans-serif;background:rgba(0,0,0,.65);color:#fff;padding:4px 6px;border-radius:4px}.tb{left:8px}.ta{right:8px}
.pair{display:none;grid-template-columns:1fr 1fr;gap:10px}.pair span{display:block;font-size:12px;color:var(--muted);margin:0 0 4px}.pair img{width:100%;border:1px solid var(--line);border-radius:6px}
.cmp.side .stage{display:none}.cmp.side .pair{display:grid}.single img{width:100%;border:1px solid var(--line);border-radius:8px}
.full{margin:16px 0 0}.full .pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));align-items:start}
table{width:100%;border-collapse:collapse;font-size:14px;margin:16px 0 4px}th,td{text-align:left;vertical-align:top;padding:8px;border-bottom:1px solid var(--line)}th{font-size:12px;color:var(--muted);font-weight:600}
.st{font-size:12px;font-weight:600;border-radius:999px;padding:2px 8px;white-space:nowrap}.st.fixed{background:#e6f4ea;color:var(--ok)}.st.open{background:#fdecea;color:var(--open)}.st.not-rechecked{background:#eef0f3;color:var(--na)}
.fine{font-size:12px;color:var(--muted);margin:0}.edits td:first-child{color:var(--muted)}
@media (max-width:760px){.views{grid-template-columns:1fr}.page{padding:16px}h1{font-size:24px}table{font-size:13px}th:nth-child(2),td:nth-child(2){display:none}}
@page{size:A4;margin:10mm}
@media print{body{background:#fff}main{padding:0}.page{border:0;break-after:page;padding:0}section.page:last-of-type{break-after:auto}.stage,.toggle,.full summary{display:none}.pair{display:grid!important}.full{display:none}}
</style>
</head>
<body>
${band}
<main>
<h1>Before and after: ${esc(input.name)}</h1>
<p class="lead">${input.pages.length} page${input.pages.length === 1 ? '' : 's'} compared${all.length ? `; ${fixed} of ${all.length} problems the audit found are fixed on the new design` : ''}. Drag across a screenshot to compare.</p>
${summary}
${sections}
<p class="fine">Made ${when(input.generatedAt)} with Open Design. Problems come from an automated audit of contrast, layout, tap targets and phone use; it doesn't measure search ranking, real-visitor speed or sales.</p>
</main>
<script>
document.querySelectorAll('.cmp').forEach(function (fig) {
  var r = fig.querySelector('input[type=range]');
  if (r) r.addEventListener('input', function () { fig.style.setProperty('--pos', r.value + '%'); });
  var t = fig.querySelector('.toggle');
  if (t) t.addEventListener('click', function () { var on = fig.classList.toggle('side'); t.textContent = on ? 'Slider' : 'Side by side'; });
});
</script>
</body>
</html>
`;
}

export function formatBeforeAfterResult(result: BeforeAfterResult): string {
  if (result.status !== 'ok') return JSON.stringify({ status: result.status, error: result.error }, null, 2);
  const all = result.pages.flatMap((p) => p.findings);
  return JSON.stringify(
    {
      status: 'ok',
      page: result.page,
      pages: result.pages.map((p) => ({
        entryPath: p.entryPath,
        oldUrl: p.oldUrl,
        findings: p.findings.map((f) => ({ id: f.id, title: f.title, status: f.status, before: f.before, after: f.after })),
        audited: p.audited,
        copyEdits: p.copyEdits.length,
        notes: p.notes,
      })),
      summary: result.summary,
      rejectedSummary: result.rejectedSummary.length ? result.rejectedSummary : undefined,
      notes: result.notes,
      next: [
        all.some((f) => f.status === 'open') ? 'Some findings are still open: fix them in the design and run this again, or tell the user plainly which ones remain.' : undefined,
        result.rejectedSummary.length ? 'Some summary lines were left out (see rejectedSummary): each line must cite fixed findings by id. Rewrite them and run this again.' : undefined,
        result.summary.length === 0 && all.some((f) => f.status === 'fixed') ? 'Add up to 3 summary lines, each citing the fixed findings it rests on, and run this again.' : undefined,
        `Open ${result.page} in the preview, export it as PDF (one page per screen) or publish it with publish_open_design_artifact.${result.concept ? ' It shows the concept band: send it to the business, don\'t post it publicly.' : ''}`,
      ].filter(Boolean),
    },
    null,
    2,
  );
}
