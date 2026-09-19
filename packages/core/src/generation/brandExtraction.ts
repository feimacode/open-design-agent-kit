// Lightweight, no-daemon port of open-design's own deterministic brand
// extraction (apps/daemon/src/brands/prefetch.ts): a server-side fetch of a
// page's HTML plus its same-origin linked stylesheets, regex-harvested for
// candidate colors/fonts/a favicon. Deliberately NOT a headless-browser or
// vision/OCR pipeline — upstream itself removed screenshot-based capture
// for SSRF-safety reasons (see openspec design notes); this keeps the same
// posture: plain HTTP fetch of what the caller-supplied URL and its own
// same-origin stylesheet links point to, nothing else. Best-effort by
// design: any network/parse failure degrades to an emptier result with a
// warning, never throws — a design-system draft should still be creatable
// from the brief alone even when extraction fails outright.

import { extractFontFamilies, extractHexColors, rankColors } from './tokenExtraction';

export interface BrandEvidence {
  fetchedUrl: string;
  /** Hex color candidates, most frequently referenced first. */
  colors: string[];
  /** Distinct font-family values (first family per declaration, quotes stripped). */
  fonts: string[];
  faviconUrl?: string;
  warnings: string[];
}

const FETCH_TIMEOUT_MS = 8000;
const MAX_TEXT_LENGTH = 3_000_000; // guards regex/memory cost on pathologically large pages
const MAX_STYLESHEETS = 3;
const MAX_COLORS = 8;
const MAX_FONTS = 6;

async function fetchText(url: string, warnings: string[]): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) {
      warnings.push(`${url} responded with HTTP ${response.status}`);
      return undefined;
    }
    const text = await response.text();
    return text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
  } catch (err) {
    warnings.push(`Could not fetch ${url}: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveUrl(href: string, base: URL): string | undefined {
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

// Pure — no network. Separated out so the regex-harvesting logic is
// directly unit-testable against fixture strings, without needing to mock
// `fetch`.
export function synthesizeBrandEvidence(base: URL, html: string | undefined, stylesheetTexts: string[], warnings: string[]): BrandEvidence {
  const colorTally = new Map<string, number>();
  const fonts = new Set<string>();
  let faviconUrl: string | undefined;

  if (html) {
    extractHexColors(html, colorTally);
    extractFontFamilies(html, fonts);

    const iconMatch = /<link[^>]+rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["']/i.exec(html);
    if (iconMatch) faviconUrl = resolveUrl(iconMatch[1], base);
    if (!faviconUrl) {
      const ogImageMatch = /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html);
      if (ogImageMatch) faviconUrl = resolveUrl(ogImageMatch[1], base);
    }
  }

  for (const css of stylesheetTexts) {
    extractHexColors(css, colorTally);
    extractFontFamilies(css, fonts);
  }

  return { fetchedUrl: base.toString(), colors: rankColors(colorTally, MAX_COLORS), fonts: [...fonts].slice(0, MAX_FONTS), faviconUrl, warnings };
}

export async function extractBrandEvidence(sourceUrl: string): Promise<BrandEvidence> {
  const warnings: string[] = [];
  let base: URL;
  try {
    base = new URL(sourceUrl);
    if (base.protocol !== 'http:' && base.protocol !== 'https:') {
      return { fetchedUrl: sourceUrl, colors: [], fonts: [], warnings: [`Unsupported URL scheme "${base.protocol}" — only http(s) is supported.`] };
    }
  } catch {
    return { fetchedUrl: sourceUrl, colors: [], fonts: [], warnings: [`"${sourceUrl}" is not a valid URL.`] };
  }

  const html = await fetchText(base.toString(), warnings);
  const stylesheetTexts: string[] = [];

  if (html) {
    // Same-origin only — this is a plain content fetch of what the page
    // itself links to, not a general-purpose crawler.
    const stylesheetHrefs = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)]
      .map((m) => resolveUrl(m[1], base))
      .filter((u): u is string => !!u && new URL(u).origin === base.origin)
      .slice(0, MAX_STYLESHEETS);

    for (const cssUrl of stylesheetHrefs) {
      const css = await fetchText(cssUrl, warnings);
      if (css) stylesheetTexts.push(css);
    }
  }

  return synthesizeBrandEvidence(base, html, stylesheetTexts, warnings);
}
