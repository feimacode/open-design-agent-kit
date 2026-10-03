// The browserless export formats: `standalone` (one self-contained .html,
// via the vendored upstream bundler) and `site` (a deploy-ready folder).
// Called by exportArtifact() before any browser lookup. openspec:
// add-artifact-sharing.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { JsonRecord } from '../vendored/artifactManifest';
import { writeArtifactManifest } from '../vendored/artifactCreate';
import { bundleStandaloneHtml, StandaloneHtmlExportError } from '../vendored/standaloneHtml';
import { EXPORTS_BY_KIND, PACKAGEABLE_KINDS } from './exportFormats';
import { injectBadge, injectLinkPreviewTags, resolveBadge, type PackageFormat } from './shareDecorations';
import { analyzeSiteBundle, planSiteBundle, writeSiteBundle, type PreflightWarning, type SiteFile } from './siteBundle';
import { OutsideWorkspaceError, workspaceAssetReader } from './workspaceAssets';

export type { PackageFormat } from './shareDecorations';
export const PACKAGE_FORMATS: readonly PackageFormat[] = ['standalone', 'site'];

export function isPackageFormat(format: string | undefined): format is PackageFormat {
  return format === 'standalone' || format === 'site';
}

// The first three come from exportArtifact()'s shared argument and artifact checks.
export type PackageErrorCode =
  | 'invalid-args'
  | 'not-found'
  | 'not-registered'
  | 'unsupported-format'
  | 'missing-references'
  | 'path-outside-workspace'
  | 'package-failed';

export interface PackagedFile {
  /** Workspace-relative (standalone) or bundle-relative (site), forward slashes. */
  path: string;
  bytes: number;
}

export type PackageExportResult =
  | {
      ok: true;
      mode: PackageFormat;
      /** Workspace-relative output: the .html file (standalone) or the bundle folder (site). */
      output: string;
      files: PackagedFile[];
      totalBytes: number;
      badge: boolean;
      /** Whether the bundle carries og.png, and whether og:image was emitted (site only). */
      ogImage?: { file: boolean; tag: boolean };
      preflight: PreflightWarning[];
      externalDependencies: string[];
      warnings: string[];
    }
  | { ok: false; code: PackageErrorCode; error: string };

export interface PackageArtifactInput {
  workspaceRoot: string;
  /** Workspace-relative, forward slashes. */
  entryPath: string;
  entryContent: string;
  manifest: JsonRecord;
  format: PackageFormat;
  badge?: boolean;
  /** Host setting (VS Code `openDesign.share.badge`); false turns the badge off. */
  badgeSetting?: boolean;
  /** Absolute https URL the site will be served from, for og:image. */
  baseUrl?: string;
}

function fail(code: PackageErrorCode, error: string): PackageExportResult {
  return { ok: false, code, error };
}

function exportsDirFor(entryPath: string): string {
  return path.posix.join(path.posix.dirname(entryPath), 'exports');
}

function baseName(entryPath: string): string {
  return path.posix.basename(entryPath, path.posix.extname(entryPath));
}

function manifestDescription(manifest: JsonRecord): string | undefined {
  const metadata = manifest.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const description = (metadata as JsonRecord).description;
    if (typeof description === 'string') return description;
  }
  return undefined;
}

/** `standalone`/`site` apply to html, mini-app and deck kinds, even when an older manifest's `exports` omits them. */
export function checkPackageable(manifest: JsonRecord, format: PackageFormat): string | undefined {
  const kind = typeof manifest.kind === 'string' ? manifest.kind : 'html';
  if (PACKAGEABLE_KINDS.has(kind)) return undefined;
  const supported = EXPORTS_BY_KIND[kind];
  return `"${format}" packages HTML pages, decks and mini-apps; a ${kind} artifact can be exported as ${supported ? supported.join(', ') : 'nothing'}.`;
}

