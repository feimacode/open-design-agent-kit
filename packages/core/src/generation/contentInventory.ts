/// <reference lib="dom" />
// A website's own content, copied verbatim for a redesign (openspec
// add-redesign-from-url): headings, body copy, calls to action, navigation,
// contact details, opening hours, prices and images, in reading order, each
// with the page and a selector it came from. Written as content.json in the
// extraction bundle when extract_open_design_design_system is called with
// `content: true`, and bound into the redesign with data-od-bind like any
// sample data file. Nothing is summarized or invented here.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { liveSlug } from '../export/livePage';

export const CONTENT_FILE = 'content.json';
const MAX_BLOCKS = 120;
const MAX_IMAGES = 40;
const MAX_TEXT = 1200;

export interface ContentImage {
  src: string;
  alt?: string;
  width: number;
  height: number;
  selector: string;
  /** Workspace-relative copy, only when the images were localized. */
  local?: string;
}

export interface PageContent {
  url: string;
  title: string;
  description?: string;
  headings: Array<{ level: number; text: string; selector: string }>;
  /** Body copy in reading order: paragraphs, list items, quotes. */
  blocks: Array<{ kind: 'paragraph' | 'item' | 'quote'; text: string; selector: string }>;
  ctas: Array<{ text: string; href?: string; selector: string }>;
  nav: Array<{ text: string; href?: string }>;
  contact: { phones: string[]; emails: string[]; addresses: string[] };
  hours: string[];
  prices: Array<{ text: string; selector: string }>;
  images: ContentImage[];
}

export interface ContentInventory {
  site: string;
  capturedAt: string;
  pages: PageContent[];
}

