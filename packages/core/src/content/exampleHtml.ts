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
