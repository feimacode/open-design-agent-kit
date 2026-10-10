// The publish_open_design_artifact tool, shared by the VS Code and MCP
// hosts. Two modes:
//  - prepare (no `published`): builds the `site` bundle, then composes the
//    staged publish instructions for the chosen (or to-be-chosen) provider;
//  - record (`published` given): validates what the model reports after a
//    deploy and stores it in the manifest's `metadata.shares`.
// Never runs a provider command, never makes a network request.
// openspec: add-artifact-sharing.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { exportArtifact, formatExportResult } from '../export/exportArtifact';
import { readArtifact, writeArtifactManifest } from '../vendored/artifactCreate';
import {
  isExpired,
  isPublishProvider,
  latestShareFor,
  PUBLISH_PROVIDERS,
  readShareRecords,
  upsertShareRecord,
  validatePublished,
  type PublishedInput,
} from '../workspace/shareRecords';
import { composePublishInstructions, siteNameForShare, slugForShare } from './publishInstructions';
import { PUBLISH_RECIPES } from './publishProviders';

export interface PublishArtifactOptions {
  workspaceRoot: string;
  entryPath: string;
  provider?: string;
  badge?: boolean;
  /** Host setting (VS Code `openDesign.share.badge`). */
  badgeSetting?: boolean;
  /**
   * Workspace paths of files in the artifact's own exports/ folder (e.g. an
   * exported PDF) to host alongside the page, at files/<name> in the bundle
   * (openspec connect-canva-publish).
   */
  includeFiles?: string[];
  published?: PublishedInput;
  now?: Date;
}

export type PublishArtifactResult = { ok: boolean; text: string };

export async function publishArtifact(options: PublishArtifactOptions): Promise<PublishArtifactResult> {
  const now = options.now ?? new Date();
  if (options.provider !== undefined && !isPublishProvider(options.provider)) {
    return { ok: false, text: `Unknown provider "${options.provider}". Use one of: ${PUBLISH_PROVIDERS.join(', ')}.` };
  }

  let artifact;
  try {
    artifact = await readArtifact({ workspaceRoot: options.workspaceRoot, entryPath: options.entryPath });
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : String(err) };
  }
  if (!artifact) return { ok: false, text: `No artifact entry file found at ${options.entryPath}.` };
  if (!artifact.manifest) {
    return { ok: false, text: `${options.entryPath} exists but isn't registered (no .artifact.json sidecar). Call register_open_design_artifact first.` };
  }
  const manifest = artifact.manifest;
  const title = typeof manifest.title === 'string' ? manifest.title : undefined;

  if (options.published) {
    const validated = validatePublished(options.published, now);
    if (!validated.ok) return { ok: false, text: `Not recorded (invalid-args): ${validated.error}` };
    const { record } = validated;
    try {
      await writeArtifactManifest({
        workspaceRoot: options.workspaceRoot,
        entryPath: options.entryPath,
        artifactManifest: { ...manifest, metadata: upsertShareRecord(manifest.metadata, record) },
      });
    } catch (err) {
      return { ok: false, text: `Couldn't record the share in the manifest: ${err instanceof Error ? err.message : String(err)}` };
    }
    const lines = [`Recorded: ${options.entryPath} is published on ${PUBLISH_RECIPES[record.provider].label} at ${record.url}.`];
    if (record.expiresAt) lines.push(`It expires at ${record.expiresAt} unless claimed.`);
    if (record.claimUrl) lines.push('The claim URL is stored for the user; keep it out of anything posted publicly.');
    return { ok: true, text: lines.join('\n') };
  }

  const included = await resolveIncludedFiles(options.workspaceRoot, options.entryPath, options.includeFiles ?? []);
  if (!included.ok) return { ok: false, text: `${included.error}\n\nNothing was published.` };

  const records = readShareRecords(manifest);
  const provider = options.provider as (typeof PUBLISH_PROVIDERS)[number] | undefined;
  // og:image needs the address the site will be served from: the provider's newest live link.
  const previous = provider ? latestShareFor(records, provider) : undefined;
  const baseUrl = previous && !isExpired(previous, now) && !PUBLISH_RECIPES[provider!].temporary ? previous.url : undefined;

  const bundle = await exportArtifact({
    workspaceRoot: options.workspaceRoot,
    entryPath: options.entryPath,
    format: 'site',
    badge: options.badge,
    badgeSetting: options.badgeSetting,
    baseUrl,
  });
  if (!bundle.ok) return { ok: false, text: `${formatExportResult(bundle)}\n\nNothing was published.` };
  if (bundle.mode !== 'site') return { ok: false, text: 'The site export returned an unexpected result. Nothing was published.' };

  for (const f of included.files) {
    const dest = path.join(options.workspaceRoot, bundle.output, f.bundlePath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(path.join(options.workspaceRoot, f.sourcePath), dest);
  }
  const site = included.files.length
    ? {
        ...bundle,
        files: [...bundle.files, ...included.files.map((f) => ({ path: f.bundlePath, bytes: f.bytes }))],
        totalBytes: bundle.totalBytes + included.files.reduce((n, f) => n + f.bytes, 0),
      }
    : bundle;

  const slug = slugForShare(title, options.entryPath);
  const text = composePublishInstructions({
    entryPath: options.entryPath,
    title,
    bundle: site,
    bundleDir: path.join(options.workspaceRoot, bundle.output),
    includedFiles: included.files.map((f) => f.bundlePath),
    provider,
    records,
    siteName: siteNameForShare(slug),
    slug,
    today: now.toISOString().slice(0, 10),
  });
  return { ok: true, text };
}

interface IncludedFile {
  sourcePath: string;
  bundlePath: string;
  bytes: number;
}

/** Checks includeFiles: each must be an existing file in the artifact's exports/ folder (not the site bundle), with a unique name. */
async function resolveIncludedFiles(
  workspaceRoot: string,
  entryPath: string,
  requested: string[],
): Promise<{ ok: true; files: IncludedFile[] } | { ok: false; error: string }> {
  const exportsDir = path.posix.join(path.posix.dirname(entryPath.replace(/\\/g, '/')), 'exports');
  const files: IncludedFile[] = [];
  const names = new Set<string>();
  for (const raw of requested) {
    const rel = path.posix.normalize(raw.replace(/\\/g, '/'));
    if (!rel.startsWith(`${exportsDir}/`) || rel.startsWith(`${exportsDir}/site/`) || rel.includes('/../')) {
      return { ok: false, error: `includeFiles: ${raw} is not in this artifact's exports folder (${exportsDir}/). Export the file first, then pass its path.` };
    }
    const name = path.posix.basename(rel);
    if (names.has(name)) return { ok: false, error: `includeFiles: two files are named ${name}; include only one.` };
    names.add(name);
    let bytes: number;
    try {
      const stat = await fs.stat(path.join(workspaceRoot, rel));
      if (!stat.isFile()) throw new Error('not a file');
      bytes = stat.size;
    } catch {
      return { ok: false, error: `includeFiles: ${raw} doesn't exist. Export it first with export_open_design_artifact.` };
    }
    files.push({ sourcePath: rel, bundlePath: `files/${name}`, bytes });
  }
  return { ok: true, files };
}
