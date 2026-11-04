// A public web page loaded safely in a headless browser, shared by design
// system extraction (openspec add-design-system-from-url) and the site audit
// (openspec add-site-audit): http(s) only, no private or loopback hosts (also
// on every subresource), at most 4 pages on one site, 20 s each, no cookies,
// logins or form posts, and bot checks reported rather than solved.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Browser, Page } from 'puppeteer-core';

export const MAX_EXTRA_URLS = 3;
export const PAGE_TIMEOUT_MS = 20_000;
export const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
export const MOBILE_VIEWPORT = { width: 390, height: 844 };

/** What blockedReason needs to know about a loaded page. */
export interface PageSignals {
  challenge: boolean;
  bodyTextLength: number;
  elementCount: number;
}

/** Loopback, private, link-local, unique-local, CGNAT, unspecified and multicast addresses. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    return lower === '::' || lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || /^ff/.test(lower);
  }
  return false;
}

function isLocalName(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.');
}

/** A hostname or literal IP that's never fetched: local names and private literal addresses. Cheap, no DNS. */
export function isBlockedHostLiteral(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '');
  return isIP(h) ? isPrivateAddress(h) : isLocalName(h);
}

const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);

/** `www.shop.example.co.uk` → `example.co.uk`. An approximation of the public suffix list, good enough to keep extra pages on one site. */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  if (isIP(host) || labels.length <= 2) return labels.join('.');
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  const take = tld.length === 2 && SECOND_LEVEL.has(sld) ? 3 : 2;
  return labels.slice(-take).join('.');
}

async function defaultResolveHost(host: string): Promise<string[]> {
  return (await lookup(host, { all: true })).map((r) => r.address);
}

/** The pages to render, or why not. Resolves each host and refuses private addresses. */
export async function validateLiveUrls(
  url: string,
  extraUrls: string[] = [],
  resolveHost: (host: string) => Promise<string[]> = defaultResolveHost,
  allowHosts: string[] = [],
): Promise<{ ok: true; urls: URL[] } | { ok: false; error: string }> {
  if (extraUrls.length > MAX_EXTRA_URLS) return { ok: false, error: `extraUrls takes at most ${MAX_EXTRA_URLS} pages (got ${extraUrls.length}).` };
  const parsed: URL[] = [];
  for (const raw of [url, ...extraUrls]) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      return { ok: false, error: `"${raw}" is not a valid URL.` };
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: `${raw}: only http and https URLs can be loaded.` };
    if (u.username || u.password) return { ok: false, error: `${raw}: URLs with credentials aren't accepted.` };
    if (allowHosts.includes(u.hostname)) {
      parsed.push(u);
      continue;
    }
    if (isBlockedHostLiteral(u.hostname)) return { ok: false, error: `${raw}: local and private addresses can't be loaded.` };
    let addresses: string[];
    try {
      addresses = await resolveHost(u.hostname.replace(/^\[|\]$/g, ''));
    } catch {
      return { ok: false, error: `${raw}: the host ${u.hostname} doesn't resolve.` };
    }
    if (addresses.length === 0 || addresses.some(isPrivateAddress)) return { ok: false, error: `${raw}: ${u.hostname} resolves to a local or private address.` };
    parsed.push(u);
  }
  const site = registrableDomain(parsed[0].hostname);
  for (const extra of parsed.slice(1)) {
    if (registrableDomain(extra.hostname) !== site) return { ok: false, error: `${extra.toString()} is not on the same site as ${parsed[0].toString()} (${site}).` };
  }
  return { ok: true, urls: parsed };
}

/** `https://www.example.com/pricing` → `example-com`. */
export function liveSlug(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
}

const LOGIN_PATH = /\/(log-?in|sign-?in|auth|sso|account\/login)(\/|$|\?)/i;

