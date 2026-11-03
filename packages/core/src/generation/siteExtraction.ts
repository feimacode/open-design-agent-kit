/// <reference lib="dom" />
// Renders a website in an installed headless browser and measures its
// design system (openspec add-design-system-from-url): colour roles from the
// elements that carry them, forced :hover/:active states, declared custom
// properties, loaded fonts, text metrics, radii, spacing, container width
// and motion. Writes an evidence bundle (evidence.json, screenshots, role
// crops, marks) under <outputDir>/.extract/<slug>/ and returns a draft token
// set from evidenceToTokens.ts. Never writes DESIGN.md or tokens.css: the
// model does, from the draft, in the open-design-design-system-from-url skill.
//
// Polite by construction: http(s) only, no private or loopback hosts (also
// enforced on every subresource the page requests), at most 4 pages at 20 s
// each, no cookies, logins, form submissions or challenge solving. A page
// that shows a bot check, a login redirect or an empty body is reported as
// `blocked` with its screenshot.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Page } from 'puppeteer-core';
import { findBrowser } from '../export/browserDiscovery';
import {
  DESKTOP_VIEWPORT,
  MAX_EXTRA_URLS,
  MOBILE_VIEWPORT,
  PAGE_TIMEOUT_MS,
  blockedReason,
  gotoPage,
  hideConsentBanners,
  isBlockedHostLiteral,
  isPrivateAddress,
  launchLiveBrowser,
  liveSlug,
  registrableDomain,
  validateLiveUrls,
  type LiveBrowser,
} from '../export/livePage';
import { extractBrandEvidence, type BrandEvidence } from './brandExtraction';
import { CONTENT_FILE, capPageContent, fetchRobots, readContentInventory, robotsDisallows, type ContentInventory, type PageContent } from './contentInventory';
import {
  draftTokensCss,
  evidenceToTokens,
  type ColorRole,
  type DraftTokens,
  type PageEvidence,
  type RoleSample,
  type SiteEvidence,
} from './evidenceToTokens';

export { DESKTOP_VIEWPORT, MAX_EXTRA_URLS, MOBILE_VIEWPORT, PAGE_TIMEOUT_MS, isBlockedHostLiteral, isPrivateAddress, registrableDomain };
/** Kept under the extraction names. */
export const validateExtractionUrls = validateLiveUrls;
export const extractionSlug = liveSlug;

export type ExtractionTheme = 'light' | 'dark' | 'both';

export interface ExtractSiteInput {
  url: string;
  extraUrls?: string[];
  theme?: ExtractionTheme;
  workspaceRoot: string;
  /** Workspace-relative output folder (e.g. `.open-design`). */
  outputDir: string;
  /** Overrides browser discovery (tests). */
  executablePath?: string;
  /** The host's browser-path setting, tried before discovery (as checks and exports do). */
  browserPath?: string;
  /** Overrides DNS resolution (tests). */
  resolveHost?: (host: string) => Promise<string[]>;
  /** Hosts exempt from the private-address rules. Tests only, for a fixture server on 127.0.0.1; the tool never sets it. */
  allowHostsForTesting?: string[];
  /** Also copy each page's content (headings, copy, calls to action, contact, hours, prices, images) into content.json, for a redesign. Honours robots.txt. */
  content?: boolean;
  /** With content: copy the images the pages loaded into the bundle. Only when the user says the site is theirs. */
  localizeImages?: boolean;
  /** Overrides fetch for robots.txt (tests). */
  fetchImpl?: typeof fetch;
}

export interface BlockedPage {
  url: string;
  reason: string;
  /** Workspace-relative screenshot path. */
  screenshot?: string;
}

export type ExtractSiteResult =
  | { status: 'invalid-args'; error: string }
  | {
      status: 'ok' | 'partial' | 'blocked';
      slug: string;
      /** Workspace-relative evidence bundle folder. */
      bundleDir: string;
      draft?: DraftTokens;
      /** The draft as tokens.css text, to start from. */
      draftCss?: string;
      /** Workspace-relative screenshots, `<page>-<viewport>.png`. */
      screenshots: string[];
      blocked: BlockedPage[];
      /** Fetch-based candidates (no browser). */
      candidates?: BrandEvidence;
      /** Logo / favicon files copied into the bundle, workspace-relative. */
      marks: string[];
      /** Workspace-relative content.json, when content was asked for. */
      content?: string;
      notes: string[];
    };

// ── In-page measurement ─────────────────────────────────────────────────
// Serialized into the page by page.evaluate(), so it must be self-contained.