export async function packageArtifact(input: PackageArtifactInput): Promise<PackageExportResult> {
  const notPackageable = checkPackageable(input.manifest, input.format);
  if (notPackageable) return fail('unsupported-format', notPackageable);
  const badge = resolveBadge(input.format, input.badge, undefined, input.badgeSetting);
  const result = input.format === 'standalone' ? await packageStandalone(input, badge) : await packageSite(input, badge);
  if (!result.ok) return result;

  try {
    const record = { path: result.output, format: input.format, bytes: result.totalBytes, exportedAt: new Date().toISOString() };
    const base: JsonRecord =
      input.manifest.metadata && typeof input.manifest.metadata === 'object' && !Array.isArray(input.manifest.metadata)
        ? { ...(input.manifest.metadata as JsonRecord) }
        : {};
    const existing = Array.isArray(base.exports) ? (base.exports as JsonRecord[]) : [];
    base.exports = [...existing.filter((r) => r?.path !== record.path), record];
    await writeArtifactManifest({ workspaceRoot: input.workspaceRoot, entryPath: input.entryPath, artifactManifest: { ...input.manifest, metadata: base } });
  } catch (err) {
    result.warnings.push(`Exported, but couldn't record the export in the manifest: ${err instanceof Error ? err.message : String(err)}`);
  }
  return result;
}

async function packageStandalone(input: PackageArtifactInput, badge: boolean): Promise<PackageExportResult> {
  let bundled;
  try {
    bundled = await bundleStandaloneHtml({
      entryPath: input.entryPath,
      html: input.entryContent,
      readAsset: workspaceAssetReader(input.workspaceRoot),
    });
  } catch (err) {
    if (err instanceof OutsideWorkspaceError) return fail('path-outside-workspace', err.message);
    if (err instanceof StandaloneHtmlExportError) {
      const chain = err.chain.length > 1 ? ` (via ${err.chain.join(' → ')})` : '';
      if (err.kind === 'missing-local-dependency') return fail('missing-references', `Missing file: ${err.dependency ?? err.message}${chain}`);
      if (err.kind === 'path-outside-project') return fail('path-outside-workspace', `${err.dependency ?? err.message} is outside the workspace${chain}.`);
      return fail('package-failed', `${err.message}${chain}`);
    }
    return fail('package-failed', err instanceof Error ? err.message : String(err));
  }
  const html = badge ? injectBadge(bundled.html) : bundled.html;
  const output = path.posix.join(exportsDirFor(input.entryPath), `${baseName(input.entryPath)}.html`);
  const abs = path.join(input.workspaceRoot, output);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, html);
  const bytes = Buffer.byteLength(html, 'utf8');
  const warnings = bundled.externalDependencies.map((url) => `Still loads from another site at view time (not inlined): ${url}`);
  if (bytes > 10 * 1024 * 1024) warnings.push(`${output} is ${(bytes / (1024 * 1024)).toFixed(1)} MiB — for hosting, the "site" format keeps large images as separate files.`);
  return {
    ok: true,
    mode: 'standalone',
    output,
    files: [{ path: output, bytes }],
    totalBytes: bytes,
    badge,
    preflight: [],
    externalDependencies: bundled.externalDependencies,
    warnings,
  };
}

