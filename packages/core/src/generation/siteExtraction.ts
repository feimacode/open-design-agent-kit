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
  hiddenConsentSelectors,
  hideConsentBanners,
  isBlockedHostLiteral,
  isPrivateAddress,
  launchLiveBrowser,
  liveSlug,
  registrableDomain,
  validateLiveUrls,
  type LiveBrowser,
} from '../export/livePage';
import { fetchSiteTexts, synthesizeBrandEvidence, type BrandEvidence } from './brandExtraction';
import type { BrandComponents, BrandFont, BrandImagery, BrandMark, BrandMotion, BrandVoice } from './brandKit';
import { captureBrandKitInBrowser, componentRects, componentSpecs, fontAvailability, markEntry, pickIcons, VOICE_MAX_CHARS, voiceFacts, type CapturedKit } from './brandKitCapture';
import { MOTION_RECORDER, honoursReducedMotion, movesOnLoadOrScroll, observeInteractions, readObservedMotion, summariseMotion, type MotionObservation } from './motionCapture';
import { CONTENT_FILE, capPageContent, fetchRobots, readContentInventory, robotsDisallows, type ContentInventory, type PageContent } from './contentInventory';
import {
  cssColorToHex,
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
  /** With no extraUrls: add up to 3 same-site pages from the home page's header and footer navigation (default true). */
  discover?: boolean;
  /** Test hook: fetches the page and stylesheets when there is no browser. */
  fetchSiteTexts?: typeof fetchSiteTexts;
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
      status: 'needs-figma-read';
      /** The Figma file the link names. */
      fileKey: string;
      nodeId?: string;
      link: string;
      /** What to read with the Figma connector, and how to call back. */
      instructions: string;
      notes: string[];
    }
  | {
      status: 'needs-canva-export';
      /** The Canva link as given. */
      link: string;
      /** The design id when the link names one (`D…`). */
      designId?: string;
      /** What to export with the Canva connector, and how to call back (openspec add-design-system-from-canva). */
      instructions: string;
      notes: string[];
    }
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
      /** Marks with variants, fonts with their source, component specs, voice and imagery (add-brand-kit-capture). */
      brandKit?: CapturedBrandKit;
      /** Colours the sources gave without a role (add-brand-from-screenshot-or-css). */
      sourceCandidates?: Array<{ value: string; label?: string; source: string }>;
      /** Accents 1–6 of a PowerPoint template's theme. */
      chartPalette?: string[];
      /** Pages added from the home page's navigation (no extraUrls given). */
      discovered?: string[];
      /** The three closest bundled design systems to the draft (add-nearest-design-system). */
      nearest?: Array<{ id: string; name: string; distance: number; compared: number; differs: string[] }>;
      /** What sets the draft apart from the bundled set, in plain words. */
      distinctive?: string[];
      notes: string[];
    };

/** The tool layer's answer for a Figma link, before the agent reads the file. */
export type FigmaReadResult = Extract<ExtractSiteResult, { status: 'needs-figma-read' }>;
/** The tool layer's answer for a Canva link, before the agent exports the design. */
export type CanvaExportResult = Extract<ExtractSiteResult, { status: 'needs-canva-export' }>;
/** What measuring a site returns: `extractSite` never asks for a Figma read or a Canva export. */
export type MeasuredSiteResult = Exclude<ExtractSiteResult, FigmaReadResult | CanvaExportResult>;
/** A result that is steps for the agent rather than a draft. */
export const isInstructionResult = (result: ExtractSiteResult): result is FigmaReadResult | CanvaExportResult =>
  result.status === 'needs-figma-read' || result.status === 'needs-canva-export';

export interface CapturedBrandKit {
  /** Paths relative to the evidence bundle. */
  marks: BrandMark[];
  fonts: BrandFont[];
  components: BrandComponents;
  voice: BrandVoice;
  imagery: BrandImagery;
  themeColor?: string;
  /** What moves, observed in the browser (add-runtime-motion). */
  motion?: BrandMotion;
}

// ── In-page measurement ─────────────────────────────────────────────────
// Serialized into the page by page.evaluate(), so it must be self-contained.

interface MeasuredPage extends Omit<PageEvidence, 'url' | 'dark' | 'hiddenOverlays'> {
  title: string;
  bodyTextLength: number;
  elementCount: number;
  challenge: boolean;
  /** Document-relative rects of the sampled role elements, for crops. */
  rects: Partial<Record<ColorRole | 'logo', { x: number; y: number; width: number; height: number }>>;
  logo?: { kind: 'svg'; markup: string } | { kind: 'img'; src: string };
  favicon?: string;
  stylesheetsUnreadable: number;
  /** Colours Chrome reported in a modern format (oklch(), lab(), color(display-p3 …)), by the rgb() value they were read as. */
  colorOriginals?: Record<string, string>;
  /** Colour values the page used that couldn't be read. */
  unreadColors?: string[];
  /** Document-relative rects of each accent candidate's best control, keyed accent-candidate-<n>. */
  candidateRects?: Record<string, { x: number; y: number; width: number; height: number }>;
  /** Rects of the first element with each radius (buttons, inputs, cards, featured), keyed radius-<kind>-<px>. */
  radiusRects?: Record<string, { x: number; y: number; width: number; height: number }>;
}

