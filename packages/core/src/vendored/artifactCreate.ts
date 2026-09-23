// Adapted from open-design's apps/daemon/src/artifacts/create.ts (commit
// eca7c7ab9898, see ./SOURCE.md). The daemon version's writeProjectFile is
// an injected callback so the same code can target an HTTP-backed project
// store; this extension only ever writes to the local workspace filesystem,
// so that indirection is dropped in favor of plain fs/promises calls scoped
// to workspaceRoot. resolveArtifactManifest / manifest validation behavior
// is unchanged from upstream.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { inferLegacyManifest, validateArtifactManifestInput, type JsonRecord } from './artifactManifest';

export class ArtifactManifestRequiredError extends Error {
  code = 'ARTIFACT_MANIFEST_REQUIRED' as const;
  constructor(entry: string) {
    super(`artifactManifest is required for ${entry}; no safe default manifest can be inferred`);
  }
}

export class ArtifactManifestInvalidError extends Error {
  code = 'ARTIFACT_MANIFEST_INVALID' as const;
  constructor(message: string) {
    super(`invalid artifactManifest: ${message}`);
  }
}

export class ArtifactEntryMissingError extends Error {
  code = 'ARTIFACT_ENTRY_MISSING' as const;
  constructor(entryPath: string) {
    super(
      `entry file does not exist yet: ${entryPath}. Write it first with your file-editing tools, then call register_open_design_artifact.`,
    );
  }
}

export interface ResolveArtifactManifestInput {
  entry: string;
  artifactManifest?: unknown;
}

export function resolveArtifactManifest(input: ResolveArtifactManifestInput): JsonRecord {
  const manifest =
    input.artifactManifest !== undefined && input.artifactManifest !== null
      ? input.artifactManifest
      : inferLegacyManifest(input.entry);
  if (manifest) {
    const validated = validateArtifactManifestInput(manifest, input.entry);
    if (!validated.ok) throw new ArtifactManifestInvalidError(validated.error);
    return validated.value as JsonRecord;
  }
  throw new ArtifactManifestRequiredError(input.entry);
}

export function artifactManifestSidecarPath(entryPath: string): string {
  return `${entryPath}.artifact.json`;
}

function assertWorkspaceRelative(workspaceRoot: string, entryPath: string): string {
  // path.join treats an absolute second argument the same as a relative
  // one (concatenating segments, never discarding workspaceRoot) — so a
  // caller that accidentally passes an already-absolute entryPath (e.g. a
  // model echoing back a path VS Code itself reported as absolute) doesn't
  // "escape" the workspace, it silently resolves to a bogus NESTED path
  // that doesn't exist (`<root>/<root-with-leading-slash-stripped>/...`),
  // producing a confusing "not found" for a file that's really there. Use
  // an absolute entryPath as-is instead of re-joining it; the boundary
  // check below still rejects it if it genuinely isn't under workspaceRoot.
  const abs = path.isAbsolute(entryPath) ? entryPath : path.join(workspaceRoot, entryPath);
  const rel = path.relative(workspaceRoot, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`entryPath escapes the workspace: ${entryPath}`);
  }
  return abs;
}

export async function writeArtifactManifest(options: {
  workspaceRoot: string;
  entryPath: string;
  artifactManifest?: unknown;
}): Promise<JsonRecord> {
  const absEntry = assertWorkspaceRelative(options.workspaceRoot, options.entryPath);
  try {
    await fs.access(absEntry);
  } catch {
    throw new ArtifactEntryMissingError(options.entryPath);
  }

  const manifest = resolveArtifactManifest({ entry: options.entryPath, artifactManifest: options.artifactManifest });
  const absSidecar = assertWorkspaceRelative(options.workspaceRoot, artifactManifestSidecarPath(options.entryPath));
  await fs.writeFile(absSidecar, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}

export interface ReadArtifactResult {
  manifest: JsonRecord | null;
  entryContent: string;
  supportingFiles: string[];
}

export async function readArtifact(options: {
  workspaceRoot: string;
  entryPath: string;
}): Promise<ReadArtifactResult | null> {
  const absEntry = assertWorkspaceRelative(options.workspaceRoot, options.entryPath);
  let entryContent: string;
  try {
    entryContent = await fs.readFile(absEntry, 'utf8');
  } catch {
    return null;
  }

  const absSidecar = assertWorkspaceRelative(options.workspaceRoot, artifactManifestSidecarPath(options.entryPath));
  let manifest: JsonRecord | null = null;
  try {
    manifest = JSON.parse(await fs.readFile(absSidecar, 'utf8'));
  } catch {
    manifest = null;
  }

  const supportingFiles = Array.isArray(manifest?.supportingFiles) ? (manifest!.supportingFiles as string[]) : [];
  return { manifest, entryContent, supportingFiles };
}
