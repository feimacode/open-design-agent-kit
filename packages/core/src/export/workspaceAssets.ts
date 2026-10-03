// Reads files an artifact references, strictly inside the workspace: the
// path is workspace-relative, `..` escapes are refused, and a symlink whose
// target lies outside the workspace is refused too. Shared by the
// `standalone` (vendored bundler's readAsset) and `site` export formats.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { StandaloneAssetHandle } from '../vendored/standaloneHtml';

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

export function mimeForPath(filePath: string): string {
  return MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** A workspace-relative posix path with no `..` escape and no absolute form, else undefined. */
export function normalizeWorkspacePath(relPath: string): string | undefined {
  const normalized = path.posix.normalize(relPath.replace(/\\/g, '/')).replace(/^\.\//, '');
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    return undefined;
  }
  return normalized;
}

export class OutsideWorkspaceError extends Error {
  constructor(readonly relPath: string) {
    super(`${relPath} resolves outside the workspace.`);
    this.name = 'OutsideWorkspaceError';
  }
}

export type WorkspaceEntry = { kind: 'file'; absPath: string; size: number } | { kind: 'directory'; absPath: string } | { kind: 'missing' };

/** Stats a workspace-relative path after resolving symlinks; throws OutsideWorkspaceError for escapes. */
export async function statWorkspacePath(workspaceRoot: string, relPath: string): Promise<WorkspaceEntry> {
  const normalized = normalizeWorkspacePath(relPath);
  if (!normalized) throw new OutsideWorkspaceError(relPath);
  const rootReal = await fs.realpath(workspaceRoot);
  let real: string;
  try {
    real = await fs.realpath(path.join(rootReal, normalized));
  } catch {
    return { kind: 'missing' };
  }
  const rel = path.relative(rootReal, real);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new OutsideWorkspaceError(relPath);
  const stat = await fs.stat(real);
  if (stat.isDirectory()) return { kind: 'directory', absPath: real };
  if (!stat.isFile()) return { kind: 'missing' };
  return { kind: 'file', absPath: real, size: stat.size };
}

/** The vendored bundler's `readAsset`: null for a missing file, so it reports the dependency chain. */
export function workspaceAssetReader(workspaceRoot: string): (relPath: string) => Promise<StandaloneAssetHandle | null> {
  return async (relPath) => {
    const entry = await statWorkspacePath(workspaceRoot, relPath);
    if (entry.kind !== 'file') return null;
    return { mime: mimeForPath(relPath), size: entry.size, read: () => fs.readFile(entry.absPath) };
  };
}
