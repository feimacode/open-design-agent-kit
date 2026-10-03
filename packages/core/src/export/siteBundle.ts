// The `site` export: a deploy-ready folder whose `index.html` is the entry
// and whose other files are everything the entry references, at the same
// relative layout. The file plan and preflight are adapted from upstream
// open-design apps/daemon/src/deploy.ts (buildDeployFilePlan,
// analyzeDeployPlan) at commit 1b47e60bd466 (Apache-2.0; see vendored/SOURCE.md).
// openspec: add-artifact-sharing.
import { parse as parseJs } from '@babel/parser';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  extractCssReferences,
  extractHtmlReferences,
  extractInlineCssReferences,
  isExternalUrl,
  parseHtmlTags,
  resolveReferencedPath,
  rewriteEntryHtmlReferences,
} from './htmlReferences';
import { OutsideWorkspaceError, statWorkspacePath } from './workspaceAssets';

export const PREFLIGHT_LARGE_ASSET_BYTES = 5 * 1024 * 1024;
export const PREFLIGHT_LARGE_HTML_BYTES = 2 * 1024 * 1024;
export const PREFLIGHT_LARGE_BUNDLE_BYTES = 50 * 1024 * 1024;

export type PreflightCode =
  | 'large-asset'
  | 'large-html'
  | 'large-bundle'
  | 'no-doctype'
  | 'no-viewport'
  | 'external-script'
  | 'external-stylesheet'
  | 'hidden-path';

export interface PreflightWarning {
  code: PreflightCode;
  message: string;
  path?: string;
  url?: string;
}

export interface SiteFile {
  /** Path inside the bundle, forward slashes. */
  bundlePath: string;
  /** Workspace-relative source path; undefined for generated files (index.html). */
  sourcePath?: string;
  bytes: number;
}

export interface SitePlan {
  /** Workspace-relative folder that maps to the bundle root. */
  baseDir: string;
  /** Final index.html text (references rewritten, not yet decorated). */
  indexHtml: string;
  files: SiteFile[];
}

export type SitePlanResult = { ok: true; plan: SitePlan } | { ok: false; missing: string[]; invalid: string[] };

/**
 * Relative module specifiers a script loads: static `import`/`export ... from`
 * and `import('literal')`. Bare specifiers (`react`) are left to the page's
 * import map or CDN. Not in upstream's deploy plan, which ships only what the
 * HTML and CSS reference, so a page whose module imports a sibling would 404.
 */
export function extractJsImports(code: string): string[] {
  let ast;
  try {
    ast = parseJs(code, { sourceType: 'unambiguous', errorRecovery: true, plugins: ['jsx', 'typescript', 'importAttributes'] });
  } catch {
    return [];
  }
  const found: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    const n = node as { type?: string; source?: { type?: string; value?: unknown }; callee?: { type?: string }; arguments?: Array<{ type?: string; value?: unknown }> };
    if ((n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && typeof n.source?.value === 'string') {
      found.push(n.source.value);
    } else if (n.type === 'ImportExpression' && n.source?.type === 'StringLiteral' && typeof n.source.value === 'string') {
      found.push(n.source.value);
    } else if (n.type === 'CallExpression' && n.callee?.type === 'Import' && n.arguments?.[0]?.type === 'StringLiteral' && typeof n.arguments[0].value === 'string') {
      found.push(n.arguments[0].value);
    }
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'loc' && key !== 'start' && key !== 'end' && value && typeof value === 'object') visit(value);
    }
  };
  visit(ast.program);
  return found.filter((spec) => spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/'));
}