/** In-page: the page's content. Self-contained, for page.evaluate. */
export function readContentInventory(): Omit<PageContent, 'url'> {
  const doc = document;
  const max = { blocks: 120, images: 40, text: 1200 };
  const clean = (s: string | null | undefined): string => String(s || '').replace(/\s+/g, ' ').trim();
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[aria-hidden="true"], [data-od-hidden-consent], script, style, noscript, template');
  };
  const selectorFor = (el: Element): string => {
    const part = (e: Element): string => {
      if (e.id && /^[A-Za-z][\w-]*$/.test(e.id)) return `#${e.id}`;
      const cls = Array.from(e.classList).filter((c) => /^[A-Za-z_][\w-]*$/.test(c) && c.length < 40).slice(0, 2);
      const tag = e.tagName.toLowerCase();
      const parent = e.parentElement;
      const nth = parent ? Array.from(parent.children).filter((c) => c.tagName === e.tagName).indexOf(e) : -1;
      return tag + cls.map((c) => `.${c}`).join('') + (cls.length === 0 && nth > 0 ? `:nth-of-type(${nth + 1})` : '');
    };
    const parts: string[] = [];
    let e: Element | null = el;
    while (e && e !== doc.body && parts.length < 4) {
      parts.unshift(part(e));
      if (e.id) break;
      e = e.parentElement;
    }
    return parts.join(' > ') || el.tagName.toLowerCase();
  };
  const cut = (s: string): string => (s.length > max.text ? s.slice(0, max.text) : s);

  const headings: PageContent['headings'] = [];
  for (const el of Array.from(doc.querySelectorAll('h1, h2, h3, h4'))) {
    const text = clean((el as HTMLElement).innerText);
    if (!text || !visible(el)) continue;
    headings.push({ level: Number(el.tagName.slice(1)), text: cut(text), selector: selectorFor(el) });
  }

  const blocks: PageContent['blocks'] = [];
  const seen = new Set<string>();
  for (const el of Array.from(doc.querySelectorAll('p, li, blockquote, dd'))) {
    if (blocks.length >= max.blocks) break;
    if (!visible(el) || el.closest('nav, header nav, footer nav, form, button, a[role="button"]')) continue;
    if (el.tagName === 'LI' && el.closest('nav')) continue;
    const text = clean((el as HTMLElement).innerText);
    if (text.length < 2 || seen.has(text)) continue;
    // A paragraph inside a list item is the item's text: keep one.
    if (el.tagName === 'P' && el.closest('li') && seen.has(clean((el.closest('li') as HTMLElement).innerText))) continue;
    seen.add(text);
    blocks.push({ kind: el.tagName === 'LI' || el.tagName === 'DD' ? 'item' : el.tagName === 'BLOCKQUOTE' ? 'quote' : 'paragraph', text: cut(text), selector: selectorFor(el) });
  }

  const ctas: PageContent['ctas'] = [];
  for (const el of Array.from(doc.querySelectorAll('a[href], button, [role="button"], input[type="submit"]'))) {
    if (ctas.length >= 30 || !visible(el) || el.closest('nav')) continue;
    const text = clean((el as HTMLElement).innerText || (el as HTMLInputElement).value || el.getAttribute('aria-label'));
    if (!text || text.length > 60) continue;
    const cs = getComputedStyle(el);
    const filled = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
    const looksLikeButton = el.tagName !== 'A' || filled || /btn|button|cta/i.test(String((el as HTMLElement).className || '')) || el.getAttribute('role') === 'button';
    if (!looksLikeButton) continue;
    const href = el.getAttribute('href') || undefined;
    ctas.push({ text, ...(href ? { href: (el as HTMLAnchorElement).href || href } : {}), selector: selectorFor(el) });
  }

  const nav: PageContent['nav'] = [];
  const navRoot = doc.querySelector('header nav, nav, [role="navigation"]');
  if (navRoot) {
    for (const a of Array.from(navRoot.querySelectorAll('a[href]'))) {
      const text = clean((a as HTMLElement).innerText || a.getAttribute('aria-label'));
      if (!text || nav.some((n) => n.text === text)) continue;
      nav.push({ text, href: (a as HTMLAnchorElement).href });
      if (nav.length >= 15) break;
    }
  }

  const bodyText = (doc.body ? doc.body.innerText : '') || '';
  const lines = bodyText.split(/\n+/).map(clean).filter(Boolean);
  const uniq = (xs: string[]): string[] => Array.from(new Set(xs)).slice(0, 10);
  const phones = uniq([
    ...Array.from(doc.querySelectorAll('a[href^="tel:"]')).map((a) => clean(a.getAttribute('href')!.slice(4))),
    ...(bodyText.match(/(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]\d{2,4}[\s.-]\d{2,5}/g) || []).map(clean).filter((p) => p.replace(/\D/g, '').length >= 7),
  ]);
  const emails = uniq([
    ...Array.from(doc.querySelectorAll('a[href^="mailto:"]')).map((a) => clean(a.getAttribute('href')!.slice(7).split('?')[0])),
    ...(bodyText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []),
  ]);
  const addresses = uniq([
    ...Array.from(doc.querySelectorAll('address, [itemprop="address"], [class*="address" i]')).map((el) => clean((el as HTMLElement).innerText)),
    ...lines.filter((l) => l.length < 120 && /\b\d{1,5}\s+\p{L}[\p{L}.' -]+\b(street|st\.?|road|rd\.?|avenue|ave\.?|lane|way|drive|via|strasse|straße|rue|calle|place|square)\b|\b(via|rue|calle|strada|piazza)\s+\p{L}+.*\d/iu.test(l)),
  ]).filter(Boolean);
  const day = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|\b(lun|mar|mer|gio|ven|sab|dom)[a-z]*\b|\b(mo|di|mi|do|fr|sa|so)\b/i;
  const time = /\b\d{1,2}(:\d{2})?\s*(am|pm|h)?\b\s*(-|–|to|until|bis|alle)\s*\d{1,2}(:\d{2})?/i;
  const hours = uniq(lines.filter((l) => l.length < 120 && day.test(l) && (time.test(l) || /closed|geschlossen|chiuso|fermé/i.test(l))));

  const prices: PageContent['prices'] = [];
  const priceRe = /(?:[€$£¥]|\b(?:EUR|USD|GBP|CHF|AUD|CAD)\b)\s?\d[\d.,]*|\d[\d.,]*\s?(?:[€$£¥]|\b(?:EUR|USD|GBP|CHF)\b)/;
  for (const el of Array.from(doc.querySelectorAll('li, p, td, dd, span, div'))) {
    if (prices.length >= 60) break;
    if (el.children.length > 3 || !visible(el)) continue;
    const text = clean((el as HTMLElement).innerText);
    if (!text || text.length > 160 || !priceRe.test(text)) continue;
    if (prices.some((p) => p.text === text || p.text.includes(text) || text.includes(p.text))) continue;
    prices.push({ text, selector: selectorFor(el) });
  }

  const images: ContentImage[] = [];
  for (const img of Array.from(doc.querySelectorAll('img')) as HTMLImageElement[]) {
    if (images.length >= max.images) break;
    const r = img.getBoundingClientRect();
    if (r.width < 48 || r.height < 48 || !visible(img)) continue;
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith('data:')) continue;
    const alt = img.getAttribute('alt');
    images.push({ src, ...(alt !== null ? { alt: clean(alt) } : {}), width: Math.round(r.width), height: Math.round(r.height), selector: selectorFor(img) });
  }

  const description = clean(doc.querySelector('meta[name="description" i]')?.getAttribute('content'));
  return { title: clean(doc.title), ...(description ? { description } : {}), headings, blocks, ctas, nav, contact: { phones, emails, addresses }, hours, prices, images };
}

