import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface ArtifactComment {
  id: string;
  elementId?: string;
  selector: string;
  htmlHint: string;
  note: string;
  status: 'open' | 'sent' | 'resolved';
  createdAt: string;
  updatedAt: string;
}

export function commentsSidecarPath(entryPath: string): string {
  return `${entryPath}.comments.json`;
}

// See the identical comment in vendored/artifactCreate.ts: an absolute
// entryPath must be used as-is, not re-joined onto workspaceRoot, or it
// silently resolves to a bogus nested path instead of the real file.
function assertWorkspaceRelative(workspaceRoot: string, entryPath: string): string {
  const abs = path.isAbsolute(entryPath) ? entryPath : path.join(workspaceRoot, entryPath);
  const rel = path.relative(workspaceRoot, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`entryPath escapes the workspace: ${entryPath}`);
  }
  return abs;
}

export async function readArtifactComments(workspaceRoot: string, entryPath: string): Promise<ArtifactComment[]> {
  const absSidecar = assertWorkspaceRelative(workspaceRoot, commentsSidecarPath(entryPath));
  try {
    const raw = await fs.readFile(absSidecar, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ArtifactComment[]) : [];
  } catch {
    return [];
  }
}

export async function writeArtifactComments(workspaceRoot: string, entryPath: string, comments: ArtifactComment[]): Promise<void> {
  const absSidecar = assertWorkspaceRelative(workspaceRoot, commentsSidecarPath(entryPath));
  await fs.writeFile(absSidecar, JSON.stringify(comments, null, 2) + '\n', 'utf8');
}