function measurePageInBrowser(): MeasuredPage {
  const MARK = 'data-od-extract';
  const doc = document;
  const win = window;
  // Chrome reports a colour in the format it was written in (oklch(), oklab(), lab(), lch(), hwb(), color(display-p3 …));
  // every colour read here is turned into rgb() by painting it on a 1×1 canvas, which also clips it to sRGB.
  const colorCanvas = doc.createElement('canvas');
  colorCanvas.width = 1;
  colorCanvas.height = 1;
  const cctx = colorCanvas.getContext('2d', { willReadFrequently: true });
  const colorCache = new Map<string, string>();
  const colorOriginals: Record<string, string> = {};
  const unreadColors = new Set<string>();
  const MODERN = /\b(?:oklch|oklab|lab|lch|hwb|color)\([^()]*\)/gi;
  const toLegacy = (value: string): string => {
    const hit = colorCache.get(value);
    if (hit) return hit;
    let out = value;
    if (cctx) {
      cctx.clearRect(0, 0, 1, 1);
      cctx.fillStyle = '#010203';
      cctx.fillStyle = value;
      if (String(cctx.fillStyle) === '#010203') unreadColors.add(value);
      else {
        cctx.fillRect(0, 0, 1, 1);
        const d = cctx.getImageData(0, 0, 1, 1).data;
        out = d[3] === 255 ? `rgb(${d[0]}, ${d[1]}, ${d[2]})` : `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${Math.round((d[3] / 255) * 1000) / 1000})`;
        colorOriginals[out] = value;
      }
    } else unreadColors.add(value);
    colorCache.set(value, out);
    return out;
  };
  const legacyColors = (v: string): string => (/(?:oklch|oklab|lab|lch|hwb|color)\(/i.test(v) ? v.replace(MODERN, toLegacy) : v);
  const cs = (el: Element, pseudo?: string): CSSStyleDeclaration => {
    const style = win.getComputedStyle(el, pseudo);
    return new Proxy(style, {
      get(target, prop) {
        const v = Reflect.get(target, prop) as unknown;
        if (typeof v === 'function') return (v as (...args: unknown[]) => unknown).bind(target);
        return typeof v === 'string' ? legacyColors(v) : v;
      },
    });
  };
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    const s = cs(el);
    return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const transparent = (c: string): boolean => c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
  // A gradient's first colour stop, which stands in for the fill when an element paints a gradient over a transparent colour.
  const firstStop = (image: string): string | undefined => (/gradient\(/.test(image) ? /rgba?\([^)]*\)/.exec(image)?.[0] : undefined);
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

  // Secondary text tiers: the next two readable, near-neutral text colours by
  // amount of text (links and coloured labels aren't text tiers).
  const neutral = (c: string): boolean => {
    const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((n) => Number(n) / 255);
    const max = Math.max(r, g, b);
    return max === 0 || (max - Math.min(r, g, b)) / max < 0.25;
  };
  const tiers = tally(all('p, li, td, dd, span, small, figcaption, time, label'), (el) => cs(el).color, textWeight)
    .filter((entry) => entry[0] !== fg?.[0] && entry[0] !== muted?.[0] && readable(entry) && neutral(entry[0]) && entry[1].weight >= 40)
    .slice(0, 2)
    .sort((a, b) => contrastOnPage(b[0]) - contrastOnPage(a[0]));
  const mutedContrast = muted ? contrastOnPage(muted[0]) : 0;
  if (tiers.length === 2) {
    setRole('fg-2', tiers[0][0], tiers[0][1].el, tiers[0][1].count);
    setRole('meta', tiers[1][0], tiers[1][1].el, tiers[1][1].count);
  } else if (tiers.length === 1) setRole(contrastOnPage(tiers[0][0]) > mutedContrast ? 'fg-2' : 'meta', tiers[0][0], tiers[0][1].el, tiers[0][1].count);

  const bordered = all('div, section, article, input, hr, li, table, td, th, header, nav, aside, button').filter((el) => parseFloat(cs(el).borderTopWidth) > 0 || parseFloat(cs(el).borderBottomWidth) > 0);
  const border = tally(bordered, (el) => (parseFloat(cs(el).borderTopWidth) > 0 ? cs(el).borderTopColor : cs(el).borderBottomColor)).find(([c]) => c !== fg?.[0]);
  if (border) setRole('border', border[0], border[1].el, border[1].count);
  const separators = all('tr, td, th, li, hr, [class*="divider" i], [class*="separator" i], [class*="row" i]').filter((el) => parseFloat(cs(el).borderTopWidth) > 0 || parseFloat(cs(el).borderBottomWidth) > 0);
  const soft = tally(separators, (el) => (parseFloat(cs(el).borderBottomWidth) > 0 ? cs(el).borderBottomColor : cs(el).borderTopColor)).find(([c]) => c !== border?.[0] && c !== fg?.[0]);
  if (soft) setRole('border-soft', soft[0], soft[1].el, soft[1].count);

  // Accent: the most prominent filled button above the fold, else the link colour.
  const rgb = (c: string): number[] => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const saturation = (c: string): number => {
    const [r, g, b] = rgb(c).map((n) => n / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
  };
  const fill = (el: Element): string => {
    const bgc = cs(el).backgroundColor;
    return transparent(bgc) ? (firstStop(cs(el).backgroundImage) ?? bgc) : bgc;
  };
  const buttons = all('button, a[role="button"], [class*="btn" i], [class*="button" i], input[type="submit"], a[href]').filter((el) => {
    const bgc = fill(el);
    const r = el.getBoundingClientRect();
    return !transparent(bgc) && bgc !== pageBg && bgc !== surface?.[0] && r.height >= 24 && r.height <= 120 && r.width <= 600 && (el.textContent ?? '').trim().length > 0;
  });
  // Ranked by colour, not by one button (add-accent-candidates): filled controls
  // are grouped by colour (OKLab distance under 0.05, about ΔE 4), and each
  // colour scores on its best control's size and fold, how many controls and
  // links use it, how colourful it is (near-black and grey count for little),
  // a declared --brand/--primary/--accent with that value, and the logo's colour.
  const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
  const oklab = (c: string): number[] => {
    const [r, g, b] = rgb(c).map((n) => {
      const v = n / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * q, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * q, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * q];
  };
  const chromaOf = (c: string): number => {
    const [, a, b] = oklab(c);
    return Math.hypot(a, b);
  };
  const colourful = (c: string): number => {
    const [L] = oklab(c);
    return clamp01((chromaOf(c) - 0.03) / 0.12) * clamp01((L - 0.2) / 0.25);
  };
  const near = (x: string, y: string): boolean => {
    const p = oklab(x);
    const q = oklab(y);
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 0.05;
  };
  const asRgb = (value: string): string | undefined => {
    let v = value.trim();
    if (!v) return undefined;
    if (/^[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(v)) v = `hsl(${v})`; // shadcn/ui v3 writes bare HSL components
    if (/^rgba?\(/.test(v)) return v;
    if (!cctx) return undefined;
    cctx.clearRect(0, 0, 1, 1);
    cctx.fillStyle = '#010203';
    cctx.fillStyle = v;
    if (String(cctx.fillStyle) === '#010203' && !/^#010203$/i.test(v)) return undefined;
    cctx.fillRect(0, 0, 1, 1);
    const d = cctx.getImageData(0, 0, 1, 1).data;
    return d[3] < 200 ? undefined : `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
  };
  type AccentGroup = { value: string; best?: { el: Element; score: number }; controls: number; links: number; declared?: string; logo: boolean; score: number };
  const groups: AccentGroup[] = [];
  const groupFor = (value: string): AccentGroup => {
    const found = groups.find((g) => near(g.value, value));
    if (found) return found;
    const g: AccentGroup = { value, controls: 0, links: 0, logo: false, score: 0 };
    groups.push(g);
    return g;
  };
  for (const el of buttons) {
    const r = el.getBoundingClientRect();
    const fold = r.top + win.scrollY < win.innerHeight ? 2 : 1;
    const tag = /^(button|input)$/i.test(el.tagName) || /btn|button|cta|primary/i.test(el.className.toString()) ? 1.5 : 1;
    const score = Math.sqrt(r.width * r.height) * fold * tag;
    const g = groupFor(fill(el));
    g.controls++;
    if (!g.best || score > g.best.score) g.best = { el, score };
  }
  for (const el of all('a[href]')) {
    if (buttons.includes(el)) continue;
    const c = cs(el).color;
    const g = groups.find((x) => near(x.value, c));
    if (g) g.links++;
  }
  // Declared brand properties on :root, resolved by the browser.
  const rootStyle = win.getComputedStyle(doc.documentElement);
  const brandNames = new Set<string>();
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (!(rule instanceof CSSStyleRule) || !/^(:root|html)$/i.test(rule.selectorText.trim())) continue;
        for (let i = 0; i < rule.style.length; i++) {
          const name = rule.style[i];
          if (/^--(?:[\w-]*-)?(brand|primary|accent)(?:-(?:color|colour|500|600|base|default))?$/i.test(name)) brandNames.add(name);
        }
      }
    } catch {
      // Cross-origin sheet: counted elsewhere.
    }
  }
  for (const name of brandNames) {
    const value = asRgb(rootStyle.getPropertyValue(name));
    if (!value || transparent(value)) continue;
    const g = groupFor(value);
    if (!g.declared || name.length < g.declared.length) g.declared = name;
  }
  // The logo's most used colourful fill, for an inline SVG logo.
  const logoSvg = all('header [class*="logo" i] svg, header a[href="/"] svg, [class*="logo" i] svg, header svg').find((el) => el.getBoundingClientRect().top + win.scrollY < 240);
  if (logoSvg) {
    const fills = tally(Array.from(logoSvg.querySelectorAll('path, rect, circle, polygon, ellipse')), (el) => cs(el).fill, (el) => {
      const r = el.getBoundingClientRect();
      return r.width * r.height;
    }).filter(([c]) => /^rgb/.test(c) && colourful(c) > 0.3);
    if (fills[0]) {
      const g = groups.find((x) => near(x.value, fills[0][0]));
      if (g) g.logo = true;
    }
  }
  for (const g of groups) {
    // A colour needs a filled control or a declaration behind it; a declared-only colour starts from a small button's size.
    if (!g.best && !g.declared) continue;
    g.score = (g.best?.score ?? 70) * (0.25 + colourful(g.value)) * (1 + 0.3 * Math.min(g.controls - 1, 5)) * (1 + 0.04 * Math.min(g.links, 10)) * (g.declared ? 1.6 : 1) * (g.logo ? 1.3 : 1);
  }
  const ranked = groups.filter((g) => g.score > 0).sort((a, b) => b.score - a.score);
  const accentCandidates: NonNullable<MeasuredPage['accentCandidates']> = [];
  const candidateRects: Record<string, { x: number; y: number; width: number; height: number }> = {};
  ranked.slice(0, 4).forEach((g, i) => {
    accentCandidates.push({ value: g.value, score: Math.round(g.score), chroma: Math.round(chromaOf(g.value) * 1000) / 1000, controls: g.controls, links: g.links, declared: g.declared, logo: g.logo || undefined, selector: g.best ? selectorFor(g.best.el) : undefined });
    if (g.best) candidateRects[`accent-candidate-${i + 1}`] = rectOf(g.best.el);
  });
  // Confidence from the gap between the top two: within 10% is a coin toss (≤ 0.25), a 40% lead or no rival is sure.
  let accentConfidence: number | undefined = ranked[0] ? (ranked[1] ? Math.round(clamp01(((ranked[0].score - ranked[1].score) / ranked[0].score) * 2.5) * 100) / 100 : 1) : undefined;
  const top = ranked[0];
  const primary = top?.best?.el;
  const gradients: NonNullable<MeasuredPage['gradients']> = [];
  if (top && primary) {
    setRole('accent', top.value, primary, top.controls);
    if (/gradient\(/.test(cs(primary).backgroundImage)) gradients.push({ role: 'accent', value: cs(primary).backgroundImage });
    setRole('accent-on', cs(primary).color, primary, 1);
    primary.setAttribute(`${MARK}-primary`, '');
  } else if (top?.declared) {
    // Declared but on no control: the colour, with no button to read states from.
    roles.accent = { value: top.value, selector: `:root ${top.declared}`, count: 0 };
  } else {
    const links = tally(all('a[href]'), (el) => cs(el).color).find(([c]) => c !== fg?.[0]);
    if (links) {
      setRole('accent', links[0], links[1].el, links[1].count);
      accentConfidence = 0.3;
    }
  }

  // Status colours, only from elements whose role, state or class names say
  // which status they show, and only saturated values (grey isn't a status).
  const statusOf = (el: Element): 'success' | 'warn' | 'danger' | undefined => {
    const key = `${el.getAttribute('role') ?? ''} ${el.className.toString()} ${el.id}`.toLowerCase();
    if (el.getAttribute('aria-invalid') === 'true' || /error|danger|invalid|destructive|negative/.test(key)) return 'danger';
    if (/success|positive/.test(key)) return 'success';
    if (/warn|caution/.test(key)) return 'warn';
    return undefined;
  };
  const statusTally = new Map<string, Map<string, { count: number; el: Element }>>();
  for (const el of all('[role="alert"], [role="status"], [aria-invalid="true"], [class*="error" i], [class*="danger" i], [class*="invalid" i], [class*="alert" i], [class*="success" i], [class*="warn" i], [class*="badge" i], [class*="toast" i], [class*="status" i]')) {
    const status = statusOf(el);
    if (!status) continue;
    const s = cs(el);
    const candidates = [s.backgroundColor, s.color, el.tagName === 'INPUT' ? s.borderTopColor : 'transparent'];
    const value = candidates.find((c) => !transparent(c) && saturation(c) > 0.3);
    if (!value) continue;
    const m = statusTally.get(status) ?? new Map();
    const cur = m.get(value);
    if (cur) cur.count++;
    else m.set(value, { count: 1, el });
    statusTally.set(status, m);
  }
  for (const [status, m] of statusTally) {
    const [value, { count, el }] = [...m].sort((a, b) => b[1].count - a[1].count)[0];
    setRole(status as ColorRole, value, el, count);
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
  type RadiusKind = 'button' | 'input' | 'card' | 'featured' | 'other';
  const viewportArea = win.innerWidth * win.innerHeight;
  const featured = all('img, video, picture, figure, section, article, aside, [class*="hero" i], [class*="feature" i], [class*="banner" i], [class*="media" i], div').filter((el) => area(el) >= viewportArea * 0.15 && area(el) <= viewportArea * 3);
  const radiusEls: Array<[Element, RadiusKind]> = [
    ...buttons.slice(0, 40).map((el) => [el, 'button'] as [Element, RadiusKind]),
    ...all('input:not([type="checkbox"]):not([type="radio"]), select, textarea').map((el) => [el, 'input'] as [Element, RadiusKind]),
    ...cards.filter((el) => area(el) < viewportArea * 0.15).slice(0, 60).map((el) => [el, 'card'] as [Element, RadiusKind]),
    ...featured.slice(0, 40).map((el) => [el, 'featured'] as [Element, RadiusKind]),
  ];
  const radiusTally = new Map<string, { px: number; count: number; kind: RadiusKind; selector?: string }>();
  const radiusRects: Record<string, { x: number; y: number; width: number; height: number }> = {};
  for (const [el, kind] of radiusEls) {
    const r = parseFloat(cs(el).borderTopLeftRadius);
    if (!(r > 0)) continue;
    const rounded = r >= 999 ? 9999 : Math.round(r);
    const key = `${kind}:${rounded}`;
    const cur = radiusTally.get(key);
    if (cur) cur.count++;
    else {
      radiusTally.set(key, { px: rounded, count: 1, kind, selector: kind === 'other' ? undefined : selectorFor(el) });
      if (kind !== 'other' && Object.keys(radiusRects).length < 8) radiusRects[`radius-${kind}-${rounded}`] = rectOf(el);
    }
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

  // Gutter: the inline padding of wide content containers. Section rhythm:
  // the most common vertical padding of top-level sections.
  const gutters = new Map<number, number>();
  for (const el of all('[class*="container" i], [class*="wrapper" i], [class*="inner" i], [class*="content" i], main, header > div, footer > div, section > div')) {
    const r = el.getBoundingClientRect();
    const pad = parseFloat(cs(el).paddingLeft);
    if (r.width < win.innerWidth * 0.5 || !(pad >= 8 && pad <= 120)) continue;
    const snapped = Math.round(pad / 2) * 2;
    gutters.set(snapped, (gutters.get(snapped) ?? 0) + 1);
  }
  let gutter = [...gutters].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  if (gutter === undefined) {
    // No padded container: the left edge of the first text block, when it's a plausible gutter.
    const block = all('main p, main h1, main h2, p, h1, h2')[0];
    const left = block ? Math.round(block.getBoundingClientRect().left) : 0;
    if (left >= 8 && left <= 48) gutter = left;
  }
  const sectionPads = new Map<number, number>();
  for (const el of all('main > section, main > div, body > section, body > main > section, [class*="section" i]')) {
    if (el.getBoundingClientRect().width < win.innerWidth * 0.9) continue;
    const s = cs(el);
    for (const v of [parseFloat(s.paddingTop), parseFloat(s.paddingBottom)]) {
      if (!(v >= 16 && v <= 240)) continue;
      const snapped = Math.round(v / 4) * 4;
      sectionPads.set(snapped, (sectionPads.get(snapped) ?? 0) + 1);
    }
  }
  const sectionY = [...sectionPads].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0];

  // The hero: the first full-width block near the top that paints something behind it.
  let hero: MeasuredPage['hero'];
  for (const el of all('[class*="hero" i], header + section, header + div, main > section:first-child, main > div:first-child, section')) {
    const r = el.getBoundingClientRect();
    if (r.top + win.scrollY > win.innerHeight || r.width < win.innerWidth * 0.6 || r.height < 200) continue;
    const image = cs(el).backgroundImage;
    if (/gradient\(/.test(image)) {
      hero = { background: 'gradient', value: image };
      gradients.push({ role: 'hero', value: image });
    } else if (/url\(/.test(image)) hero = { background: 'image' };
    else if (el.querySelector('video')) hero = { background: 'video' };
    if (hero) break;
  }
  if (surface && /gradient\(/.test(cs(surface[1].el).backgroundImage)) gradients.push({ role: 'surface', value: cs(surface[1].el).backgroundImage });

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
    gradients: gradients.length > 0 ? gradients : undefined,
    hero,
    layout: { desktop: { gutter, sectionY } },
    logo,
    favicon: iconLink?.href,
    stylesheetsUnreadable,
    colorOriginals: Object.keys(colorOriginals).length > 0 ? colorOriginals : undefined,
    unreadColors: unreadColors.size > 0 ? [...unreadColors].slice(0, 12) : undefined,
    accentCandidates: accentCandidates.length > 0 ? accentCandidates : undefined,
    accentConfidence,
    candidateRects,
    radiusRects,
  };
}

async function quietOverlays(page: Page, hidden: Set<string>): Promise<void> {
  await page.evaluate(hideConsentBanners).catch(() => 0);
  const found = (await page.evaluate(hiddenConsentSelectors).catch(() => [])) as string[];
  for (const sel of found) hidden.add(sel);
}

export const SCROLL_MAX_STEPS = 12;
export const SCROLL_MAX_MS = 8_000;
export const FULL_PAGE_MAX_HEIGHT = 6_000;

/** Scrolls the page in viewport steps so lazy and scroll-reveal content renders, then back to the top with reveal animations finished. */
async function scrollThrough(page: Page): Promise<void> {
  const started = Date.now();
  for (let i = 0; i < SCROLL_MAX_STEPS && Date.now() - started < SCROLL_MAX_MS; i++) {
    const atEnd = await page
      .evaluate(() => {
        const before = window.scrollY;
        window.scrollBy(0, window.innerHeight);
        return window.scrollY === before || window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      })
      .catch(() => true);
    await new Promise((r) => setTimeout(r, 150));
    if (atEnd) break;
  }
  await page
    .evaluate(() => {
      window.scrollTo(0, 0);
      // Reveal effects end in their final state; an endless animation can't finish and is left as it is.
      for (const a of document.getAnimations?.() ?? []) {
        try {
          a.finish();
        } catch {
          // Infinite iteration count.
        }
      }
    })
    .catch(() => undefined);
  await new Promise((r) => setTimeout(r, 200));
}

async function fullPageScreenshot(page: Page, file: string): Promise<boolean> {
  try {
    const height = (await page.evaluate(() => document.documentElement.scrollHeight)) as number;
    const viewport = page.viewport();
    await page.screenshot({ path: file, captureBeyondViewport: true, clip: { x: 0, y: 0, width: viewport?.width ?? DESKTOP_VIEWPORT.width, height: Math.max(1, Math.min(height, FULL_PAGE_MAX_HEIGHT)) } });
    return true;
  } catch {
    return false;
  }
}

/** Roles only, for the dark-theme pass. */
function measureRolesInBrowser(): Partial<Record<ColorRole, RoleSample>> {
  return (globalThis as unknown as { __odMeasure: () => MeasuredPage }).__odMeasure().roles;
}

// ── Browser session ──────────────────────────────────────────────────────

async function forcedStateColor(page: Page, state: 'hover' | 'active'): Promise<string | undefined> {
  return (await forcedStateStyle(page, state === 'active' ? ['hover', 'active'] : ['hover']))?.background;
}

/** The primary control's keyboard focus ring with :focus-visible forced, as a box-shadow value; undefined for the browser's own ring or none. */
async function forcedFocusRing(page: Page): Promise<string | undefined> {
  const rest = await page.evaluate(() => {
    const el = document.querySelector('[data-od-extract-primary]');
    return el ? getComputedStyle(el).boxShadow : undefined;
  });
  const focused = await forcedStateStyle(page, ['focus', 'focus-visible']);
  if (!focused) return undefined;
  if (focused.outlineStyle !== 'none' && focused.outlineStyle !== 'auto' && parseFloat(focused.outlineWidth) > 0) {
    const color = cssColorToHex(focused.outlineColor);
    if (color) return `0 0 0 ${Math.round(parseFloat(focused.outlineWidth) * 10) / 10}px ${color}`;
  }
  if (focused.boxShadow && focused.boxShadow !== 'none' && focused.boxShadow !== rest) return focused.boxShadow;
  return undefined;
}

async function forcedStateStyle(
  page: Page,
  forcedPseudoClasses: string[],
): Promise<{ background: string; outlineStyle: string; outlineWidth: string; outlineColor: string; boxShadow: string } | undefined> {
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
    await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses });
    const value = await page.evaluate(() => {
      const el = document.querySelector('[data-od-extract-primary]');
      if (!el) return undefined;
      const s = getComputedStyle(el);
      const fill = s.backgroundColor === 'rgba(0, 0, 0, 0)' ? (/(?:rgba?|oklch|oklab|lab|lch|hwb|color)\([^()]*\)/.exec(s.backgroundImage)?.[0] ?? s.backgroundColor) : s.backgroundColor;
      return { background: fill, outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, outlineColor: s.outlineColor, boxShadow: s.boxShadow };
    });
    await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
    return value;
  } catch {
    return undefined;
  } finally {
    await client.detach().catch(() => undefined);
  }
}

/** In-page: the links in the header, nav and footer, as absolute URLs. Self-contained, for page.evaluate. */
export function navLinksInBrowser(): string[] {
  const out: string[] = [];
  for (const a of Array.from(document.querySelectorAll('header a[href], nav a[href], footer a[href], [role="navigation"] a[href]'))) {
    const href = (a as HTMLAnchorElement).href;
    if (href && out.indexOf(href) < 0) out.push(href);
  }
  return out.slice(0, 300);
}

const NAV_SKIP = /(^|\/)(log-?in|sign-?in|sign-?up|signup|register|join|account|auth|sso|oauth|legal|privacy|terms|tos|cookies?|gdpr|imprint|impressum|careers?|jobs|cart|checkout|basket|search|status|contact-sales)(\/|$|\.|-)/i;
const NAV_PREFER: RegExp[] = [/(^|\/)(pricing|plans|prices)(\/|$)/i, /(^|\/)(product|products|features|platform|solutions|how-it-works)(\/|$)/i, /(^|\/)(about|about-us|company|story)(\/|$)/i, /(^|\/)(docs|documentation|blog|resources|guides|news)(\/|$)/i];

/**
 * Up to three same-site pages to measure besides the home page, from its
 * navigation links: pricing, then product or features, about, then docs or
 * blog, before any other page. Skips sign-in, sign-up, legal and careers
 * pages, files, and paths robots.txt disallows.
 */
export function pickNavPages(main: URL, hrefs: string[], robots?: Parameters<typeof robotsDisallows>[1]): string[] {
  const seen = new Set<string>([main.pathname.replace(/\/$/, '') || '/']);
  const candidates: Array<{ url: string; rank: number; order: number }> = [];
  hrefs.forEach((raw, order) => {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      return;
    }
    if (u.origin !== main.origin || !/^https?:$/.test(u.protocol)) return;
    const pathKey = u.pathname.replace(/\/$/, '') || '/';
    if (seen.has(pathKey) || NAV_SKIP.test(u.pathname) || /\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|xml|json|txt)$/i.test(u.pathname)) return;
    if (robots && robotsDisallows(u.pathname, robots)) return;
    seen.add(pathKey);
    const rank = NAV_PREFER.findIndex((re) => re.test(u.pathname));
    candidates.push({ url: `${u.origin}${u.pathname}`, rank: rank < 0 ? NAV_PREFER.length : rank, order });
  });
  return candidates
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, 3)
    .map((c) => c.url);
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
export async function extractSite(input: ExtractSiteInput): Promise<MeasuredSiteResult> {
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

  const found = await findBrowser({ explicitPath: input.browserPath });
  if (!found.ok && !input.executablePath) {
    // No browser: the page source and its stylesheets, read as html and css sources (roles from names only).
    const fetched = await (input.fetchSiteTexts ?? fetchSiteTexts)(main.toString());
    const candidates = fetched.base ? synthesizeBrandEvidence(fetched.base, fetched.html, fetched.stylesheets.map((s) => s.text), fetched.warnings) : { fetchedUrl: main.toString(), colors: [], fonts: [], warnings: fetched.warnings };
    notes.push('No Chrome, Edge or Chromium browser was found, so only the page source and its stylesheets were read: roles come from the names the CSS gives them, not from measuring. Install a browser or set OPEN_DESIGN_BROWSER_PATH for a full extraction.');
    const partial: Extract<ExtractSiteResult, { bundleDir: string }> = { status: 'partial', slug, bundleDir: bundleRel, screenshots: [], blocked: [], candidates, marks: [], notes: [...notes, ...candidates.warnings] };
    await fs.writeFile(path.join(bundleDir, 'evidence.json'), JSON.stringify({ version: 2, status: 'partial', url: main.toString(), candidates }, null, 2) + '\n');
    const textSources = [
      ...(fetched.html ? [{ kind: 'html' as const, text: fetched.html.slice(0, 2_000_000), name: 'page source' }] : []),
      ...fetched.stylesheets.map((s) => ({ kind: 'css' as const, text: s.text.slice(0, 2_000_000), name: path.posix.basename(new URL(s.url).pathname) || 'stylesheet' })),
    ];
    if (textSources.length === 0) return partial;
    const { extractFromSources } = await import('./sourceDraft');
    const merged = await extractFromSources({ workspaceRoot: input.workspaceRoot, outputDir: input.outputDir, sources: textSources, urlResult: partial });
    return { ...merged, status: 'partial' };
  }

  // In CDP mode found.executablePath is empty on purpose; the browser is reached via OPEN_DESIGN_BROWSER_URL.
  const browserPath = input.executablePath ?? (found.ok ? found.executablePath : '');

  let live: LiveBrowser | undefined;
  const screenshots: string[] = [];
  const blocked: BlockedPage[] = [];
  const pages: PageEvidence[] = [];
  const marks: string[] = [];
  const kitMarks: BrandMark[] = [];
  const voiceSamples: BrandVoice['samples'] = [];
  let kitComponents: BrandComponents = {};
  let kitImagery: BrandImagery = {};
  let themeColor: string | undefined;
  const stylesheets = new Set<string>();
  let firstLogo: string | undefined;
  let dark: SiteEvidence['dark'];
  let noDarkFound = false;
  const contentPages: PageContent[] = [];
  /** Each measured page's screenshots, so a redesign's base screen can be traced back to its page. */
  const pageShots: Array<{ url: string; desktop: string; mobile: string }> = [];
  const discovering = (input.extraUrls ?? []).length === 0 && input.discover !== false;
  const robots = input.content || discovering ? await fetchRobots(main.origin, input.fetchImpl) : undefined;
  const urls = [...valid.urls];
  const discovered: string[] = [];
  let motion: MotionObservation | undefined;
  let reducedRecorder: string | undefined;
  try {
    live = await launchLiveBrowser(browserPath, input.allowHostsForTesting ?? []);
    const { page, images } = live;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const prefix = valid.urls.length > 1 || i > 0 ? `page-${i + 1}-` : '';
      const wasDiscovered = i >= valid.urls.length;
      await page.setViewport(DESKTOP_VIEWPORT);
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
      if (robots && input.content && !wasDiscovered && robotsDisallows(url.pathname, robots)) {
        blocked.push({ url: url.toString(), reason: 'robots.txt disallows it' });
        continue;
      }
      // Motion on the first page: record animations from the first frame (add-runtime-motion).
      const recorder = i === 0 && !pages.length ? await page.evaluateOnNewDocument(MOTION_RECORDER).catch(() => undefined) : undefined;
      try {
        await gotoPage(page, url.toString());
      } catch (err) {
        if (recorder) await page.removeScriptToEvaluateOnNewDocument(recorder.identifier).catch(() => undefined);
        if (wasDiscovered) {
          notes.push(`${url.toString()} (found in the navigation) didn't load, so it wasn't measured.`);
          continue;
        }
        blocked.push({ url: url.toString(), reason: `the page didn't load (${err instanceof Error ? err.message.split('\n')[0] : String(err)})` });
        continue;
      }
      if (wasDiscovered) {
        const status = (await page.evaluate('(performance.getEntriesByType("navigation")[0] || {}).responseStatus || 0').catch(() => 0)) as number;
        if (status >= 400) {
          notes.push(`${url.toString()} (found in the navigation) answered ${status}, so it wasn't measured.`);
          continue;
        }
      }
      if (i === 0 && discovering) {
        const hrefs = (await page.evaluate(`(${navLinksInBrowser.toString()})()`).catch(() => [])) as string[];
        for (const next of pickNavPages(main, hrefs, robots)) {
          urls.push(new URL(next));
          discovered.push(next);
        }
      }
      // Overlays first, so a consent button can't become the accent; then a
      // scroll so lazy and scroll-reveal sections count; then overlays that
      // appeared on the way.
      const hidden = new Set<string>();
      await quietOverlays(page, hidden);
      if (recorder) await observeInteractions(page);
      await scrollThrough(page);
      if (recorder) {
        motion = await readObservedMotion(page);
        await page.removeScriptToEvaluateOnNewDocument(recorder.identifier).catch(() => undefined);
        if (movesOnLoadOrScroll(motion)) {
          // Once more under prefers-reduced-motion, then back to the page as a visitor sees it.
          await page.evaluateOnNewDocument(MOTION_RECORDER).then((r) => (reducedRecorder = r.identifier)).catch(() => undefined);
          motion.reducedMotion = await honoursReducedMotion(page, url.toString(), motion, gotoPage, scrollThrough);
          if (reducedRecorder) await page.removeScriptToEvaluateOnNewDocument(reducedRecorder).catch(() => undefined);
          await gotoPage(page, url.toString()).catch(() => undefined);
          await quietOverlays(page, hidden);
          await scrollThrough(page);
        }
      }
      await quietOverlays(page, hidden);
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
      const fullShot = `${prefix}full.png`;
      if (await fullPageScreenshot(page, path.join(bundleDir, fullShot))) screenshots.push(rel(fullShot));
      if (input.content) {
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
        measured.focusRing = await forcedFocusRing(page);
      }
      const crops = await cropRoles(page, measured.rects, path.join(bundleDir, 'crops'), prefix);
      // Radius crops only matter when pages are compared.
      if (urls.length > 1 && measured.radiusRects) {
        const radiusCrops = await cropRoles(page, measured.radiusRects as MeasuredPage['rects'], path.join(bundleDir, 'crops'), prefix);
        for (const r of measured.radii) {
          const file = radiusCrops[`radius-${r.kind}-${r.px}`];
          if (file) r.crop = `crops/${file}`;
        }
      }
      if (measured.accentCandidates && measured.candidateRects) {
        const candidateCrops = await cropRoles(page, measured.candidateRects as MeasuredPage['rects'], path.join(bundleDir, 'crops'), prefix);
        measured.accentCandidates.forEach((c, n) => {
          const file = candidateCrops[`accent-candidate-${n + 1}`];
          if (file) c.crop = `crops/${file}`;
        });
      }
      for (const [role, sample] of Object.entries(measured.roles)) {
        const crop = crops[role.replace(/-(hover|active)$/, '')];
        if (sample && crop) sample.crop = `crops/${crop}`;
      }

      // The brand kit: marks' links, component specs, voice, imagery (add-brand-kit-capture).
      let kit: CapturedKit | undefined;
      try {
        await page.evaluate(`globalThis.__odKit = ${captureBrandKitInBrowser.toString()}`);
        kit = (await page.evaluate(`globalThis.__odKit(${VOICE_MAX_CHARS})`)) as CapturedKit;
      } catch {
        kit = undefined;
      }
      if (kit) {
        voiceSamples.push(...kit.voice);
        for (const s of kit.links.stylesheets) stylesheets.add(s);
        if (i === 0) {
          const kitCrops = await cropRoles(page, Object.fromEntries(componentRects(kit.components)) as MeasuredPage['rects'], path.join(bundleDir, 'crops'), `${prefix}component-`);
          kitComponents = componentSpecs(kit.components, Object.fromEntries(Object.entries(kitCrops).map(([k, f]) => [k, `crops/${f}`])));
          kitImagery = kit.imagery;
          themeColor = kit.links.themeColor;
        }
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
        const logoFile = marks.find((m) => /\/logo\.[a-z]+$|crops\/.*logo\.png$/.test(m));
        if (logoFile) {
          firstLogo = kit?.logo?.svg ?? kit?.logo?.src;
          kitMarks.push(markEntry('logo', path.posix.relative(bundleRel, logoFile), { width: kit?.logo?.width, height: kit?.logo?.height, seenOn: kit?.logo?.seenOn }));
        }
        if (kit) kitMarks.push(...(await saveKitMarks(page, live.images, kit, main, bundleDir, input.allowHostsForTesting ?? [])));
        if (themeColor) notes.push(`The site declares theme-color ${themeColor}.`);
        if (measured.unreadColors?.length) notes.push(`${url.toString()}: ${measured.unreadColors.length} colour value(s) couldn't be read, so roles painted with them are missing: ${measured.unreadColors.slice(0, 4).join(', ')}.`);
        if (measured.stylesheetsUnreadable > 0) notes.push(`${measured.stylesheetsUnreadable} cross-origin stylesheet(s) couldn't be read, so their custom properties and @font-face sources are missing; computed values are unaffected.`);
      }

      // Every page's dark theme: the first one found is drafted, others that differ are conflicts.
      let pageDark: SiteEvidence['dark'];
      if (theme !== 'light') {
        const light = darkSignature(measured.roles);
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
        await gotoPage(page, url.toString());
        await page.evaluate(`globalThis.__odMeasure = ${measurePageInBrowser.toString()}`);
        await quietOverlays(page, hidden);
        let roles = (await page.evaluate(measureRolesInBrowser)) as Partial<Record<ColorRole, RoleSample>>;
        if (darkSignature(roles) !== light) {
          pageDark = { trigger: 'prefers-color-scheme', roles };
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
            pageDark = { trigger: 'toggle', roles };
            await page.screenshot({ path: path.join(bundleDir, `${prefix}desktop-dark.png`) });
            screenshots.push(rel(`${prefix}desktop-dark.png`));
          } else if (i === 0) noDarkFound = true;
        }
        if (pageDark && i === 0 && firstLogo) {
          // The logo again in the dark theme: kept as logo-dark when it changed.
          try {
            await page.evaluate(`globalThis.__odKit = ${captureBrandKitInBrowser.toString()}`);
            const darkKit = (await page.evaluate('globalThis.__odKit(0)')) as CapturedKit;
            const darkLogo = darkKit.logo;
            if (darkLogo && (darkLogo.svg ?? darkLogo.src) !== firstLogo) {
              const saved = await saveLogo(darkLogo, live.images, bundleDir, 'logo-dark');
              if (saved) kitMarks.push(markEntry('logo-dark', saved, { width: darkLogo.width, height: darkLogo.height, seenOn: darkLogo.seenOn }));
            }
          } catch {
            // No dark logo: only the light one is recorded.
          }
        }
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
      }

      pages.push({
        url: url.toString(),
        colorOriginals: measured.colorOriginals,
        roles: measured.roles,
        textRoles: measured.textRoles,
        fonts: measured.fonts,
        customProperties: measured.customProperties,
        radii: measured.radii,
        spacing: measured.spacing,
        containerMax: measured.containerMax,
        transitions: measured.transitions,
        cardShadow: measured.cardShadow,
        focusRing: measured.focusRing,
        gradients: measured.gradients,
        hero: measured.hero,
        layout: measured.layout,
        hiddenOverlays: hidden.size > 0 ? [...hidden] : undefined,
        dark: pageDark,
        accentCandidates: measured.accentCandidates,
        accentConfidence: measured.accentConfidence,
        motion: pages.length === 0 ? motion : undefined,
      });
      if (!dark && pageDark) dark = pageDark;
      if (hidden.size > 0) notes.push(`${url.toString()}: hid ${hidden.size} overlay(s) before measuring (consent banners or chat launchers, not clicked): ${[...hidden].slice(0, 5).join(', ')}.`);

      // The phone render: its screenshot, and the gutter and section padding at that width.
      await page.setViewport({ ...MOBILE_VIEWPORT, isMobile: true, hasTouch: true });
      await gotoPage(page, url.toString()).catch(() => undefined);
      await quietOverlays(page, new Set());
      const mobileShot = `${prefix}mobile.png`;
      await page.screenshot({ path: path.join(bundleDir, mobileShot) }).catch(() => undefined);
      try {
        await page.evaluate(`globalThis.__odMeasure = ${measurePageInBrowser.toString()}`);
        const phone = (await page.evaluate('globalThis.__odMeasure()')) as MeasuredPage;
        const evidence = pages[pages.length - 1];
        evidence.layout = { ...evidence.layout, phone: phone.layout?.desktop };
      } catch {
        // No phone layout: its tokens stay unmeasured.
      }
      screenshots.push(rel(mobileShot));
      pageShots.push({ url: url.toString(), desktop: rel(desktopShot), mobile: rel(mobileShot) });
    }
  } catch (err) {
    notes.push(`The browser stopped early: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
  } finally {
    await live?.close();
  }

  let brandKit: CapturedBrandKit | undefined;
  if (pages.length > 0) {
    const fonts = fontAvailability(pages.flatMap((p) => p.fonts), [...stylesheets]);
    // Self-hosted faces the page loaded: kept in the bundle, copied into a design system only for an own brand whose licence the user confirmed.
    for (const f of fonts.filter((x) => x.source === 'self-hosted')) {
      const faceSources = pages.flatMap((p) => p.fonts).filter((x) => x.family === f.family && x.source).map((x) => x.source!);
      const files: string[] = [];
      for (const [url, buf] of live?.fonts ?? new Map<string, Buffer>()) {
        if (!faceSources.some((src) => src.includes(url) || src.includes(url.split('/').pop() ?? '\u0000'))) continue;
        const name = (url.split('?')[0].split('/').pop() ?? 'font').replace(/[^\w.-]+/g, '-').slice(0, 80);
        await fs.mkdir(path.join(bundleDir, 'fonts'), { recursive: true });
        await fs.writeFile(path.join(bundleDir, 'fonts', name), buf);
        files.push(`fonts/${name}`);
      }
      if (files.length > 0) f.files = files;
    }
    const capped = voiceSamples.slice(0, 60);
    brandKit = { marks: kitMarks, fonts, components: kitComponents, voice: { samples: capped, ...voiceFacts(capped) }, imagery: kitImagery, themeColor, motion: motion ? summariseMotion(motion) : undefined };
    const licensed = fonts.filter((f) => f.source === 'self-hosted' || f.source === 'adobe');
    if (licensed.length > 0) notes.push(`${licensed.map((f) => `${f.family} (${f.source}, free match ${f.freeMatch})`).join(', ')} may be licensed: ask before copying font files, and only for the user's own brand.`);
  }

  const siteEvidence: SiteEvidence = { pages, dark };
  const draft = pages.length > 0 ? evidenceToTokens(siteEvidence) : undefined;
  if (theme !== 'light' && !dark && noDarkFound) notes.push('No dark theme was found: the site looks the same under prefers-color-scheme: dark and with a dark theme attribute on the root element. No dark values were returned.');
  if (draft && theme !== 'light' && dark && !draft.dark) notes.push('The dark theme changed nothing the draft measures, so no dark values were returned.');
  if (draft) notes.push(...draft.notes);
  if (draft && draft.conflicts.length > 0) notes.push(`Pages disagree on ${[...new Set(draft.conflicts.map((c) => c.token))].join(', ')}: the draft takes the value most pages use (the first page's on a tie); see draft.conflicts.`);
  const discoveredMeasured = discovered.filter((u) => pages.some((p) => p.url === u));
  if (discoveredMeasured.length > 0) notes.push(`Also measured, from the home page's navigation: ${discoveredMeasured.join(', ')}. Pass discover: false to measure only the page given.`);
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
    JSON.stringify({ version: 2, status, url: main.toString(), theme, measuredAt: new Date().toISOString(), ...siteEvidence, pageShots, blocked, marks, brandKit, components: brandKit?.components, notes, draft }, null, 2) + '\n',
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
    brandKit,
    discovered: discoveredMeasured.length > 0 ? discoveredMeasured : undefined,
    notes,
  };
}

const IMAGE_EXT = /\.(svg|png|ico|jpe?g|webp|gif|avif)(\?|$)/i;
const extOf = (url: string, fallback = 'png'): string => IMAGE_EXT.exec(url)?.[1]?.toLowerCase().replace('jpeg', 'jpg') ?? fallback;

/** Saves a logo read in the page (inline SVG or an image it loaded) as `<name>.<ext>` in the bundle. */
async function saveLogo(logo: NonNullable<CapturedKit['logo']>, images: Map<string, Buffer>, bundleDir: string, name: string): Promise<string | undefined> {
  if (logo.svg) {
    await fs.writeFile(path.join(bundleDir, `${name}.svg`), logo.svg);
    return `${name}.svg`;
  }
  const buf = logo.src ? images.get(logo.src) : undefined;
  if (!buf || !logo.src) return undefined;
  const file = `${name}.${extOf(logo.src)}`;
  await fs.writeFile(path.join(bundleDir, file), buf);
  return file;
}

/**
 * The marks beyond the header logo: the logo on a dark surface, the largest
 * icon, the touch icon, web manifest icons and the social image. Files come
 * from what the page loaded, else from one fetch made inside the page (so it
 * goes through the same request guard), on the same site only.
 */
async function saveKitMarks(page: Page, images: Map<string, Buffer>, kit: CapturedKit, main: URL, bundleDir: string, allowHosts: string[]): Promise<BrandMark[]> {
  const out: BrandMark[] = [];
  const site = registrableDomain(main.hostname);
  let fetches = 0;
  const sameSite = (u: string): boolean => {
    try {
      const url = new URL(u);
      return (url.protocol === 'https:' || url.protocol === 'http:') && (registrableDomain(url.hostname) === site || allowHosts.includes(url.hostname));
    } catch {
      return false;
    }
  };
  const load = async (u: string): Promise<Buffer | undefined> => {
    const have = images.get(u);
    if (have) return have;
    if (!sameSite(u) || fetches >= 6) return undefined;
    fetches++;
    await page
      .evaluate(async (url: string) => {
        const ctl = new AbortController();
        setTimeout(() => ctl.abort(), 8000);
        await fetch(url, { signal: ctl.signal, credentials: 'omit' }).then((r) => r.arrayBuffer()).catch(() => undefined);
      }, u)
      .catch(() => undefined);
    await new Promise((r) => setTimeout(r, 150));
    return images.get(u);
  };
  const save = async (role: BrandMark['role'], u: string | undefined, name: string, extra: Partial<BrandMark> = {}): Promise<void> => {
    if (!u) return;
    const buf = await load(u);
    if (!buf) return;
    const file = `${name}.${extOf(u)}`;
    await fs.writeFile(path.join(bundleDir, file), buf);
    out.push(markEntry(role, file, extra));
  };
  if (kit.logoOnDark) {
    const file = await saveLogo(kit.logoOnDark, images, bundleDir, 'logo-on-dark');
    if (file) out.push(markEntry('logo-on-dark', file, { width: kit.logoOnDark.width, height: kit.logoOnDark.height, seenOn: kit.logoOnDark.seenOn }));
  }
  const { icon, touch } = pickIcons(kit.links.icons);
  await save('icon', icon, 'icon');
  await save('touch-icon', touch, 'touch-icon');
  if (kit.links.manifest && sameSite(kit.links.manifest)) {
    const manifest = (await page
      .evaluate(async (url: string) => {
        try {
          const r = await fetch(url, { credentials: 'omit' });
          return r.ok ? await r.text() : undefined;
        } catch {
          return undefined;
        }
      }, kit.links.manifest)
      .catch(() => undefined)) as string | undefined;
    try {
      const icons = (JSON.parse(manifest ?? '{}') as { icons?: Array<{ src?: string; sizes?: string }> }).icons ?? [];
      const largest = icons.filter((i) => i.src).sort((a, b) => (Number((b.sizes ?? '').split('x')[0]) || 0) - (Number((a.sizes ?? '').split('x')[0]) || 0))[0];
      if (largest?.src) await save('manifest-icon', new URL(largest.src, kit.links.manifest).toString(), 'manifest-icon');
    } catch {
      // An unreadable manifest has no icons.
    }
  }
  await save('social', kit.links.ogImage, 'social');
  return out;
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

/** One line on how the accent was chosen: the winner, its confidence and the runner-up. */
function accentChoice(src: DraftTokens['sources'][string] | undefined): string | undefined {
  const [top, next] = src?.candidates ?? [];
  if (!top || src?.choiceConfidence === undefined) return undefined;
  const why = [`${top.controls} control${top.controls === 1 ? '' : 's'}`, top.declared ? `declared ${top.declared}` : '', top.logo ? 'the logo\'s colour' : ''].filter(Boolean).join(', ');
  const ask = src.choiceConfidence < 0.5 ? ' Close call: ask the person which is the brand\'s colour, showing both crops.' : '';
  return `${top.hex} (confidence ${src.choiceConfidence}; ${why})${next ? `, runner-up ${next.hex}${next.declared ? ` (declared ${next.declared})` : ''}` : ''}.${ask}`;
}

/** The tool's text: what was measured, from where, and what to do next. */
export function formatExtractSiteResult(result: ExtractSiteResult): string {
  if (result.status === 'invalid-args') return JSON.stringify({ status: 'invalid-args', error: result.error }, null, 2);
  if (result.status === 'needs-canva-export') {
    return JSON.stringify({ status: result.status, link: result.link, designId: result.designId, instructions: result.instructions, notes: result.notes }, null, 2);
  }
  if (result.status === 'needs-figma-read') {
    return JSON.stringify(
      { status: result.status, fileKey: result.fileKey, nodeId: result.nodeId, link: result.link, instructions: result.instructions, notes: result.notes },
      null,
      2,
    );
  }
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
      discovered: result.discovered,
      brandKit: result.brandKit,
      draft: result.draft ? { tokens: result.draft.tokens, dark: result.draft.dark, sources: result.draft.sources, unmeasured: result.draft.unmeasured, conflicts: result.draft.conflicts, consistency: result.draft.consistency } : undefined,
      draftCss: result.draftCss,
      accentChoice: accentChoice(result.draft?.sources['--accent']),
      candidates: result.candidates,
      sourceCandidates: result.sourceCandidates,
      chartPalette: result.chartPalette,
      nearest: result.nearest,
      distinctive: result.distinctive,
      notes: result.notes,
      next: result.content ? `${next} The site's content is in ${result.content}: for a redesign, pass redesign: { site } to prepare_open_design_brief, which binds it into the design.` : next,
    },
    null,
    2,
  );
}