async function packageSite(input: PackageArtifactInput, badge: boolean): Promise<PackageExportResult> {
  const supportingFiles = Array.isArray(input.manifest.supportingFiles)
    ? (input.manifest.supportingFiles as unknown[]).filter((f): f is string => typeof f === 'string')
    : [];
  const planned = await planSiteBundle({ workspaceRoot: input.workspaceRoot, entryPath: input.entryPath, html: input.entryContent, supportingFiles });
  if (!planned.ok) {
    const parts: string[] = [];
    if (planned.missing.length > 0) parts.push(`missing: ${planned.missing.join(', ')}`);
    if (planned.invalid.length > 0) parts.push(`outside the workspace or not placeable: ${planned.invalid.join(', ')}`);
    return fail('missing-references', `The page references files that can't be bundled (${parts.join('; ')}). Fix or remove those references and try again.`);
  }
  const { plan } = planned;
  const exportsDir = exportsDirFor(input.entryPath);
  const warnings: string[] = [];

  const extra = new Map<string, Buffer>();
  let ogFile = false;
  try {
    const png = await fs.readFile(path.join(input.workspaceRoot, exportsDir, `${baseName(input.entryPath)}.png`));
    if (plan.files.some((f) => f.bundlePath === 'og.png')) warnings.push('The page already has an og.png of its own; the PNG export was not copied over it.');
    else {
      extra.set('og.png', png);
      ogFile = true;
    }
  } catch {
    // No PNG export yet: link previews show title and description only.
  }
  const baseUrl = input.baseUrl && /^https:\/\//i.test(input.baseUrl) ? input.baseUrl : undefined;
  if (input.baseUrl && !baseUrl) warnings.push(`Ignored baseUrl "${input.baseUrl}": og:image needs an https URL.`);

  const title = typeof input.manifest.title === 'string' ? input.manifest.title : undefined;
  let indexHtml = injectLinkPreviewTags(plan.indexHtml, { title, description: manifestDescription(input.manifest), baseUrl, hasImage: ogFile });
  if (badge) indexHtml = injectBadge(indexHtml);

  const files: SiteFile[] = [
    { bundlePath: 'index.html', bytes: Buffer.byteLength(indexHtml, 'utf8') },
    ...plan.files,
    ...[...extra].map(([bundlePath, data]) => ({ bundlePath, bytes: data.length })),
  ];
  const { warnings: preflight, totalBytes } = analyzeSiteBundle({ entryPath: input.entryPath, html: input.entryContent, files });
  const output = path.posix.join(exportsDir, 'site');
  try {
    await writeSiteBundle({ workspaceRoot: input.workspaceRoot, outDir: output, indexHtml, files: plan.files, extra });
  } catch (err) {
    return fail('package-failed', `Couldn't write ${output}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (plan.baseDir !== path.posix.dirname(input.entryPath)) {
    warnings.push(`The page uses files outside its own folder, so the bundle root is ${plan.baseDir}/ and references in index.html were rewritten.`);
  }
  return {
    ok: true,
    mode: 'site',
    output,
    files: files.map((f) => ({ path: f.bundlePath, bytes: f.bytes })),
    totalBytes,
    badge,
    ogImage: { file: ogFile, tag: ogFile && baseUrl !== undefined },
    preflight,
    externalDependencies: [],
    warnings,
  };
}

/** Compact, model-friendly text for a packaging result. */
export function formatPackageResult(result: PackageExportResult): string {
  if (!result.ok) return `Export failed (${result.code}): ${result.error}`;
  const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;
  const lines =
    result.mode === 'standalone'
      ? [`Exported a self-contained HTML file: ${result.output} — ${kb(result.totalBytes)}.`]
      : [
          `Exported a deploy-ready site folder: ${result.output}/ — ${result.files.length} file(s), ${kb(result.totalBytes)} total:`,
          ...result.files.map((f) => `- ${f.path} — ${kb(f.bytes)}`),
        ];
  lines.push(result.badge ? 'Footer badge: included ("Made with Open Design"; pass badge: false to leave it out).' : 'Footer badge: not included.');
  if (result.ogImage) {
    lines.push(
      result.ogImage.tag
        ? 'Link preview: title, description and image.'
        : result.ogImage.file
          ? 'Link preview: title and description; og.png is bundled, and og:image is added once the site URL is known (republish).'
          : 'Link preview: title and description (export a PNG first to add a preview image).',
    );
  }
  if (result.preflight.length > 0) lines.push('Preflight:', ...result.preflight.map((w) => `- [${w.code}] ${w.message}`));
  if (result.warnings.length > 0) lines.push('Warnings:', ...result.warnings.map((w) => `- ${w}`));
  return lines.join('\n');
}