/** Why a loaded page can't be measured (bot check, login redirect, empty body), or undefined. */
export function blockedReason(requested: URL, finalUrl: string, m: PageSignals): string | undefined {
  if (m.challenge) return 'the page shows a bot check or access wall';
  let final: URL | undefined;
  try {
    final = new URL(finalUrl);
  } catch {
    final = undefined;
  }
  if (final && LOGIN_PATH.test(final.pathname) && !LOGIN_PATH.test(requested.pathname)) return `the page redirected to a login (${final.pathname})`;
  if (m.bodyTextLength < 40 && m.elementCount < 30) return 'the page rendered an empty body';
  return undefined;
}

/** Blocks private hosts, other schemes and form posts on every request; keeps the images the page loaded (for logos). */
export async function guardRequests(page: Page, images: Map<string, Buffer>, allowHosts: string[]): Promise<void> {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    let u: URL;
    try {
      u = new URL(req.url());
    } catch {
      void req.abort().catch(() => undefined);
      return;
    }
    const allowedScheme = u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'data:' || u.protocol === 'blob:';
    const formPost = req.isNavigationRequest() && req.method() !== 'GET';
    if (!allowedScheme || formPost || ((u.protocol === 'http:' || u.protocol === 'https:') && isBlockedHostLiteral(u.hostname) && !allowHosts.includes(u.hostname))) {
      void req.abort('blockedbyclient').catch(() => undefined);
      return;
    }
    void req.continue().catch(() => undefined);
  });
  // Kept so a logo image can be saved from what the page itself loaded, without a second fetch.
  page.on('response', (res) => {
    const type = res.headers()['content-type'] ?? '';
    if (!type.startsWith('image/') || images.size >= 60) return;
    res
      .buffer()
      .then((buf) => {
        if (buf.length <= 1_000_000) images.set(res.url(), buf);
      })
      .catch(() => undefined);
  });
}

/** Loads a page, tolerating pages that never go network-idle. */
export async function gotoPage(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT_MS });
  } catch (err) {
    // A page that never goes network-idle (analytics, long polling) is still measurable once its DOM is there.
    if (!/timeout/i.test(String(err))) throw err;
    await page.evaluate(() => document.readyState).catch(() => undefined);
  }
  await new Promise((r) => setTimeout(r, 400));
}


/** In-page: the signals blockedReason reads. Self-contained, for page.evaluate. */
export function readPageSignals(): PageSignals {
  const doc = document;
  const text = (doc.body ? doc.body.innerText || '' : '').trim();
  const challenge =
    /just a moment|attention required|verify you are (a )?human|checking your browser|are you a robot|enable javascript and cookies|access denied|captcha/i.test(`${doc.title} ${text.slice(0, 2000)}`) ||
    !!doc.querySelector('#challenge-form, #cf-challenge-running, .cf-browser-verification, iframe[src*="captcha"], iframe[src*="challenges.cloudflare"], [class*="g-recaptcha"], #px-captcha');
  return { challenge, bodyTextLength: text.length, elementCount: doc.body ? doc.body.getElementsByTagName('*').length : 0 };
}

/** In-page: hides common cookie and consent banners so they don't cover what is measured. Returns how many were hidden. */
/**
 * Hides consent banners, cookie walls and chat launchers (never clicks them:
 * "Accept" would set cookies and change what the site does). Known vendors by
 * selector, plus any fixed or sticky element that mentions cookies or consent
 * and covers a third of the viewport or is pinned to its top or bottom edge.
 * Hidden elements carry `data-od-hidden-consent`. Self-contained: it runs in
 * the page through `page.evaluate`. Returns how many it hid.
 */
