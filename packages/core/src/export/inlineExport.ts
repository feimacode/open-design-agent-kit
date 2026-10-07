// Email and paste exports (openspec add-email-and-paste-export): render the
// artifact, inline the browser's computed styles (inlinePageScripts.ts), and
// write an inbox-ready email document or a paste-ready fragment for WeChat,
// Notion or a newsletter tool under the artifact's exports/ folder. One
// inliner serves every target; each target is a small rule set on top.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { load } from 'cheerio';
import { readArtifact, writeArtifactManifest } from '../vendored/artifactCreate';
import { openArtifactPage, type ArtifactPageSession } from './artifactPage';
import { findBrowser } from './browserDiscovery';
import { loadPage, mergeExportRecords } from './exportArtifact';
import { collectEmailFindings, inlineComputedStyles, type InlineResult } from './inlinePageScripts';
import { formatPreflight, type Finding } from '../poster/preflight';

export type PasteTarget = 'wechat' | 'notion' | 'newsletter' | 'generic';
export const PASTE_TARGETS: readonly PasteTarget[] = ['wechat', 'notion', 'newsletter', 'generic'];

/** Email column width; content wider than this is reported. */
export const EMAIL_MAX_WIDTH = 640;
/** Gmail clips messages whose HTML is larger than this. */
export const EMAIL_CLIP_BYTES = 102 * 1024;
const EMAIL_ROOT = '[data-od-email]';

export interface InlineExportOptions {
  workspaceRoot: string;
  entryPath: string;
  format: 'email' | 'paste';
  /** paste only. */
  target?: PasteTarget;
  /** Where the artifact's files will be hosted: relative image and link URLs become absolute. */
  baseUrl?: string;
  browserPath?: string;
  readyTimeoutMs?: number;
  settleMs?: number;
}

export interface InlineExportedFile {
  path: string;
  bytes: number;
}

export type InlineExportResult =
  | {
      ok: true;
      inline: 'email' | 'paste';
      target?: PasteTarget;
      files: InlineExportedFile[];
      findings: Finding[];
      warnings: string[];
      browserPath: string;
    }
  | { ok: false; code: 'invalid-args' | 'not-found' | 'not-registered' | 'unsupported-kind' | 'no-browser' | 'capture-failed'; error: string };

const INLINABLE_RENDERERS = new Set(['html', 'mini-app', 'deck-html', 'diagram']);

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Relative src/href values resolved against baseUrl (as if the page were served from there). */
export function absolutizeUrls(html: string, baseUrl: string, entryDir: string): string {
  const $ = load(html, null, false);
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const fix = (value: string | undefined): string | undefined => {
    if (!value || /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(value)) return value;
    // Root-relative paths are workspace-relative to the static server, so make them entry-relative first.
    const rel = value.startsWith('/') ? path.posix.relative(entryDir || '.', value.slice(1)) : value;
    try {
      return new URL(rel, base).toString();
    } catch {
      return value;
    }
  };
  $('img[src]').each((_, el) => {
    $(el).attr('src', fix($(el).attr('src')));
  });
  $('a[href]').each((_, el) => {
    $(el).attr('href', fix($(el).attr('href')));
  });
  return $.html();
}

/** A preheader: the hidden first line inbox lists show after the subject. */
function preheaderFrom(text: string): string {
  const first = text.split(/\n+/).map((l) => l.trim()).find((l) => l.length > 20) ?? text.trim();
  return first.length > 110 ? `${first.slice(0, 107)}…` : first;
}

