// Finding and rewriting an entry HTML's local references (src/href/poster/
// srcset, inline <style> and style="" url()/@import, and CSS files). Adapted
// from upstream open-design apps/daemon/src/deploy.ts at commit 1b47e60bd466
// (Apache-2.0; see vendored/SOURCE.md). Divergence: upstream rewrites every
// reference to project-root-relative because its deploy root is the project;
// the `site` bundle's root is the folder that holds every bundled file, so
// rewriteEntryHtmlReferences() takes a `rewrite` callback instead.
import * as path from 'node:path';

// Character classes keep the lazy match linear on unclosed url((((.
const CSS_URL_REGEX = /url\(\s*(['"]?)([^)]*?)\1\s*\)/gi;
const CSS_IMPORT_REGEX = /@import\s+(?:url\(\s*)?(['"])([^'"]*?)\1/gi;

export interface HtmlTag {
  name: string;
  attrs: Map<string, string>;
}

/** [start, end) offsets of comments and <script>/<style> bodies, where tags are just text. */
export function htmlRawTextRanges(html: string): [number, number][] {
  const ranges: [number, number][] = [];
  const commentRe = /<!--[\s\S]*?-->/g;
  let match;
  while ((match = commentRe.exec(html))) ranges.push([match.index, match.index + match[0].length]);

  const rawTagRe = /<(script|style)\b[^<>]*>/gi;
  while ((match = rawTagRe.exec(html))) {
    const tagName = String(match[1]).toLowerCase();
    const contentStart = match.index + match[0].length;
    const closeRe = new RegExp(`</${tagName}\\s*>`, 'gi');
    closeRe.lastIndex = contentStart;
    const close = closeRe.exec(html);
    const contentEnd = close ? close.index : html.length;
    if (contentEnd > contentStart) ranges.push([contentStart, contentEnd]);
    rawTagRe.lastIndex = close ? close.index + close[0].length : html.length;
  }
  return ranges;
}

export function isOffsetInRanges(offset: number, ranges: [number, number][]): boolean {
  return ranges.some(([start, end]) => offset >= start && offset < end);
}

export function parseHtmlAttributes(rawAttrs: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const attrRe = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attrRe.exec(rawAttrs))) {
    attrs.set(String(match[1]).toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

/** Real start tags only (not ones inside comments or script/style text). */
export function parseHtmlTags(html: string): HtmlTag[] {
  const tags: HtmlTag[] = [];
  const rawTextRanges = htmlRawTextRanges(html);
  const tagRe = /<([A-Za-z][A-Za-z0-9:-]*)([^<>]*?)>/g;
  let match;
  while ((match = tagRe.exec(html))) {
    if (isOffsetInRanges(match.index, rawTextRanges)) continue;
    tags.push({ name: String(match[1]).toLowerCase(), attrs: parseHtmlAttributes(match[2] || '') });
  }
  return tags;
}

/** Offset of the document's real closing tag (`</body>`, `</head>`), skipping script/style/comment text; -1 if none. */
export function findRealClosingTag(html: string, tagName: 'body' | 'head'): number {
  const ranges = htmlRawTextRanges(html);
  const re = new RegExp(`</${tagName}\\s*>`, 'gi');
  let found = -1;
  let match;
  while ((match = re.exec(html))) {
    if (!isOffsetInRanges(match.index, ranges)) found = match.index;
  }
  return found;
}

function shouldCollectHref(tagName: string, attrs: Map<string, string>): boolean {
  if (tagName !== 'link') return false;
  const rel = String(attrs.get('rel') || '').toLowerCase();
  return rel
    .split(/\s+/)
    .some((item) => ['stylesheet', 'icon', 'apple-touch-icon', 'manifest', 'preload', 'modulepreload', 'prefetch'].includes(item));
}

export function extractHtmlReferences(html: string): string[] {
  const refs: string[] = [];
  for (const tag of parseHtmlTags(html)) {
    for (const name of ['src', 'poster']) {
      const value = tag.attrs.get(name);
      if (value) refs.push(value);
    }
    const href = tag.attrs.get('href');
    if (href && shouldCollectHref(tag.name, tag.attrs)) refs.push(href);
    const srcset = tag.attrs.get('srcset');
    if (srcset) {
      for (const part of srcset.split(',')) {
        const url = part.trim().split(/\s+/)[0];
        if (url) refs.push(url);
      }
    }
  }
  return refs;
}

export function extractCssReferences(css: string): string[] {
  const refs: string[] = [];
  const urlRe = new RegExp(CSS_URL_REGEX.source, CSS_URL_REGEX.flags);
  let match;
  while ((match = urlRe.exec(css))) refs.push(match[2] ?? '');
  const importRe = new RegExp(CSS_IMPORT_REGEX.source, CSS_IMPORT_REGEX.flags);
  while ((match = importRe.exec(css))) refs.push(match[2] ?? '');
  return refs;
}

/** url()/@import references in <style> blocks and style="" attributes. */
export function extractInlineCssReferences(html: string): string[] {
  const refs: string[] = [];
  const skipRanges = htmlRawTextRanges(html);
  const styleBlockRe = /<style\b[^<>]*>([\s\S]*?)<\/style\s*>/gi;
  let block;
  while ((block = styleBlockRe.exec(html))) {
    if (isOffsetInRanges(block.index, skipRanges)) continue;
    refs.push(...extractCssReferences(block[1] ?? ''));
  }
  for (const tag of parseHtmlTags(html)) {
    const style = tag.attrs.get('style');
    if (style) refs.push(...extractCssReferences(style));
  }
  return refs;
}

export function isExternalUrl(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed) || trimmed.startsWith('//');
}

/**
 * The workspace-relative path a local reference points at, or null for
 * fragments, external/data URLs and empty values. Root-relative (`/x.png`)
 * references resolve against the workspace root, as in the preview server.
 * The result may start with `../` (outside the workspace); callers reject it.
 */
export function resolveReferencedPath(raw: string, baseDir: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('#') || isExternalUrl(trimmed)) return null;
  const withoutQuery = (trimmed.split('#')[0] ?? '').split('?')[0] ?? '';
  if (!withoutQuery) return null;
  let decoded = withoutQuery;
  try {
    decoded = decodeURI(withoutQuery);
  } catch {
    // Keep the raw form when it isn't valid percent-encoding.
  }
  if (decoded.startsWith('/')) return path.posix.normalize(decoded.slice(1));
  return path.posix.normalize(path.posix.join(baseDir || '.', decoded));
}

function referenceSuffix(raw: string): string {
  const queryIdx = raw.indexOf('?');
  const hashIdx = raw.indexOf('#');
  const idx = queryIdx === -1 ? hashIdx : hashIdx === -1 ? queryIdx : Math.min(queryIdx, hashIdx);
  return idx === -1 ? '' : raw.slice(idx);
}

/** Maps a resolved workspace-relative path to its new reference text, or undefined to leave it as written. */
export type ReferenceRewriter = (workspacePath: string) => string | undefined;

function rewriteReference(raw: string, baseDir: string, rewrite: ReferenceRewriter): string {
  const resolved = resolveReferencedPath(raw, baseDir);
  if (!resolved) return raw;
  const next = rewrite(resolved);
  return next === undefined ? raw : `${next}${referenceSuffix(raw.trim())}`;
}

function rewriteCssReferences(css: string, baseDir: string, rewrite: ReferenceRewriter): string {
  return css
    .replace(CSS_URL_REGEX, (match, quote: string, value: string) =>
      value ? `url(${quote}${rewriteReference(value, baseDir, rewrite)}${quote})` : match,
    )
    .replace(/(@import\s+)(['"])([^'"]*?)\2/gi, (_full, prefix: string, quote: string, value: string) =>
      `${prefix}${quote}${rewriteReference(value, baseDir, rewrite)}${quote}`,
    );
}

function rewriteSrcset(raw: string, baseDir: string, rewrite: ReferenceRewriter): string {
  return raw
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return part;
      const pieces = trimmed.split(/\s+/);
      return [rewriteReference(pieces[0] ?? '', baseDir, rewrite), ...pieces.slice(1)].join(' ');
    })
    .join(', ');
}

function rewriteHtmlAttributes(rawAttrs: string, tagName: string, baseDir: string, rewrite: ReferenceRewriter): string {
  const rewriteHref = shouldCollectHref(tagName, parseHtmlAttributes(rawAttrs));
  return rawAttrs.replace(
    /([^\s"'<>/=]+)(\s*=\s*)("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
    (full, rawName: string, equals: string, _raw: string, dq?: string, sq?: string, uq?: string) => {
      const name = rawName.toLowerCase();
      if (!['src', 'poster', 'srcset', 'href', 'style'].includes(name)) return full;
      if (name === 'href' && !rewriteHref) return full;
      const value = dq ?? sq ?? uq ?? '';
      const next =
        name === 'srcset'
          ? rewriteSrcset(value, baseDir, rewrite)
          : name === 'style'
            ? rewriteCssReferences(value, baseDir, rewrite)
            : rewriteReference(value, baseDir, rewrite);
      if (dq !== undefined) return `${rawName}${equals}"${next}"`;
      if (sq !== undefined) return `${rawName}${equals}'${next}'`;
      return `${rawName}${equals}${next}`;
    },
  );
}

/** Rewrites every local reference in the entry's tags and <style> blocks, leaving script/comment text alone. */
export function rewriteEntryHtmlReferences(html: string, baseDir: string, rewrite: ReferenceRewriter): string {
  const inputRanges = htmlRawTextRanges(html);
  const styleRewritten = html.replace(
    /(<style\b[^<>]*>)([\s\S]*?)(<\/style\s*>)/gi,
    (full, openTag: string, content: string, closeTag: string, offset: number) =>
      isOffsetInRanges(offset, inputRanges) ? full : `${openTag}${rewriteCssReferences(content, baseDir, rewrite)}${closeTag}`,
  );
  const ranges = htmlRawTextRanges(styleRewritten);
  return styleRewritten.replace(/<([A-Za-z][A-Za-z0-9:-]*)([^<>]*?)>/g, (tag, rawName: string, rawAttrs: string, offset: number) => {
    if (isOffsetInRanges(offset, ranges)) return tag;
    return `<${rawName}${rewriteHtmlAttributes(rawAttrs, rawName.toLowerCase(), baseDir, rewrite)}>`;
  });
}