/** Bodies of the entry's inline <script> blocks without src (comments skipped). */
function inlineScriptBodies(html: string): string[] {
  const bodies: string[] = [];
  const re = /<script\b([^<>]*)>([\s\S]*?)<\/script\s*>/gi;
  const comments = [...html.matchAll(/<!--[\s\S]*?-->/g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  let match;
  while ((match = re.exec(html))) {
    const at = match.index;
    if (comments.some(([a, b]) => at >= a && at < b)) continue;
    if (/\bsrc\s*=/i.test(match[1] ?? '')) continue;
    bodies.push(match[2] ?? '');
  }
  return bodies;
}

function commonDir(dirs: string[]): string {
  const split = dirs.map((d) => (d === '.' || d === '' ? [] : d.split('/')));
  const first = split[0] ?? [];
  let n = first.length;
  for (const parts of split.slice(1)) {
    let i = 0;
    while (i < n && i < parts.length && parts[i] === first[i]) i++;
    n = i;
  }
  return first.slice(0, n).join('/') || '.';
}

function relativeToBase(baseDir: string, workspacePath: string): string {
  return baseDir === '.' ? workspacePath : path.posix.relative(baseDir, workspacePath);
}

/**
 * Walks the entry's references (HTML attributes, inline CSS, linked CSS
 * recursively, relative imports of local scripts, inline module scripts, and
 * the manifest's supportingFiles) and lays them out
 * relative to the deepest folder that holds them all. Missing files and
 * references outside the workspace fail the plan, listing every one.
 */
export async function planSiteBundle(input: {
  workspaceRoot: string;
  /** Workspace-relative, forward slashes. */
  entryPath: string;
  html: string;
  supportingFiles?: string[];
}): Promise<SitePlanResult> {
  const entryDir = path.posix.dirname(input.entryPath);
  // Never bundle a previous bundle (a supportingFiles folder could reach it).
  const previousBundle = path.posix.join(entryDir, 'exports', 'site');
  const pending: { ref: string; base: string }[] = [
    ...extractHtmlReferences(input.html).map((ref) => ({ ref, base: entryDir })),
    ...extractInlineCssReferences(input.html).map((ref) => ({ ref, base: entryDir })),
    ...inlineScriptBodies(input.html).flatMap((code) => extractJsImports(code).map((ref) => ({ ref, base: entryDir }))),
    ...(input.supportingFiles ?? []).map((ref) => ({ ref, base: entryDir })),
  ];
  const files = new Map<string, number>();
  const missing: string[] = [];
  const invalid: string[] = [];
  const visited = new Set<string>([input.entryPath]);

  while (pending.length > 0) {
    const { ref, base } = pending.shift()!;
    const resolved = resolveReferencedPath(ref, base);
    if (!resolved || visited.has(resolved)) continue;
    visited.add(resolved);
    if (resolved === previousBundle || resolved.startsWith(`${previousBundle}/`)) continue;
    let entry;
    try {
      entry = await statWorkspacePath(input.workspaceRoot, resolved);
    } catch (err) {
      if (err instanceof OutsideWorkspaceError) {
        invalid.push(ref);
        continue;
      }
      throw err;
    }
    if (entry.kind === 'missing') {
      missing.push(resolved);
      continue;
    }
    if (entry.kind === 'directory') {
      // A supportingFiles entry may name a folder: include what's in it.
      for (const name of await fs.readdir(entry.absPath)) pending.push({ ref: path.posix.join(resolved, name), base: '.' });
      continue;
    }
    files.set(resolved, entry.size);
    if (/\.css$/i.test(resolved)) {
      const css = await fs.readFile(entry.absPath, 'utf8');
      for (const cssRef of extractCssReferences(css)) pending.push({ ref: cssRef, base: path.posix.dirname(resolved) });
    } else if (/\.(m?js|jsx)$/i.test(resolved)) {
      const code = await fs.readFile(entry.absPath, 'utf8');
      for (const spec of extractJsImports(code)) pending.push({ ref: spec, base: path.posix.dirname(resolved) });
    }
  }
  if (missing.length > 0 || invalid.length > 0) return { ok: false, missing, invalid };

  const baseDir = commonDir([entryDir, ...[...files.keys()].map((f) => path.posix.dirname(f))]);
  const bundled: SiteFile[] = [];
  for (const [sourcePath, bytes] of files) {
    const bundlePath = relativeToBase(baseDir, sourcePath);
    if (bundlePath === 'index.html') {
      // The entry owns the bundle's index.html; a referenced file of the same name can't be placed.
      return { ok: false, missing: [], invalid: [sourcePath] };
    }
    bundled.push({ bundlePath, sourcePath, bytes });
  }
  // index.html sits at the bundle root, so every reference becomes root-relative-free bundle-relative.
  const indexHtml = rewriteEntryHtmlReferences(input.html, entryDir, (resolved) =>
    files.has(resolved) ? relativeToBase(baseDir, resolved) : undefined,
  );
  return { ok: true, plan: { baseDir, indexHtml, files: bundled } };
}

/** Deploy-quality findings that never fail the bundle. */
export function analyzeSiteBundle(input: { entryPath: string; html: string; files: SiteFile[] }): { warnings: PreflightWarning[]; totalBytes: number } {
  const warnings: PreflightWarning[] = [];
  const seen = new Set<string>();
  const push = (w: PreflightWarning) => {
    const key = `${w.code}:${w.path ?? ''}:${w.url ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    warnings.push(w);
  };
  const mib = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;

  let totalBytes = 0;
  for (const f of input.files) {
    totalBytes += f.bytes;
    if (f.bundlePath === 'index.html') {
      if (f.bytes > PREFLIGHT_LARGE_HTML_BYTES) {
        push({ code: 'large-html', path: input.entryPath, message: `The entry HTML is ${mib(f.bytes)}; large HTML slows the first paint.` });
      }
      continue;
    }
    if (f.bytes > PREFLIGHT_LARGE_ASSET_BYTES) {
      push({ code: 'large-asset', path: f.bundlePath, message: `${f.bundlePath} is ${mib(f.bytes)}; consider compressing it.` });
    }
    if (f.bundlePath.split('/').some((seg) => seg.startsWith('.'))) {
      push({ code: 'hidden-path', path: f.bundlePath, message: `${f.bundlePath} is under a dot-folder, which some hosts (GitHub Pages without .nojekyll) don't serve.` });
    }
  }
  if (totalBytes > PREFLIGHT_LARGE_BUNDLE_BYTES) {
    push({ code: 'large-bundle', message: `The bundle is ${mib(totalBytes)}; some hosts limit uploads (Cloudflare: 25 MiB per file).` });
  }

  // Anchored to the prolog so a doctype inside a script string doesn't count (tempered comment body: no ReDoS).
  if (!new RegExp('^\\uFEFF?\\s*(?:<!--(?:[^-]|-(?!->))*-->\\s*)*<!doctype\\s+html', 'i').test(input.html)) {
    push({ code: 'no-doctype', path: input.entryPath, message: 'The entry has no <!DOCTYPE html>; browsers may render it in quirks mode.' });
  }
  let hasViewport = false;
  for (const tag of parseHtmlTags(input.html)) {
    if (tag.name === 'meta' && (tag.attrs.get('name') ?? '').toLowerCase() === 'viewport') hasViewport = true;
    if (tag.name === 'script') {
      const src = tag.attrs.get('src');
      if (isExternalUrl(src)) push({ code: 'external-script', path: input.entryPath, url: src, message: `Loads a script from another site at view time: ${src}` });
    }
    if (tag.name === 'link') {
      const rel = (tag.attrs.get('rel') ?? '').toLowerCase().split(/\s+/);
      const href = tag.attrs.get('href');
      if (rel.includes('stylesheet') && isExternalUrl(href)) {
        push({ code: 'external-stylesheet', path: input.entryPath, url: href, message: `Loads a stylesheet from another site at view time: ${href}` });
      }
    }
  }
  if (!hasViewport) {
    push({ code: 'no-viewport', path: input.entryPath, message: 'The entry has no <meta name="viewport">; it will render zoomed out on phones.' });
  }
  return { warnings, totalBytes };
}

/**
 * Writes the bundle into a fresh sibling temp folder, then swaps it into
 * place, so a failed write never leaves a half-built `site/` behind.
 */
export async function writeSiteBundle(input: {
  workspaceRoot: string;
  /** Workspace-relative bundle folder, e.g. `.open-design/pitch/exports/site`. */
  outDir: string;
  indexHtml: string;
  files: SiteFile[];
  /** Extra generated files (e.g. og.png), bundle path → bytes. */
  extra?: Map<string, Buffer>;
}): Promise<void> {
  const absOut = path.join(input.workspaceRoot, input.outDir);
  const parent = path.dirname(absOut);
  await fs.mkdir(parent, { recursive: true });
  const tmp = await fs.mkdtemp(path.join(parent, '.site-'));
  try {
    await fs.writeFile(path.join(tmp, 'index.html'), input.indexHtml);
    for (const f of input.files) {
      if (!f.sourcePath) continue;
      const dest = path.join(tmp, f.bundlePath);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(path.join(input.workspaceRoot, f.sourcePath), dest);
    }
    for (const [bundlePath, data] of input.extra ?? []) {
      const dest = path.join(tmp, bundlePath);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, data);
    }
    await fs.rm(absOut, { recursive: true, force: true });
    await fs.rename(tmp, absOut);
  } catch (err) {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}
