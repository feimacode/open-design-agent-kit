// The `portfolio` check group (openspec add-portfolio-site-and-deck): run only
// on designs registered with portfolio brief inputs (metadata.portfolio).
// Static checks read the HTML and the library; the first-screen check runs in
// the page at phone and desktop size; live links are fetched with a short
// timeout, only where the server runs locally.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { load, type CheerioAPI } from 'cheerio';
import type { Finding } from '../poster/preflight';
import { NOTES_SELECTOR, PRESENTER_CLONE_SELECTOR, SLIDE_SELECTOR } from '../export/deck/selectors';
import { assetPrivacy, readLibrary, readProject, type Library, type Project } from './library';
import { CASE_STUDY_WORDS, PAGE_WEIGHT_BUDGET, type PortfolioRecord } from './portfolioBrief';

export const LINK_TIMEOUT_MS = 5000;
export const MAX_LINKS_CHECKED = 12;
/** Deck timing: a talk more than this share away from its length is reported. */
export const TIMING_TOLERANCE = 0.1;

function words(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

function bodyText($: CheerioAPI): string {
  const body = $('body').clone();
  body.find('nav, footer, script, style, template, noscript, svg, [data-od-summary], [hidden], aside.notes, .speaker-notes').remove();
  return body.text().replace(/\s+/g, ' ').trim();
}

async function loadProjects(workspaceRoot: string, outputDir: string, slugs: Iterable<string>): Promise<Map<string, Project>> {
  const out = new Map<string, Project>();
  for (const slug of slugs) {
    const p = await readProject(workspaceRoot, outputDir, slug).catch(() => undefined);
    if (p) out.set(slug, p);
  }
  return out;
}

function isLocal(ref: string): boolean {
  return !!ref && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref);
}