interface MeasuredPage extends Omit<PageEvidence, 'url'> {
  title: string;
  bodyTextLength: number;
  elementCount: number;
  challenge: boolean;
  /** Document-relative rects of the sampled role elements, for crops. */
  rects: Partial<Record<ColorRole | 'logo', { x: number; y: number; width: number; height: number }>>;
  logo?: { kind: 'svg'; markup: string } | { kind: 'img'; src: string };
  favicon?: string;
  stylesheetsUnreadable: number;
}

function measurePageInBrowser(): MeasuredPage {
  const MARK = 'data-od-extract';
  const doc = document;
  const win = window;
  const cs = (el: Element): CSSStyleDeclaration => win.getComputedStyle(el);
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    const s = cs(el);
    return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const transparent = (c: string): boolean => c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
  const selectorFor = (el: Element): string => {
    const part = (e: Element): string => {
      if (e.id && /^[A-Za-z][\w-]*$/.test(e.id)) return `#${e.id}`;
      const cls = Array.from(e.classList).filter((c) => /^[A-Za-z_][\w-]*$/.test(c) && c.length < 40).slice(0, 2);
      return e.tagName.toLowerCase() + cls.map((c) => `.${c}`).join('');
    };
    const parts: string[] = [];
    let e: Element | null = el;
    while (e && e !== doc.body && parts.length < 3) {
      parts.unshift(part(e));
      if (e.id) break;
      e = e.parentElement;
    }
    return parts.join(' > ') || el.tagName.toLowerCase();
  };
  const rectOf = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.left + win.scrollX), y: Math.max(0, r.top + win.scrollY), width: Math.min(r.width, 1440), height: Math.min(r.height, 900) };
  };
  const all = (sel: string): Element[] => {
    try {
      return Array.from(doc.querySelectorAll(sel)).filter(visible).slice(0, 400);
    } catch {
      return [];
    }
  };
  const tally = (els: Element[], read: (el: Element) => string | undefined, weight: (el: Element) => number = () => 1) => {
    const m = new Map<string, { count: number; el: Element; weight: number }>();
    for (const el of els) {
      const v = read(el);
      if (!v || transparent(v)) continue;
      const cur = m.get(v);
      const w = weight(el);
      if (cur) {
        cur.count++;
        cur.weight += w;
      } else m.set(v, { count: 1, el, weight: w });
    }
    return [...m].sort((a, b) => b[1].weight - a[1].weight);
  };

  const roles: MeasuredPage['roles'] = {};
  const rects: MeasuredPage['rects'] = {};
  const setRole = (role: ColorRole, value: string, el: Element, count: number) => {
    roles[role] = { value, selector: selectorFor(el), count };
    rects[role] = rectOf(el);
    el.setAttribute(`${MARK}-${role}`, '');
  };

  // Background: body, else html, else the canvas default (white).
  const bodyBg = cs(doc.body).backgroundColor;
  const htmlBg = cs(doc.documentElement).backgroundColor;
  const bgEl = !transparent(bodyBg) ? doc.body : !transparent(htmlBg) ? doc.documentElement : doc.body;
  const bg = !transparent(bodyBg) ? bodyBg : !transparent(htmlBg) ? htmlBg : 'rgb(255, 255, 255)';
  // App shells paint the real page background on a full-width wrapper: the
  // nearest such ancestor of what sits at the left edge, mid-viewport.
  let shell: Element | undefined;
  for (let el = doc.elementFromPoint(8, win.innerHeight / 2); el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
    if (el.getBoundingClientRect().width >= win.innerWidth * 0.95 && !transparent(cs(el).backgroundColor)) shell = el;
  }
  const useShell = shell !== undefined && transparent(bodyBg);
  const pageBg = useShell && shell ? cs(shell).backgroundColor : bg;
  setRole('bg', pageBg, useShell && shell ? shell : bgEl, 1);

  const area = (el: Element): number => {
    const r = el.getBoundingClientRect();
    return r.width * r.height;
  };
  const cards = all('[class*="card" i], article, aside, [class*="panel" i], [class*="tile" i], section, li, div').filter((el) => {
    const a = area(el);
    return a > 8000 && a < win.innerWidth * win.innerHeight * 1.5 && !transparent(cs(el).backgroundColor) && cs(el).backgroundColor !== pageBg;
  });
  const surface = tally(cards, (el) => cs(el).backgroundColor, (el) => Math.sqrt(area(el)) * (/card|panel|tile/i.test(el.className.toString()) ? 3 : 1))[0];
  if (surface) setRole('surface', surface[0], surface[1].el, surface[1].count);

  // Text roles count only colours readable on the page background: white
  // copy over a hero photo or a coloured band is not the site's body text.
  const luminance = (c: string): number => {
    const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((n) => {
      const v = Number(n) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  };
  const contrastOnPage = (c: string): number => {
    const [hi, lo] = [luminance(c), luminance(pageBg)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const readable = ([c]: [string, unknown]): boolean => contrastOnPage(c) >= 3;
  const textEls = all('p, li, td, dd, blockquote');
  const textWeight = (el: Element) => (el.textContent ?? '').trim().length;
  const fg = tally(textEls, (el) => cs(el).color, textWeight).find(readable) ?? tally([doc.body], (el) => cs(el).color)[0];
  if (fg) setRole('fg', fg[0], fg[1].el, fg[1].count);

  const mutedEls = all('small, figcaption, time, [class*="muted" i], [class*="secondary" i], [class*="caption" i], [class*="subtitle" i], [class*="meta" i], p, li');
  const muted = tally(mutedEls, (el) => cs(el).color, textWeight).find((entry) => entry[0] !== fg?.[0] && readable(entry));
  if (muted) setRole('muted', muted[0], muted[1].el, muted[1].count);

  const bordered = all('div, section, article, input, hr, li, table, td, th, header, nav, aside, button').filter((el) => parseFloat(cs(el).borderTopWidth) > 0 || parseFloat(cs(el).borderBottomWidth) > 0);
  const border = tally(bordered, (el) => (parseFloat(cs(el).borderTopWidth) > 0 ? cs(el).borderTopColor : cs(el).borderBottomColor)).find(([c]) => c !== fg?.[0]);
  if (border) setRole('border', border[0], border[1].el, border[1].count);

  // Accent: the most prominent filled button above the fold, else the link colour.
  const rgb = (c: string): number[] => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const saturation = (c: string): number => {
    const [r, g, b] = rgb(c).map((n) => n / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
  };
  const buttons = all('button, a[role="button"], [class*="btn" i], [class*="button" i], input[type="submit"], a[href]').filter((el) => {
    const bgc = cs(el).backgroundColor;
    const r = el.getBoundingClientRect();
    return !transparent(bgc) && bgc !== pageBg && bgc !== surface?.[0] && r.height >= 24 && r.height <= 120 && r.width <= 600 && (el.textContent ?? '').trim().length > 0;
  });
  const scored = buttons
    .map((el) => {
      const r = el.getBoundingClientRect();
      const fold = r.top + win.scrollY < win.innerHeight ? 2 : 1;
      const tag = /^(button|input)$/i.test(el.tagName) || /btn|button|cta|primary/i.test(el.className.toString()) ? 1.5 : 1;
      return { el, score: Math.sqrt(r.width * r.height) * fold * tag * (0.4 + saturation(cs(el).backgroundColor)) };
    })
    .sort((a, b) => b.score - a.score);
  const primary = scored[0]?.el;
  if (primary) {
    const value = cs(primary).backgroundColor;
    setRole('accent', value, primary, buttons.filter((b) => cs(b).backgroundColor === value).length);
    setRole('accent-on', cs(primary).color, primary, 1);
    primary.setAttribute(`${MARK}-primary`, '');
  } else {
    const links = tally(all('a[href]'), (el) => cs(el).color).find(([c]) => c !== fg?.[0]);
    if (links) setRole('accent', links[0], links[1].el, links[1].count);
  }

  // Text roles.
  const textRoles: MeasuredPage['textRoles'] = [];
  const px = (v: string): number | undefined => (v.endsWith('px') ? parseFloat(v) : undefined);
  const addText = (role: MeasuredPage['textRoles'][number]['role'], el: Element | undefined) => {
    if (!el) return;
    const s = cs(el);
    const size = px(s.fontSize);
    if (!size) return;
    textRoles.push({
      role,
      selector: selectorFor(el),
      fontFamily: s.fontFamily,
      fontSize: Math.round(size * 100) / 100,
      lineHeight: px(s.lineHeight),
      fontWeight: Number(s.fontWeight) || 400,
      letterSpacing: s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing),
    });
  };
  for (const h of ['h1', 'h2', 'h3', 'h4'] as const) addText(h, all(h)[0]);
  const bodyP = tally(all('p'), (el) => `${cs(el).fontSize}|${cs(el).fontFamily}`, textWeight)[0];
  addText('body', bodyP?.[1].el ?? doc.body);
  addText('small', all('small, [class*="small" i]')[0]);
  addText('caption', all('figcaption, [class*="caption" i]')[0]);
  addText('button', primary);
  addText('nav', all('nav a, header a')[0]);
  addText('code', all('code, pre, kbd')[0]);

  // Fonts the page actually loaded, with their @font-face sources where readable.
  const faceSources = new Map<string, string>();
  const customProperties: MeasuredPage['customProperties'] = { root: {}, themes: {} };
  let stylesheetsUnreadable = 0;
  const declsOf = (style: CSSStyleDeclaration): Record<string, string> => {
    const out: Record<string, string> = {};
    for (let i = 0; i < style.length; i++) {
      const name = style[i];
      if (name.startsWith('--')) out[name] = style.getPropertyValue(name).trim();
    }
    return out;
  };
  const themeSelector = /data-theme|data-mode|data-color-scheme|\.dark\b|\.theme-|\[class~?="?dark/i;
  const walk = (rules: CSSRuleList, media?: string) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) {
        const fam = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim().toLowerCase();
        if (fam && !faceSources.has(fam)) faceSources.set(fam, rule.style.getPropertyValue('src').slice(0, 300));
      } else if (rule instanceof CSSStyleRule) {
        const sel = rule.selectorText;
        const decls = declsOf(rule.style);
        if (Object.keys(decls).length === 0) continue;
        if (media && /prefers-color-scheme:\s*dark/i.test(media)) {
          const key = `@media (prefers-color-scheme: dark) ${sel}`;
          customProperties.themes[key] = { ...(customProperties.themes[key] ?? {}), ...decls };
        } else if (!media && /^(:root|html)$/i.test(sel.trim())) Object.assign(customProperties.root, decls);
        else if (themeSelector.test(sel)) customProperties.themes[sel] = { ...(customProperties.themes[sel] ?? {}), ...decls };
      } else if (rule instanceof CSSMediaRule) walk(rule.cssRules, rule.conditionText ?? rule.media.mediaText);
      else if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) walk((rule as CSSGroupingRule).cssRules, media);
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      walk(sheet.cssRules);
    } catch {
      stylesheetsUnreadable++;
    }
  }
  const fonts: MeasuredPage['fonts'] = [];
  doc.fonts.forEach((f) => {
    if (f.status !== 'loaded') return;
    const family = f.family.replace(/["']/g, '').trim();
    if (fonts.some((x) => x.family === family && x.weight === f.weight && x.style === f.style)) return;
    fonts.push({ family, weight: f.weight, style: f.style, source: faceSources.get(family.toLowerCase()) });
  });

  // Shape, spacing, layout, motion.
  const radiusEls: Array<[Element, 'button' | 'input' | 'card' | 'other']> = [
    ...buttons.slice(0, 40).map((el) => [el, 'button'] as [Element, 'button']),
    ...all('input:not([type="checkbox"]):not([type="radio"]), select, textarea').map((el) => [el, 'input'] as [Element, 'input']),
    ...cards.slice(0, 60).map((el) => [el, 'card'] as [Element, 'card']),
  ];
  const radiusTally = new Map<string, { px: number; count: number; kind: 'button' | 'input' | 'card' | 'other' }>();
  for (const [el, kind] of radiusEls) {
    const r = parseFloat(cs(el).borderTopLeftRadius);
    if (!(r > 0)) continue;
    const rounded = r >= 999 ? 9999 : Math.round(r);
    const key = `${kind}:${rounded}`;
    const cur = radiusTally.get(key);
    if (cur) cur.count++;
    else radiusTally.set(key, { px: rounded, count: 1, kind });
  }
  const spacingTally = new Map<number, number>();
  const snap = (v: string) => {
    const n = parseFloat(v);
    // Under 4px is a hairline nudge, not a spacing step.
    if (!(n >= 4) || n > 200) return;
    const s = Math.round(n / 2) * 2;
    spacingTally.set(s, (spacingTally.get(s) ?? 0) + 1);
  };
  for (const el of [...buttons.slice(0, 40), ...cards.slice(0, 80), ...all('section, main > *, [class*="container" i]').slice(0, 80)]) {
    const s = cs(el);
    snap(s.paddingTop);
    snap(s.paddingLeft);
    if (/flex|grid/.test(s.display)) {
      snap(s.rowGap);
      snap(s.columnGap);
    }
  }
  const widths = new Map<number, number>();
  for (const el of all('main, section > div, [class*="container" i], [class*="wrapper" i], [class*="content" i]')) {
    const mw = px(cs(el).maxWidth);
    if (mw && mw >= 600 && mw <= 2000) widths.set(mw, (widths.get(mw) ?? 0) + 1);
  }
  const containerMax = [...widths].sort((a, b) => b[1] - a[1])[0]?.[0];
  const durations = new Map<number, number>();
  const easings = new Map<string, number>();
  for (const el of [...buttons.slice(0, 40), ...all('a[href]').slice(0, 60), ...cards.slice(0, 40)]) {
    const s = cs(el);
    const ds = s.transitionDuration.split(',').map((d) => (d.trim().endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000));
    const es = s.transitionTimingFunction.split(/,(?![^(]*\))/).map((e) => e.trim());
    ds.forEach((ms, i) => {
      if (!(ms > 0)) return;
      const rounded = Math.round(ms);
      durations.set(rounded, (durations.get(rounded) ?? 0) + 1);
      const e = es[i] ?? es[0];
      if (e) easings.set(e, (easings.get(e) ?? 0) + 1);
    });
  }
  const shadowEl = surface?.[1].el;
  const cardShadow = shadowEl && cs(shadowEl).boxShadow !== 'none' ? cs(shadowEl).boxShadow : undefined;

  // Marks.
  let logo: MeasuredPage['logo'];
  const logoEl = all('header [class*="logo" i] svg, header [class*="logo" i] img, header a[href="/"] svg, header a[href="/"] img, [class*="logo" i] svg, [class*="logo" i] img, header svg, header img').find(
    (el) => el.getBoundingClientRect().top + win.scrollY < 240,
  );
  if (logoEl?.tagName.toLowerCase() === 'svg') {
    const markup = logoEl.outerHTML;
    if (markup.length < 200_000) logo = { kind: 'svg', markup };
  } else if (logoEl) {
    const src = (logoEl as HTMLImageElement).currentSrc || (logoEl as HTMLImageElement).src;
    if (src) logo = { kind: 'img', src };
  }
  if (logoEl) rects.logo = rectOf(logoEl);
  const iconLink = doc.querySelector('link[rel~="icon"], link[rel="apple-touch-icon"]') as HTMLLinkElement | null;

  const text = (doc.body.innerText ?? '').trim();
  const challenge =
    /just a moment|attention required|verify you are (a )?human|checking your browser|are you a robot|enable javascript and cookies|access denied|captcha/i.test(`${doc.title} ${text.slice(0, 2000)}`) ||
    !!doc.querySelector('#challenge-form, #cf-challenge-running, .cf-browser-verification, iframe[src*="captcha"], iframe[src*="challenges.cloudflare"], [class*="g-recaptcha"], #px-captcha');

  return {
    title: doc.title,
    bodyTextLength: text.length,
    elementCount: doc.body.getElementsByTagName('*').length,
    challenge,
    roles,
    rects,
    textRoles,
    fonts,
    customProperties,
    radii: [...radiusTally.values()],
    spacing: [...spacingTally].map(([v, count]) => ({ px: v, count })),
    containerMax,
    transitions: { durations: [...durations].map(([ms, count]) => ({ ms, count })), easings: [...easings].map(([value, count]) => ({ value, count })) },
    cardShadow,
    logo,
    favicon: iconLink?.href,
    stylesheetsUnreadable,
  };
}

/** Roles only, for the dark-theme pass. */
function measureRolesInBrowser(): Partial<Record<ColorRole, RoleSample>> {
  return (globalThis as unknown as { __odMeasure: () => MeasuredPage }).__odMeasure().roles;
}

// ── Browser session ──────────────────────────────────────────────────────

async function forcedStateColor(page: Page, state: 'hover' | 'active'): Promise<string | undefined> {
  const client = await page.createCDPSession();
  try {
    await client.send('DOM.enable');
    await client.send('CSS.enable');
    const { root } = await client.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-od-extract-primary]' });
    if (!nodeId) return undefined;
    // No transition, so the forced state's colour is read at once rather than mid-animation.
    await page.evaluate(() => {
      const el = document.querySelector('[data-od-extract-primary]') as HTMLElement | null;
      if (el) el.style.setProperty('transition', 'none', 'important');
    });
    await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: state === 'active' ? ['hover', 'active'] : ['hover'] });
    const value = await page.evaluate(() => {
      const el = document.querySelector('[data-od-extract-primary]');
      return el ? getComputedStyle(el).backgroundColor : undefined;
    });
    await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
    return value;
  } catch {
    return undefined;
  } finally {
    await client.detach().catch(() => undefined);
  }
}