export function hideConsentBanners(): number {
  const selectors = [
    '#onetrust-banner-sdk', '#onetrust-consent-sdk', '#CybotCookiebotDialog', '#CybotCookiebotDialogBodyUnderlay', '#cookiebanner', '#cookie-banner', '#cookie-notice', '#cookie-law-info-bar',
    '.cc-window', '.cc-banner', '.cookie-banner', '.cookie-consent', '.cookie-notice', '[id*="cookie-consent" i]', '[class*="cookie-consent" i]', '[id*="cookieconsent" i]',
    '[id*="cookie-banner" i]', '[class*="cookie-banner" i]', '[aria-label*="cookie" i][role="dialog"]',
    '#usercentrics-root', '#usercentrics-cmp-ui', '#qc-cmp2-container', '.qc-cmp2-container', '.fc-consent-root', '#didomi-host', '#didomi-popup',
    '.truste_box_overlay', '.truste_overlay', '#truste-consent-track', '#consent_blackbar', '.osano-cm-window', '#iubenda-cs-banner',
    // Chat launchers: third-party, often brand-coloured, and pinned over the page.
    '#intercom-container', '.intercom-lightweight-app', '#intercom-frame', '#drift-widget', '#drift-frame-controller', '#drift-frame-chat',
    '#hubspot-messages-iframe-container', '#launcher', '#ze-snippet', '#crisp-chatbox', '.crisp-client', '#tidio-chat', '#fc_frame',
  ];
  let hidden = 0;
  const hide = (el: Element) => {
    const h = el as HTMLElement;
    if (h.getAttribute('data-od-hidden-consent') !== null || el === document.body || el === document.documentElement) return;
    h.setAttribute('data-od-hidden-consent', '');
    h.style.setProperty('display', 'none', 'important');
    hidden++;
  };
  for (const sel of selectors) {
    let els: Element[] = [];
    try {
      els = Array.from(document.querySelectorAll(sel));
    } catch {
      els = [];
    }
    els.forEach(hide);
  }
  if (document.body) {
    const consent = /cookie|consent|gdpr|ccpa/i;
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const s = getComputedStyle(el);
      if ((s.position !== 'fixed' && s.position !== 'sticky') || s.display === 'none') continue;
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
      const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      const cover = (w * h) / (innerWidth * innerHeight);
      if (cover === 0 || !consent.test((el.textContent ?? '').slice(0, 4000))) continue;
      if (cover > 0.3 || r.bottom >= innerHeight - 4 || r.top <= 4) hide(el);
    }
  }
  if (hidden > 0) {
    // Consent walls often lock scrolling on the page behind them.
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      el.style.removeProperty('overflow');
      if (getComputedStyle(el).overflowY === 'hidden') el.style.setProperty('overflow', 'auto', 'important');
    }
  }
  return hidden;
}

/** The elements `hideConsentBanners` hid, as short selectors. Self-contained, for `page.evaluate`. */
export function hiddenConsentSelectors(): string[] {
  return Array.from(document.querySelectorAll('[data-od-hidden-consent]')).map((el) =>
    el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}${Array.from(el.classList).slice(0, 2).map((c) => `.${c}`).join('')}`,
  );
}

export interface LiveBrowser {
  browser: Browser;
  page: Page;
  /** Images the page loaded, by URL. */
  images: Map<string, Buffer>;
  close(): Promise<void>;
}

/** Launches the browser with a throwaway profile, a desktop user agent and the request guard. */
export async function launchLiveBrowser(executablePath: string, allowHosts: string[] = [], profilePrefix = 'od-live-profile-'): Promise<LiveBrowser> {
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), profilePrefix));
  const { default: puppeteer } = await import('puppeteer-core');
  let browser: Browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      userDataDir: profileDir,
      protocolTimeout: 60_000,
      // Chrome refuses to start its sandbox as root (containers, CI); everywhere else the sandbox stays on.
      args: ['--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb', '--disable-features=Translate', ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])],
    });
  } catch (err) {
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
  // A normal desktop user agent: the headless marker alone gets many sites to serve a stripped page.
  const userAgent = (await browser.userAgent()).replace(/HeadlessChrome/g, 'Chrome');
  const page = await browser.newPage();
  await page.evaluateOnNewDocument('globalThis.__name = globalThis.__name || ((fn) => fn)');
  await page.setUserAgent(userAgent);
  const images = new Map<string, Buffer>();
  await guardRequests(page, images, allowHosts);
  return {
    browser,
    page,
    images,
    close: async () => {
      await browser.close().catch(() => undefined);
      await fs.rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