/** The Disallow and Allow rules that apply to every crawler (`User-agent: *`) in a robots.txt. */
export function parseRobots(text: string): { allow: string[]; disallow: string[] } {
  const allow: string[] = [];
  const disallow: string[] = [];
  let agents: string[] = [];
  let inRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (inRules) {
        agents = [];
        inRules = false;
      }
      agents.push(value.toLowerCase());
      continue;
    }
    if (key !== 'allow' && key !== 'disallow') continue;
    inRules = true;
    if (!agents.includes('*') || !value) continue;
    (key === 'allow' ? allow : disallow).push(value);
  }
  return { allow, disallow };
}

/** Whether robots rules disallow a path: the longest matching rule wins, Allow on a tie. `*` and `$` are supported. */
export function robotsDisallows(pathname: string, rules: { allow: string[]; disallow: string[] }): boolean {
  const match = (rule: string): number => {
    const re = new RegExp('^' + rule.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$|\$$/, '$'));
    return re.test(pathname) ? rule.length : -1;
  };
  const best = (list: string[]): number => list.reduce((m, r) => Math.max(m, match(r)), -1);
  const d = best(rules.disallow);
  return d >= 0 && d > best(rules.allow);
}

/** Fetches and parses a site's robots.txt; no rules when it is missing or unreadable. */
export async function fetchRobots(origin: string, fetchImpl: typeof fetch = fetch): Promise<{ allow: string[]; disallow: string[] }> {
  try {
    const res = await fetchImpl(new URL('/robots.txt', origin).toString(), { signal: AbortSignal.timeout(5000), redirect: 'follow' });
    if (!res.ok) return { allow: [], disallow: [] };
    return parseRobots((await res.text()).slice(0, 200_000));
  } catch {
    return { allow: [], disallow: [] };
  }
}

/** Caps an inventory page so content.json stays small. */
export function capPageContent(p: PageContent): PageContent {
  return { ...p, blocks: p.blocks.slice(0, MAX_BLOCKS), images: p.images.slice(0, MAX_IMAGES), headings: p.headings.map((h) => ({ ...h, text: h.text.slice(0, MAX_TEXT) })) };
}

// ── Redesign context for the brief ───────────────────────────────────────

export interface RedesignInput {
  /** The site being redesigned, as given to extraction and the audit. */
  site: string;
  /** True when the user owns the site or the work is commissioned: no concept ribbon. */
  owned?: boolean;
}

export interface RedesignContext {
  site: string;
  siteName: string;
  owned: boolean;
  contentPath: string;
  pages: Array<{ url: string; title: string; headings: number; blocks: number; images: number }>;
  auditPath?: string;
  findings: Array<{ id: string; title: string; where: string; fix: string }>;
}

/** The top 5 problem groups of a site's audit, as fixes for a redesign; undefined when the site wasn't audited. */
export async function loadAuditFixes(workspaceRoot: string, outputDir: string, site: URL): Promise<{ auditPath: string; findings: RedesignContext['findings'] } | undefined> {
  const auditPath = path.posix.join(outputDir, '.audits', liveSlug(site), 'audit.json');
  try {
    const audit = JSON.parse(await fs.readFile(path.join(workspaceRoot, auditPath), 'utf8')) as { groups?: Array<{ id: string; title: string; page: string; viewport: string; region: string; fix: string }> };
    const findings = (audit.groups ?? []).slice(0, 5).map((g) => {
      let where = g.page;
      try {
        where = new URL(g.page).pathname;
      } catch {
        // keep the page as given
      }
      return { id: g.id, title: g.title, where: `${where}, ${g.viewport}${g.region && g.region !== 'page' ? `, ${g.region}` : ''}`, fix: g.fix };
    });
    return { auditPath, findings };
  } catch {
    return undefined;
  }
}