async function cropRoles(page: Page, rects: MeasuredPage['rects'], dir: string, prefix: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await fs.mkdir(dir, { recursive: true });
  for (const [role, rect] of Object.entries(rects)) {
    if (!rect || rect.width < 2 || rect.height < 2) continue;
    const file = `${prefix}${role}.png`;
    try {
      await page.screenshot({ path: path.join(dir, file), clip: { x: rect.x, y: rect.y, width: Math.max(4, rect.width), height: Math.max(4, Math.min(rect.height, 600)) } });
      out[role] = file;
    } catch {
      // An element that scrolled out of reach just has no crop.
    }
  }
  return out;
}

const darkSignature = (roles: Partial<Record<ColorRole, RoleSample>>): string => `${roles.bg?.value}|${roles.fg?.value}`;

/** Renders the pages and measures them. Never throws for a site problem; reports it. */
export async function extractSite(input: ExtractSiteInput): Promise<ExtractSiteResult> {
  const valid = await validateLiveUrls(input.url, input.extraUrls ?? [], input.resolveHost, input.allowHostsForTesting);
  if (!valid.ok) return { status: 'invalid-args', error: valid.error };
  const [main] = valid.urls;
  const theme = input.theme ?? 'light';
  const slug = liveSlug(main);
  const bundleRel = path.posix.join(input.outputDir, '.extract', slug);
  const bundleDir = path.join(input.workspaceRoot, bundleRel);
  await fs.rm(bundleDir, { recursive: true, force: true });
  await fs.mkdir(path.join(bundleDir, 'crops'), { recursive: true });
  const rel = (file: string): string => path.posix.join(bundleRel, file);
  const notes: string[] = [];

  const browserPath = input.executablePath ?? (await findBrowser({ explicitPath: input.browserPath }).then((r) => (r.ok ? r.executablePath : undefined)));
  if (!browserPath) {
    const candidates = await extractBrandEvidence(main.toString());
    notes.push('No Chrome, Edge or Chromium browser was found, so only the page source was read: these are candidate colours and fonts, not measured roles. Install a browser or set OPEN_DESIGN_BROWSER_PATH for a full extraction.');
    await fs.writeFile(path.join(bundleDir, 'evidence.json'), JSON.stringify({ status: 'partial', url: main.toString(), candidates }, null, 2) + '\n');
    return { status: 'partial', slug, bundleDir: bundleRel, screenshots: [], blocked: [], candidates, marks: [], notes: [...notes, ...candidates.warnings] };
  }

  let live: LiveBrowser | undefined;
  const screenshots: string[] = [];
  const blocked: BlockedPage[] = [];
  const pages: PageEvidence[] = [];
  const marks: string[] = [];
  let dark: SiteEvidence['dark'];
  const contentPages: PageContent[] = [];
  const robots = input.content ? await fetchRobots(main.origin, input.fetchImpl) : undefined;
  try {
    live = await launchLiveBrowser(browserPath, input.allowHostsForTesting ?? [], 'od-extract-profile-');
    const { page, images } = live;

    for (const [i, url] of valid.urls.entries()) {
      const prefix = valid.urls.length > 1 ? `page-${i + 1}-` : '';
      await page.setViewport(DESKTOP_VIEWPORT);
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
      if (robots && robotsDisallows(url.pathname, robots)) {
        blocked.push({ url: url.toString(), reason: 'robots.txt disallows it' });
        continue;
      }
      try {
        await gotoPage(page, url.toString());
      } catch (err) {
        blocked.push({ url: url.toString(), reason: `the page didn't load (${err instanceof Error ? err.message.split('\n')[0] : String(err)})` });
        continue;
      }
      const desktopShot = `${prefix}desktop.png`;
      await page.screenshot({ path: path.join(bundleDir, desktopShot) });
      await page.evaluate(`globalThis.__odMeasure = ${measurePageInBrowser.toString()}`);
      const measured = (await page.evaluate('globalThis.__odMeasure()')) as MeasuredPage;
      const reason = blockedReason(url, page.url(), measured);
      if (reason) {
        blocked.push({ url: url.toString(), reason, screenshot: rel(desktopShot) });
        continue;
      }
      screenshots.push(rel(desktopShot));
      if (input.content) {
        await page.evaluate(hideConsentBanners).catch(() => 0);
        await page.evaluate(`globalThis.__odContent = ${readContentInventory.toString()}`);
        const content = (await page.evaluate('globalThis.__odContent()')) as Omit<PageContent, 'url'>;
        contentPages.push(capPageContent({ url: page.url() || url.toString(), ...content }));
      }

      if (measured.roles.accent && measured.rects['accent-on']) {
        for (const state of ['hover', 'active'] as const) {
          const value = await forcedStateColor(page, state);
          if (value && value !== measured.roles.accent.value) {
            measured.roles[`accent-${state}`] = { value, selector: `${measured.roles.accent.selector}:${state}`, count: 1, crop: undefined };
          }
        }
      }
      const crops = await cropRoles(page, measured.rects, path.join(bundleDir, 'crops'), prefix);
      for (const [role, sample] of Object.entries(measured.roles)) {
        const crop = crops[role.replace(/-(hover|active)$/, '')];
        if (sample && crop) sample.crop = `crops/${crop}`;
      }

      if (i === 0) {
        if (measured.logo?.kind === 'svg') {
          await fs.writeFile(path.join(bundleDir, 'logo.svg'), measured.logo.markup);
          marks.push(rel('logo.svg'));
        } else if (measured.logo?.kind === 'img') {
          const buf = images.get(measured.logo.src);
          const ext = /\.(svg|png|jpe?g|webp|gif)(\?|$)/i.exec(measured.logo.src)?.[1]?.toLowerCase().replace('jpeg', 'jpg') ?? 'png';
          if (buf) {
            await fs.writeFile(path.join(bundleDir, `logo.${ext}`), buf);
            marks.push(rel(`logo.${ext}`));
          } else if (crops.logo) marks.push(rel(`crops/${crops.logo}`));
        }
        const icon = measured.favicon ? images.get(measured.favicon) : undefined;
        if (icon && measured.favicon) {
          const ext = /\.(svg|png|ico|jpe?g|webp)(\?|$)/i.exec(measured.favicon)?.[1]?.toLowerCase() ?? 'png';
          await fs.writeFile(path.join(bundleDir, `favicon.${ext}`), icon);
          marks.push(rel(`favicon.${ext}`));
        }
        if (measured.stylesheetsUnreadable > 0) notes.push(`${measured.stylesheetsUnreadable} cross-origin stylesheet(s) couldn't be read, so their custom properties and @font-face sources are missing; computed values are unaffected.`);

        if (theme !== 'light') {
          const light = darkSignature(measured.roles);
          await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
          await gotoPage(page, url.toString());
          await page.evaluate(`globalThis.__odMeasure = ${measurePageInBrowser.toString()}`);
          let roles = (await page.evaluate(measureRolesInBrowser)) as Partial<Record<ColorRole, RoleSample>>;
          if (darkSignature(roles) !== light) {
            dark = { trigger: 'prefers-color-scheme', roles };
            await page.screenshot({ path: path.join(bundleDir, `${prefix}desktop-dark.png`) });
            screenshots.push(rel(`${prefix}desktop-dark.png`));
          } else {
            await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
            await page.evaluate(() => {
              document.documentElement.setAttribute('data-theme', 'dark');
              document.documentElement.classList.add('dark');
            });
            await new Promise((r) => setTimeout(r, 400));
            roles = (await page.evaluate(measureRolesInBrowser)) as Partial<Record<ColorRole, RoleSample>>;
            if (darkSignature(roles) !== light) {
              dark = { trigger: 'toggle', roles };
              await page.screenshot({ path: path.join(bundleDir, `${prefix}desktop-dark.png`) });
              screenshots.push(rel(`${prefix}desktop-dark.png`));
            } else notes.push('No dark theme was found: the site looks the same under prefers-color-scheme: dark and with a dark theme attribute on the root element. No dark values were returned.');
          }
          await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
        }
      }

      pages.push({
        url: url.toString(),
        roles: measured.roles,
        textRoles: measured.textRoles,
        fonts: measured.fonts,
        customProperties: measured.customProperties,
        radii: measured.radii,
        spacing: measured.spacing,
        containerMax: measured.containerMax,
        transitions: measured.transitions,
        cardShadow: measured.cardShadow,
      });

      await page.setViewport({ ...MOBILE_VIEWPORT, isMobile: true, hasTouch: true });
      await gotoPage(page, url.toString()).catch(() => undefined);
      const mobileShot = `${prefix}mobile.png`;
      await page.screenshot({ path: path.join(bundleDir, mobileShot) }).catch(() => undefined);
      screenshots.push(rel(mobileShot));
    }
  } catch (err) {
    notes.push(`The browser stopped early: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
  } finally {
    await live?.close();
  }

  const siteEvidence: SiteEvidence = { pages, dark };
  const draft = pages.length > 0 ? evidenceToTokens(siteEvidence) : undefined;
  if (draft && theme !== 'light' && dark && !draft.dark) notes.push('The dark theme changed nothing the draft measures, so no dark values were returned.');
  const status = pages.length === 0 ? 'blocked' : 'ok';
  let contentRel: string | undefined;
  if (input.content && contentPages.length > 0) {
    if (input.localizeImages) {
      const copied = await localizeContentImages(contentPages, live?.images ?? new Map(), bundleDir, bundleRel);
      if (copied.missing > 0) notes.push(`${copied.missing} image(s) weren't loaded by the page (lazy-loaded or too large), so they stay remote.`);
    }
    const inventory: ContentInventory = { site: main.toString(), capturedAt: new Date().toISOString(), pages: contentPages };
    await fs.writeFile(path.join(bundleDir, CONTENT_FILE), JSON.stringify(inventory, null, 2) + '\n');
    contentRel = rel(CONTENT_FILE);
  }
  await fs.writeFile(
    path.join(bundleDir, 'evidence.json'),
    JSON.stringify({ status, url: main.toString(), theme, measuredAt: new Date().toISOString(), ...siteEvidence, blocked, marks, notes, draft }, null, 2) + '\n',
  );
  return {
    status,
    slug,
    bundleDir: bundleRel,
    draft,
    draftCss: draft ? draftTokensCss(draft, `Draft measured from ${main.toString()} by extract_open_design_design_system`) : undefined,
    screenshots,
    blocked,
    marks,
    content: contentRel,
    notes,
  };
}