async function pageWeight(workspaceRoot: string, entryPath: string, html: string, $: CheerioAPI): Promise<number> {
  const dir = path.dirname(path.resolve(workspaceRoot, entryPath));
  const refs = new Set<string>();
  $('img[src], video[src], source[src], script[src], link[rel="stylesheet"][href]').each((_, el) => {
    const ref = ($(el).attr('src') ?? $(el).attr('href') ?? '').split(/[?#]/)[0];
    if (isLocal(ref)) refs.add(ref);
  });
  let total = Buffer.byteLength(html, 'utf8');
  for (const ref of refs) {
    const stat = await fs.stat(path.resolve(dir, decodeURIComponent(ref))).catch(() => undefined);
    if (stat?.isFile()) total += stat.size;
  }
  return total;
}

/** Deck timing and notes: minutes on every non-backup slide, notes on each, and the sum near the chosen length. */
export function deckTimingFindings(html: string, length: number | undefined): Finding[] {
  const $ = load(html);
  const findings: Finding[] = [];
  const slides = $(SLIDE_SELECTOR)
    .filter((_, el) => $(el).closest(PRESENTER_CLONE_SELECTOR).length === 0)
    .filter((_, el) => $(el).parents(SLIDE_SELECTOR).length === 0)
    .toArray();
  let sum = 0;
  let backups = 0;
  const noMinutes: number[] = [];
  const noNotes: number[] = [];
  slides.forEach((el, i) => {
    if ($(el).is('[data-od-backup]')) {
      backups++;
      return;
    }
    const raw = $(el).attr('data-od-minutes');
    const minutes = raw === undefined ? NaN : Number(raw);
    if (Number.isFinite(minutes) && minutes >= 0) sum += minutes;
    else noMinutes.push(i + 1);
    if ($(el).find(NOTES_SELECTOR).text().trim() === '') noNotes.push(i + 1);
  });
  const list = (n: number[]) => (n.length > 8 ? `${n.slice(0, 8).join(', ')} and ${n.length - 8} more` : n.join(', '));
  if (noMinutes.length) findings.push({ check: 'deck-minutes-missing', severity: 'warning', message: `Slide(s) ${list(noMinutes)} have no minute budget. Put data-od-minutes="<minutes>" on every slide that isn't a backup, so the talk can be timed.` });
  if (noNotes.length) findings.push({ check: 'deck-notes-missing', severity: 'warning', message: `Slide(s) ${list(noNotes)} have no presenter notes. Add <aside class="notes"> with what to say, so the designer can rehearse.` });
  if (backups === 0) findings.push({ check: 'deck-backup-missing', severity: 'warning', message: 'The deck has no backup slides. Add two or three for likely questions (process detail, a metric, a rejected option) after the close, marked data-od-backup.' });
  if (length && slides.length > 0 && noMinutes.length < slides.length - backups) {
    const off = sum - length;
    if (Math.abs(off) > length * TIMING_TOLERANCE) {
      const rounded = Math.round(Math.abs(off) * 10) / 10;
      findings.push({
        check: 'deck-timing',
        severity: 'warning',
        message: `The slides' minute budgets add up to ${Math.round(sum * 10) / 10} minutes for a ${length}-minute talk, so the talk runs ${rounded} minutes ${off > 0 ? 'over' : 'under'}. ${off > 0 ? 'Cut or shorten slides, or move detail to backup slides' : 'Give the decisions more time, or add a slide'}; count the panel's questions inside each project's time.`,
      });
    }
  }
  return findings;
}

/** Library-backed findings on one page: internal pictures, alt text, case-study length and summary, page weight. */
export async function portfolioPageFindings(input: { workspaceRoot: string; outputDir: string; entryPath: string; html: string; record: PortfolioRecord }): Promise<Finding[]> {
  const $ = load(input.html);
  const findings: Finding[] = [];
  const library: Library | undefined = await readLibrary(input.workspaceRoot, input.outputDir).catch(() => undefined);
  const slugs = new Set(input.record.projects);
  $('[data-od-asset]').each((_, el) => {
    slugs.add(($(el).attr('data-od-asset') ?? '').split('/')[0]);
  });
  const caseStudy = $('[data-od-case-study]').first().attr('data-od-case-study');
  if (caseStudy) slugs.add(caseStudy);
  $('img[src]').each((_, el) => {
    const m = /(?:^|\/)media\/([a-z0-9-]+)\//.exec($(el).attr('src') ?? '');
    if (m) slugs.add(m[1]);
  });
  const projects = await loadProjects(input.workspaceRoot, input.outputDir, [...slugs].filter(Boolean));

  // Nothing internal: a project, or a picture by its data-od-asset or its copied file name.
  for (const [slug, p] of projects) {
    if (p.privacy === 'internal' && (input.record.projects.includes(slug) || caseStudy === slug)) {
      findings.push({ check: 'portfolio-internal', severity: 'error', message: `"${p.title}" is internal in the work library, so it can't be in a portfolio. Remove it, or change its privacy with save_open_design_project if the designer may show it.` });
    }
  }
  const reported = new Set<string>();
  const reportInternal = (p: Project, assetId: string, selector: string) => {
    if (reported.has(`${p.slug}/${assetId}`)) return;
    reported.add(`${p.slug}/${assetId}`);
    findings.push({ check: 'portfolio-internal', severity: 'error', message: `The picture ${p.slug}/${assetId} is internal in the work library, so it can't be shown. Remove it from the page.`, selector });
  };
  $('img, video, source').each((_, el) => {
    const ref = $(el).attr('data-od-asset');
    const src = $(el).attr('src') ?? '';
    if (ref) {
      const [slug, id] = ref.split('/');
      const p = projects.get(slug);
      const asset = p?.assets.find((a) => a.id === id);
      if (p && asset && assetPrivacy(p, asset) === 'internal') reportInternal(p, id, `[data-od-asset="${ref}"]`);
      if (p && asset && el.tagName === 'img') {
        const alt = $(el).attr('alt');
        if (!alt || !alt.trim()) findings.push({ check: 'portfolio-alt-missing', severity: 'warning', message: `${ref} has no alt text. Use the library's alt text for it.`, selector: `[data-od-asset="${ref}"]` });
        else if (!asset.alt || asset.altDraft) findings.push({ check: 'portfolio-alt-draft', severity: 'warning', message: `The alt text of ${ref} is still a draft. Ask the designer to confirm it (save_open_design_project with confirmAlt) before publishing.`, selector: `[data-od-asset="${ref}"]` });
      }
      return;
    }
    const m = /(?:^|\/)media\/([a-z0-9-]+)\/([^/?#]+)$/.exec(src);
    if (m) {
      const p = projects.get(m[1]);
      const base = m[2].replace(/(?:-\d+)?\.(?:webp|png|jpe?g|gif)$/i, '');
      const asset = p?.assets.find((a) => path.posix.basename(a.file).replace(/\.[^.]+$/, '') === base || a.id === base || (a.variants ?? []).some((v) => path.posix.basename(v.file) === m[2]));
      if (p && asset && assetPrivacy(p, asset) === 'internal') reportInternal(p, asset.id, `img[src="${src}"]`);
    }
    if (el.tagName === 'img' && $(el).attr('alt') === undefined) findings.push({ check: 'portfolio-alt-missing', severity: 'warning', message: `An image (${src || 'no src'}) has no alt attribute. Describe what it shows, or use alt="" for a purely decorative one.`, selector: src ? `img[src="${src}"]` : 'img' });
  });

  // A case study: summary with role and outcome first, body within the length range.
  if (caseStudy) {
    const p = projects.get(caseStudy);
    const summary = $('[data-od-summary]').first();
    if (summary.length === 0) {
      findings.push({ check: 'portfolio-summary', severity: 'warning', message: 'This case study has no summary. Start it with a short block marked data-od-summary: role, team, dates and the main outcome, so a reviewer gets the project in ten seconds.' });
    } else if (p) {
      const text = summary.text().replace(/\s+/g, ' ').toLowerCase();
      const missing: string[] = [];
      if (!text.includes(p.role.toLowerCase())) missing.push(`the role ("${p.role}")`);
      const outcome = summary.find('[data-od-outcome]').length > 0 || (p.outcomes ?? []).some((o) => (o.value && text.includes(o.value.toLowerCase())) || text.includes(o.text.toLowerCase()));
      if (!outcome && (p.outcomes?.length ?? 0) > 0) missing.push('an outcome');
      if (missing.length) findings.push({ check: 'portfolio-summary', severity: 'warning', message: `The summary doesn't show ${missing.join(' or ')}. Put them in the data-od-summary block, from the library.`, selector: '[data-od-summary]' });
    }
    const count = words(bodyText($));
    if (count < CASE_STUDY_WORDS.min || count > CASE_STUDY_WORDS.max) {
      findings.push({
        check: 'portfolio-case-study-length',
        severity: 'warning',
        message: `The case study's body is ${count} words; aim for ${CASE_STUDY_WORDS.min} to ${CASE_STUDY_WORDS.max}. ${count < CASE_STUDY_WORDS.min ? 'Say more about the decisions and what was rejected, from the library, or ask the designer for more.' : 'Cut the background and keep the decisions and outcome.'}`,
      });
    }
  }

  const weight = await pageWeight(input.workspaceRoot, input.entryPath, input.html, $);
  if (weight > PAGE_WEIGHT_BUDGET) {
    findings.push({ check: 'portfolio-page-weight', severity: 'warning', message: `The page and the files it loads weigh ${(weight / 1024 / 1024).toFixed(1)} MB; keep a portfolio page under ${PAGE_WEIGHT_BUDGET / 1024 / 1024} MB. Use the 800 or 1400 px variants with srcset, and loading="lazy" below the first screen.` });
  }
  if (!library) findings.push({ check: 'portfolio-library-missing', severity: 'info', message: 'The work library is missing, so pictures and facts could not be checked against it.' });
  return findings;
}

/** The live product links on a page: `data-od-live`, or the library's `live` links. */
export function liveLinksOf(html: string, projects: Project[]): string[] {
  const $ = load(html);
  const known = new Set(projects.flatMap((p) => (p.links ?? []).filter((l) => l.kind === 'live').map((l) => l.url)));
  const out = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (!/^https?:\/\//i.test(href)) return;
    if ($(el).is('[data-od-live]') || known.has(href)) out.add(href);
  });
  return [...out].slice(0, MAX_LINKS_CHECKED);
}

/** Live links that don't resolve, as warnings. A HEAD first, then a GET for servers that refuse HEAD. */
export async function liveLinkFindings(urls: string[], fetchImpl: typeof fetch = fetch, timeoutMs = LINK_TIMEOUT_MS): Promise<Finding[]> {
  const findings: Finding[] = [];
  await Promise.all(
    urls.map(async (url) => {
      const attempt = async (method: string): Promise<number | string> => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          const res = await fetchImpl(url, { method, redirect: 'follow', signal: ctrl.signal });
          return res.status;
        } catch (err) {
          return ctrl.signal.aborted ? `no answer within ${timeoutMs / 1000} s` : err instanceof Error ? err.message : String(err);
        } finally {
          clearTimeout(timer);
        }
      };
      let result = await attempt('HEAD');
      if (typeof result === 'number' && (result === 405 || result === 403 || result === 501)) result = await attempt('GET');
      if (typeof result === 'number' && result < 400) return;
      findings.push({ check: 'portfolio-link-broken', severity: 'warning', message: `The live link ${url} ${typeof result === 'number' ? `answers ${result}` : `didn't resolve (${result})`}. Fix the link, or take it out if the product is gone.`, selector: `a[href="${url}"]` });
    }),
  );
  return findings;
}

/**
 * Runs in the page: whether the first screen shows the designer's name, role,
 * a contact link and the top of the first project card. Returns what's missing.
 */
export function collectFirstScreen(expect: { name?: string; role?: string }): string[] {
  const h = window.innerHeight;
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && r.top < h && r.bottom > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
  };
  const textOnScreen = (needle: string): boolean => {
    const n = needle.toLowerCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    let seen = '';
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || !visible(parent)) continue;
      seen += ' ' + (node.textContent ?? '');
      if (seen.toLowerCase().replace(/\s+/g, ' ').includes(n)) return true;
    }
    return false;
  };
  const missing: string[] = [];
  if (expect.name && !textOnScreen(expect.name)) missing.push(`the designer's name ("${expect.name}")`);
  if (expect.role && !textOnScreen(expect.role)) missing.push(`their role ("${expect.role}")`);
  const contacts = Array.from(document.querySelectorAll('a[href^="mailto:"], a[data-od-contact], a[href*="linkedin.com"], a[href*="contact"]'));
  if (!contacts.some(visible)) missing.push('a contact link');
  const card = document.querySelector('[data-od-project-card]');
  if (!card) missing.push('a project card (mark each one data-od-project-card)');
  else if (card.getBoundingClientRect().top >= h) missing.push('the top of the first project card');
  return missing;
}

export function firstScreenFinding(viewport: { name: string; width: number; height: number }, missing: string[]): Finding | undefined {
  if (missing.length === 0) return undefined;
  return {
    check: 'portfolio-first-screen',
    severity: 'warning',
    message: `At ${viewport.name} size (${viewport.width}×${viewport.height}) the first screen doesn't show ${missing.join(', ')}. A reviewer decides in the first few seconds: put the name, role, a contact link and the start of the first project above the fold.`,
  };
}
