// Vendored example.html files are rendered by handing their raw text to an
// `iframe.srcdoc` in the extension's webviews (gallery grid, example
// preview) — a srcdoc document has no base URL of its own, so any relative
// resource reference in the source HTML (a sibling JS/CSS file, or a nested
// "shell" iframe) can never resolve, regardless of CSP. Most vendored
// examples are a single self-contained file and are unaffected; a minority
// ship as HTML + sibling assets/ files and need those references resolved
// here, at read time, before the content ever reaches a webview.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { SkillSource } from './contentIndex';

/**
 * A skill's `exampleArtifactPath` is relative to whichever content pool it
 * came from — the built-in bundled assets for every source except
 * `'community'`, which resolves against the runtime-fetched cache dir
 * instead (see ContentIndex's `getCommunityContentDir`). Callers that read
 * an example's files (loadExampleHtml, copyExampleArtifact) must resolve
 * the right root from the skill's own `source` before reading — passing the
 * wrong one either 404s or, worse, silently reads a stale/unrelated file
 * that happens to share the same relative path under the wrong root.
 */
export function resolveContentRoot(source: SkillSource, roots: { assetsRoot: string; communityContentDir?: string }): string {
  return source === 'community' && roots.communityContentDir ? roots.communityContentDir : roots.assetsRoot;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function replaceAsync(input: string, pattern: RegExp, replacer: (match: RegExpExecArray) => Promise<string>): Promise<string> {
  const matches = [...input.matchAll(pattern)];
  if (matches.length === 0) return input;
  const replacements = await Promise.all(matches.map((m) => replacer(m as RegExpExecArray)));
  let result = '';
  let cursor = 0;
  matches.forEach((m, i) => {
    result += input.slice(cursor, m.index);
    result += replacements[i];
    cursor = m.index! + m[0].length;
  });
  result += input.slice(cursor);
  return result;
}

// Upstream open-design's own preview daemon unwraps an example.html whose
// body is nothing but `<iframe src="./assets/X.html">` and serves X.html
// directly instead (see e.g. trading-analysis-dashboard-template/
// example.html's own comment about this convention). Mirror that: a srcdoc
// iframe can't resolve the relative src of a further-nested iframe either,
// so serve the referenced file's content in its place.
const IFRAME_SHELL_RE = /<iframe\s+src="\.?\/?(assets\/[^"]+\.html)"/i;

async function unwrapIframeShell(html: string, dir: string): Promise<string> {
  const match = IFRAME_SHELL_RE.exec(html);
  if (!match) return html;
  const innerPath = path.join(dir, match[1]);
  if (!(await pathExists(innerPath))) return html;
  return fs.readFile(innerPath, 'utf8');
}

const SCRIPT_SRC_RE = /<script([^>]*)\ssrc="assets\/([^"]+)"([^>]*)>\s*<\/script>/gi;
const LINK_CSS_RE = /<link([^>]*)\shref="assets\/([^"]+\.css)"([^>]*?)\/?>/gi;

async function inlineSiblingAssets(html: string, dir: string): Promise<string> {
  html = await replaceAsync(html, SCRIPT_SRC_RE, async (m) => {
    const [, before, rel, after] = m;
    const assetPath = path.join(dir, 'assets', rel);
    if (!(await pathExists(assetPath))) return m[0];
    const content = await fs.readFile(assetPath, 'utf8');
    return `<script${before}${after}>${content}</script>`;
  });
  html = await replaceAsync(html, LINK_CSS_RE, async (m) => {
    const [, , rel] = m;
    const assetPath = path.join(dir, 'assets', rel);
    if (!(await pathExists(assetPath))) return m[0];
    const content = await fs.readFile(assetPath, 'utf8');
    return `<style>${content}</style>`;
  });
  return html;
}

/**
 * Reads an example's entry HTML and resolves it into a single,
 * self-contained document safe to hand to `iframe.srcdoc` — unwrapping an
 * iframe-only shell and inlining any sibling `assets/*.js`/`assets/*.css`
 * references it makes. Most examples pass through unchanged.
 */
export async function loadExampleHtml(assetsRoot: string, exampleArtifactPath: string): Promise<string> {
  const absPath = path.join(assetsRoot, exampleArtifactPath);
  const dir = path.dirname(absPath);
  let html = await fs.readFile(absPath, 'utf8');
  html = await unwrapIframeShell(html, dir);
  html = await inlineSiblingAssets(html, dir);
  return html;
}