export function emailDocument(input: { title: string; body: InlineResult; preheader?: string }): string {
  const bg = /background-color:([^;]+)/.exec(input.body.rootStyle)?.[1] ?? '#ffffff';
  const text = input.body.rootStyle
    .split(';')
    .filter((d) => /^(color|font-family|font-size|line-height)/.test(d))
    .join(';');
  const preheader = escapeHtml(input.preheader ?? input.body.preheader ?? preheaderFrom(input.body.text));
  // An artifact already built on its own email column ([data-od-email]) is used as is; anything else
  // gets the standard centred 600px presentation table around it.
  const content = input.body.rootFound
    ? input.body.html
    : `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto"><tr><td style="${escapeHtml(text)}">${input.body.html}</td></tr></table>`;
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(input.title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${bg};${escapeHtml(text)}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all" aria-hidden="true">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:${bg}"><tr><td align="center" style="padding:24px 12px">
${content}
</td></tr></table>
</body>
</html>
`;
}

export function emailPlainText(body: InlineResult): string {
  const text = body.text.replace(/\n{3,}/g, '\n\n').trim();
  const links = body.links.filter((l) => l.href && !l.href.startsWith('#'));
  return links.length > 0 ? `${text}\n\nLinks:\n${links.map((l) => `- ${l.text || l.href}: ${l.href}`).join('\n')}\n` : `${text}\n`;
}

/** Per-target rules on top of the inlined fragment. */
export function pasteFragment(html: string, target: PasteTarget): string {
  const $ = load(`<div id="__od_root">${html}</div>`, null, false);
  const root = $('#__od_root');
  if (target === 'wechat') {
    // WeChat's editor keeps inline styles on <section> blocks; top-level blocks become sections.
    root.contents().each((_, node) => {
      if (node.type === 'text') {
        if ($(node).text().trim()) $(node).wrap('<section></section>');
        else $(node).remove();
        return;
      }
      if (node.type !== 'tag') return;
      const el = $(node);
      if (['div', 'article', 'main', 'header', 'footer', 'aside'].includes(node.tagName)) node.tagName = 'section';
      else if (node.tagName !== 'section') el.wrap('<section></section>');
    });
  } else if (target === 'notion') {
    // Notion turns pasted HTML into blocks and drops layout wrappers; flatten them so their content survives.
    let changed = true;
    while (changed) {
      changed = false;
      root.find('div, section, article, main, header, footer, aside, span:not([style])').each((_, el) => {
        if ($(el).children('p, h1, h2, h3, h4, h5, h6, ul, ol, pre, blockquote, table, div, section, figure, img, hr').length > 0 || el.tagName === 'span') {
          $(el).replaceWith($(el).contents());
          changed = true;
        }
      });
    }
    root.find('[class]').each((_, el) => {
      if (!(el.tagName === 'code' && /language-/.test($(el).attr('class') ?? ''))) $(el).removeAttr('class');
    });
  }
  return root.html() ?? '';
}

export async function exportInline(options: InlineExportOptions): Promise<InlineExportResult> {
  if (options.format === 'paste' && (!options.target || !PASTE_TARGETS.includes(options.target))) {
    return { ok: false, code: 'invalid-args', error: `paste needs target: ${PASTE_TARGETS.join(', ')}.` };
  }
  if (options.format === 'email' && options.target !== undefined) return { ok: false, code: 'invalid-args', error: 'target applies to format "paste" only.' };
  if (options.baseUrl !== undefined && !/^https:\/\//i.test(options.baseUrl)) return { ok: false, code: 'invalid-args', error: 'baseUrl must be an https:// URL.' };

  let artifact;
  try {
    artifact = await readArtifact({ workspaceRoot: options.workspaceRoot, entryPath: options.entryPath });
  } catch (err) {
    return { ok: false, code: 'invalid-args', error: err instanceof Error ? err.message : String(err) };
  }
  if (!artifact) return { ok: false, code: 'not-found', error: `No artifact entry file found at ${options.entryPath}.` };
  if (!artifact.manifest) {
    return { ok: false, code: 'not-registered', error: `${options.entryPath} exists but isn't registered (no .artifact.json sidecar). Call register_open_design_artifact first.` };
  }
  const manifest = artifact.manifest;
  const renderer = typeof manifest.renderer === 'string' ? manifest.renderer : 'html';
  if (!INLINABLE_RENDERERS.has(renderer)) {
    return { ok: false, code: 'unsupported-kind', error: `Artifacts rendered as "${renderer}" can't be exported as ${options.format} — only HTML artifacts.` };
  }

  const browser = await findBrowser({ explicitPath: options.browserPath });
  if (!browser.ok) return { ok: false, code: 'no-browser', error: browser.message };

  const relEntry = path.relative(options.workspaceRoot, path.resolve(options.workspaceRoot, options.entryPath)).split(path.sep).join('/');
  const entryDir = path.posix.dirname(relEntry);
  const base = path.posix.basename(relEntry, path.posix.extname(relEntry));
  const emailRules = options.format === 'email' || options.target === 'newsletter';
  const warnings: string[] = [];
  const findings: Finding[] = [];
  let session: ArtifactPageSession | undefined;
  try {
    session = await openArtifactPage({ workspaceRoot: options.workspaceRoot, relEntry, executablePath: browser.executablePath });
    const { page } = session;
    // Email checks look at the design as a wide client shows it; inlining runs at the email column width.
    await page.setViewport({ width: emailRules ? 1200 : 760, height: 900, deviceScaleFactor: 1 });
    await loadPage(page, session.url, options.readyTimeoutMs ?? 15000, options.settleMs ?? 300, warnings);
    if (emailRules) {
      findings.push(...((await page.evaluate(collectEmailFindings, { maxWidth: EMAIL_MAX_WIDTH, hasBaseUrl: !!options.baseUrl, checkOnly: false })) as Finding[]));
      await page.setViewport({ width: 680, height: 900, deviceScaleFactor: 1 });
      await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    }
    const inlined = (await page.evaluate(inlineComputedStyles, {
      repeatInherited: emailRules,
      keepCodeLanguage: options.target === 'notion',
      rootSelector: options.format === 'email' ? EMAIL_ROOT : undefined,
      keepComments: options.format === 'email',
    })) as InlineResult;
    warnings.push(...inlined.warnings);
    if (options.baseUrl) inlined.html = absolutizeUrls(inlined.html, options.baseUrl, entryDir);

    const files: Array<{ rel: string; content: string; format: string }> = [];
    if (options.format === 'email') {
      const title = typeof manifest.title === 'string' ? manifest.title : base;
      const doc = emailDocument({ title, body: inlined });
      files.push({ rel: path.posix.join(entryDir, 'exports', `${base}.email.html`), content: doc, format: 'email' });
      files.push({ rel: path.posix.join(entryDir, 'exports', `${base}.email.txt`), content: emailPlainText(inlined), format: 'email-text' });
    } else {
      files.push({ rel: path.posix.join(entryDir, 'exports', `${base}.${options.target}.html`), content: pasteFragment(inlined.html, options.target!), format: `paste-${options.target}` });
    }
    const main = files[0].content;
    if (emailRules) {
      const bytes = Buffer.byteLength(main, 'utf8');
      if (bytes > EMAIL_CLIP_BYTES) {
        findings.push({ check: 'email-clip', severity: 'warning', message: `The HTML is ${Math.round(bytes / 1024)} KB; Gmail clips messages over 102 KB behind "View entire message". Simplify or split it.` });
      }
      if (/var\(--/.test(main)) findings.push({ check: 'email-unsupported-css', severity: 'warning', message: 'CSS variables survived inlining; email clients ignore them.' });
    }

    const exportedAt = new Date().toISOString();
    const written: InlineExportedFile[] = [];
    for (const f of files) {
      const abs = path.join(options.workspaceRoot, f.rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, f.content, 'utf8');
      written.push({ path: f.rel, bytes: Buffer.byteLength(f.content, 'utf8') });
    }
    try {
      await writeArtifactManifest({
        workspaceRoot: options.workspaceRoot,
        entryPath: options.entryPath,
        artifactManifest: { ...manifest, metadata: mergeExportRecords(manifest.metadata, files.map((f) => ({ path: f.rel, format: f.format, exportedAt }))) },
      });
    } catch (err) {
      warnings.push(`Exported, but couldn't record the export in the manifest: ${err instanceof Error ? err.message : String(err)}`);
    }
    for (const w of warnings) if (w.startsWith('Failed to load: ')) findings.push({ check: 'broken-asset', severity: 'warning', message: w.slice('Failed to load: '.length) });
    return { ok: true, inline: options.format, target: options.target, files: written, findings, warnings, browserPath: browser.executablePath };
  } catch (err) {
    return { ok: false, code: 'capture-failed', error: `Export failed using ${browser.executablePath}: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    await session?.close();
  }
}

const PASTE_INTO: Record<PasteTarget, string> = {
  wechat: 'the WeChat Official Account editor',
  notion: 'a Notion page',
  newsletter: 'your newsletter tool',
  generic: 'any rich-text editor',
};

export function formatInlineExportResult(result: InlineExportResult): string {
  if (!result.ok) return `Export failed (${result.code}): ${result.error}`;
  const lines = [`Exported ${result.inline === 'email' ? 'an email' : `paste-ready HTML for ${result.target}`}:`, ...result.files.map((f) => `- ${f.path} — ${(f.bytes / 1024).toFixed(0)} KB`)];
  if (result.inline === 'email' || result.target === 'newsletter') lines.push(...formatPreflight(result.findings, 'export again'));
  else if (result.findings.length > 0) lines.push(...formatPreflight(result.findings, 'export again'));
  const target = result.inline === 'email' ? 'your email tool (or send a test to yourself first)' : PASTE_INTO[result.target!];
  lines.push(`To use it: open ${result.files[0].path} in a browser, select all, copy, and paste into ${target}.`);
  const warnings = result.warnings.filter((w) => !w.startsWith('Failed to load: '));
  if (warnings.length > 0) lines.push('Warnings:', ...warnings.map((w) => `- ${w}`));
  return lines.join('\n');
}