/** Validates the brief's `redesign` input and loads the content inventory and audit for it. */
export async function loadRedesignContext(workspaceRoot: string, outputDir: string, input: unknown): Promise<{ ok: true; context: RedesignContext } | { ok: false; error: string }> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'redesign must be an object: { site, owned }.' };
  const r = input as Record<string, unknown>;
  if (typeof r.site !== 'string' || !r.site.trim()) return { ok: false, error: 'redesign.site is required: the address of the site being redesigned.' };
  if (r.owned !== undefined && typeof r.owned !== 'boolean') return { ok: false, error: 'redesign.owned must be true or false.' };
  let url: URL;
  try {
    url = new URL(r.site.trim());
  } catch {
    return { ok: false, error: `redesign.site "${r.site}" is not a URL.` };
  }
  const slug = liveSlug(url);
  const contentPath = path.posix.join(outputDir, '.extract', slug, CONTENT_FILE);
  let inventory: ContentInventory;
  try {
    inventory = JSON.parse(await fs.readFile(path.join(workspaceRoot, contentPath), 'utf8')) as ContentInventory;
  } catch {
    return { ok: false, error: `No content inventory for ${url.hostname} at ${contentPath}. Call extract_open_design_design_system with url "${url.toString()}" and content: true first.` };
  }
  const audit = await loadAuditFixes(workspaceRoot, outputDir, url);
  const auditPath = audit?.auditPath;
  const findings = audit?.findings ?? [];
  const auditFound = audit !== undefined;
  const siteName = inventory.pages[0]?.title?.split(/\s[|·–—-]\s/)[0]?.trim() || url.hostname.replace(/^www\./, '');
  return {
    ok: true,
    context: {
      site: url.toString(),
      siteName,
      owned: r.owned === true,
      contentPath,
      pages: inventory.pages.map((p) => ({ url: p.url, title: p.title, headings: p.headings.length, blocks: p.blocks.length, images: p.images.length })),
      auditPath: auditFound ? auditPath : undefined,
      findings,
    },
  };
}

/** The brief's redesign section: the inventory, the findings to fix, copy-edit and concept rules. */
export function composeRedesignSection(ctx: RedesignContext): string {
  const pages = ctx.pages.map((p) => `- ${p.url}: "${p.title}" (${p.headings} headings, ${p.blocks} blocks of copy, ${p.images} images)`).join('\n');
  const findings = ctx.findings.length
    ? `\n\n### Problems to fix\n\nThe audit of the current site (\`${ctx.auditPath}\`) found these. The new design must fix each one; the critic checks them as tasks.\n\n${ctx.findings.map((f) => `- **${f.id} ${f.title}** (${f.where}). ${f.fix}`).join('\n')}`
    : ctx.auditPath
      ? `\n\nThe audit of the current site (\`${ctx.auditPath}\`) found no problems to fix.`
      : '\n\nThe current site has not been audited. If the user wants problems fixed, not just a new look, call audit_open_design_site first and prepare this brief again.';
  const concept = ctx.owned
    ? 'The user owns this site or the work is commissioned: no concept ribbon. Put `data-od-owned` on <body> beside `data-od-redesign`, so the check knows.'
    : `This is a concept of a site the user doesn't own. Put this element first inside <body>, above the header, unchanged except the names. It is a plain band in the page flow, not fixed, so it never covers the content:\n\n\`\`\`html\n<aside data-od-concept role="note" style="display:block;margin:0;background:#111;color:#fff;font:600 12px/1.4 system-ui,sans-serif;padding:6px 16px;text-align:center">Concept by <span data-od-concept-designer>DESIGNER</span>, not affiliated with ${ctx.siteName}</aside>\n\`\`\`\n\nReplace DESIGNER with the user's name or studio if you know it, else "an independent designer". Remove it only when the user says the site is theirs or the client has commissioned the work, and then put \`data-od-owned\` on <body>. The check reports \`concept-unmarked\` for a redesign with neither.`;
  return `## Redesign of ${ctx.site}

Body: put \`data-od-redesign="${ctx.site}"\` on <body>, so the check, the critic and the before/after page can find the current site's audit.

### The site's own content

\`${ctx.contentPath}\` holds the site's content, copied verbatim with the page and selector it came from:

${pages}

Use it as the screen's data file: copy it to \`<name>.data.json\` beside a single page, or to \`_shared/data.json\` for several pages, and bind text with \`data-od-bind\` (e.g. \`data-od-bind="pages[0].headings[0].text"\`) and repeated items with \`data-od-repeat\`. Don't retype the copy, and don't invent business facts (prices, hours, people, awards) the inventory doesn't have. Images are the site's own URLs: use them as they are; copy them into the design only if the user says the site is theirs (extraction with \`localizeImages: true\`).

Restructure, don't mirror: take the content and the brand, not the old layout. Lead with what a visitor comes for (book, call, buy, find the place), and put it in the first screen on a phone.

### Copy edits

Keep the site's words. When a text must be shorter or clearer, put the new text in an element marked \`data-od-copy-edit\` and the original, verbatim, in \`data-od-original="…"\` on the same element. The check reports \`copy-edit-original-missing\` when an edit has no original, and the before/after page lists every edit.${findings}

### Concept marking

${concept}`;
}