/** Copies the images the pages loaded into `<bundle>/images/`, recording each copy on its inventory entry. */
async function localizeContentImages(pages: PageContent[], images: Map<string, Buffer>, bundleDir: string, bundleRel: string): Promise<{ copied: number; missing: number }> {
  let copied = 0;
  let missing = 0;
  const done = new Map<string, string>();
  for (const p of pages) {
    for (const img of p.images) {
      const already = done.get(img.src);
      if (already) {
        img.local = already;
        continue;
      }
      const buf = images.get(img.src);
      if (!buf) {
        missing++;
        continue;
      }
      if (copied === 0) await fs.mkdir(path.join(bundleDir, 'images'), { recursive: true });
      const ext = /\.(svg|png|jpe?g|webp|gif|avif)(\?|$)/i.exec(img.src)?.[1]?.toLowerCase().replace('jpeg', 'jpg') ?? 'png';
      const name = `images/${String(++copied).padStart(2, '0')}.${ext}`;
      await fs.writeFile(path.join(bundleDir, name), buf);
      img.local = path.posix.join(bundleRel, name);
      done.set(img.src, img.local);
    }
  }
  return { copied, missing };
}

/** The tool's text: what was measured, from where, and what to do next. */
export function formatExtractSiteResult(result: ExtractSiteResult): string {
  if (result.status === 'invalid-args') return JSON.stringify({ status: 'invalid-args', error: result.error }, null, 2);
  const next =
    result.status === 'ok'
      ? 'Write DESIGN.md and tokens.css together from this draft, keeping every measured value as measured (the open-design-design-system-from-url skill has the steps). Unmeasured tokens are left to the contract fallbacks: omit them, don\'t invent them. Look at the screenshots before writing the prose.'
      : result.status === 'partial'
        ? 'Only fetch-based candidates are available. Use them as hints, ask the person to confirm the brand colour and font, or ask for a screenshot.'
        : 'Nothing could be measured. Show the person the screenshot and ask for the site\'s CSS, a screenshot of the page they mean, or another public page. Don\'t retry with other settings.';
  return JSON.stringify(
    {
      status: result.status,
      bundleDir: result.bundleDir,
      evidence: `${result.bundleDir}/evidence.json`,
      screenshots: result.screenshots,
      blocked: result.blocked,
      marks: result.marks,
      content: result.content,
      draft: result.draft ? { tokens: result.draft.tokens, dark: result.draft.dark, sources: result.draft.sources, unmeasured: result.draft.unmeasured } : undefined,
      draftCss: result.draftCss,
      candidates: result.candidates,
      notes: result.notes,
      next: result.content ? `${next} The site's content is in ${result.content}: for a redesign, pass redesign: { site } to prepare_open_design_brief, which binds it into the design.` : next,
    },
    null,
    2,
  );
}