/**
 * Adds `nonce="<value>"` to every `<script` tag that doesn't already carry
 * one, so a document rendered under a `script-src 'nonce-<value>'
 * 'strict-dynamic'` CSP (see galleryGridProvider.ts / examplePreviewProvider.ts)
 * can actually run its own inline scripts — including inline `type="module"`
 * scripts, which CSP's `'unsafe-inline'` keyword never covers, and external
 * `<script src="https://...">` tags, which `'strict-dynamic'` then trusts
 * because they carry an authorized nonce.
 */
export function injectScriptNonce(html: string, nonceValue: string): string {
  return html.replace(/<script(?![^>]*\bnonce=)/gi, `<script nonce="${nonceValue}"`);
}

/**
 * Adds a `<base href>` so a document rendered from `srcdoc` (which has no URL
 * of its own) resolves relative frames, images, scripts and stylesheets
 * against `baseHref` — e.g. an exploration comparison page's
 * `<iframe src="direction.html">` thumbnails. The tag carries
 * `data-od-preview-only`, so the preview strips it before saving edits back.
 * A document that already declares its own `<base>` is left alone.
 */
export function injectPreviewBase(html: string, baseHref: string): string {
  if (/<base[\s>]/i.test(html)) return html;
  const tag = `<base href="${baseHref.replace(/"/g, '&quot;')}" data-od-preview-only>`;
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length);
  const htmlOpen = /<html(\s[^>]*)?>/i.exec(html);
  if (htmlOpen) return html.slice(0, htmlOpen.index + htmlOpen[0].length) + `<head>${tag}</head>` + html.slice(htmlOpen.index + htmlOpen[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) return doctype[0] + tag + html.slice(doctype[0].length);
  return tag + html;
}

/** Marks an `<iframe>` whose `srcdoc` the preview filled in from its local `src`; the WYSIWYG save removes both. */
export const PREVIEW_SRCDOC_ATTR = 'data-od-preview-srcdoc';

/**
 * A relative `href`/`src` that points at a file next to the document (not a
 * URL with a scheme, a protocol-relative or root path, or a same-page `#hash`),
 * without its query and hash; undefined otherwise.
 */
export function localRelativePath(ref: string): string | undefined {
  const value = ref.trim();
  if (!value || value.startsWith('#') || value.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return undefined;
  const pathPart = value.split(/[?#]/)[0];
  if (!pathPart) return undefined;
  try {
    return decodeURIComponent(pathPart);
  } catch {
    return pathPart;
  }
}

/**
 * A webview can't navigate a frame to a local file, so a page that frames its
 * neighbours (an exploration comparison page's thumbnails) shows blank frames.
 * This fills each `<iframe src="local.html">` with that file's content as
 * `srcdoc` (which takes precedence over `src`, left in place), recursively up
 * to `depth` levels; `prepare` gets each framed document and the path it was
 * read from, to add its own base and script nonce. Frames whose file can't be
 * read are left as they are.
 */
export async function inlineLocalFrames(
  html: string,
  readLocal: (relativePath: string) => Promise<{ html: string; resolvedPath: string } | undefined>,
  prepare: (html: string, resolvedPath: string) => string,
  depth = 2,
): Promise<string> {
  if (depth <= 0) return html;
  const tags = [...html.matchAll(/<iframe\b[^>]*>/gi)];
  let out = '';
  let last = 0;
  for (const match of tags) {
    const tag = match[0];
    const src = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const ref = src ? (src[1] ?? src[2] ?? src[3] ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"') : '';
    const rel = /\ssrcdoc\s*=/i.test(tag) ? undefined : localRelativePath(ref);
    const file = rel ? await readLocal(rel) : undefined;
    if (!file) continue;
    const inner = await inlineLocalFrames(
      file.html,
      (child) => readLocal(joinRelative(rel!, child)),
      prepare,
      depth - 1,
    );
    const srcdoc = prepare(inner, file.resolvedPath).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const end = tag.endsWith('/>') ? tag.length - 2 : tag.length - 1;
    out += html.slice(last, match.index) + `${tag.slice(0, end)} srcdoc="${srcdoc}" ${PREVIEW_SRCDOC_ATTR}${tag.slice(end)}`;
    last = match.index + tag.length;
  }
  return out + html.slice(last);
}

/** `child` (relative to the file at `parent`) as a path relative to `parent`'s own base. */
function joinRelative(parent: string, child: string): string {
  const dir = parent.includes('/') ? parent.slice(0, parent.lastIndexOf('/') + 1) : '';
  return dir + child;
}
