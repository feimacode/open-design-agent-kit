import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface CopyExampleResult {
  /** Paths of copied supporting files, relative to the entry file's own directory. */
  supportingFiles: string[];
}

async function listFilesRecursive(dir: string, baseDir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(full, baseDir)));
    } else if (entry.isFile()) {
      out.push(path.relative(baseDir, full).split(path.sep).join('/'));
    }
  }
  return out;
}

/**
 * Copies a vendored example artifact (example.html + a sibling assets/
 * folder, if present) into the workspace at entryPath. `assetsRoot` is
 * always one of a small, caller-resolved set of known roots (the bundled
 * built-in assets, or the runtime-fetched community-content cache — see
 * resolveContentRoot) — never a path derived from arbitrary user/model
 * input — so only the destination needs a workspace-escape guard.
 */
export async function copyExampleArtifact(options: {
  assetsRoot: string;
  exampleArtifactPath: string;
  workspaceRoot: string;
  entryPath: string;
}): Promise<CopyExampleResult> {
  const sourceHtmlAbs = path.join(options.assetsRoot, options.exampleArtifactPath);
  const sourceDir = path.dirname(sourceHtmlAbs);

  // See the identical comment in vendored/artifactCreate.ts: an absolute
  // entryPath must be used as-is, not re-joined onto workspaceRoot, or it
  // silently resolves to a bogus nested path instead of the real file.
  const destHtmlAbs = path.isAbsolute(options.entryPath) ? options.entryPath : path.join(options.workspaceRoot, options.entryPath);
  const destRel = path.relative(options.workspaceRoot, destHtmlAbs);
  if (destRel.startsWith('..') || path.isAbsolute(destRel)) {
    throw new Error(`entryPath escapes the workspace: ${options.entryPath}`);
  }
  const destDir = path.dirname(destHtmlAbs);

  await fs.mkdir(destDir, { recursive: true });
  await fs.copyFile(sourceHtmlAbs, destHtmlAbs);

  const sourceAssetsDir = path.join(sourceDir, 'assets');
  let supportingFiles: string[] = [];
  try {
    await fs.access(sourceAssetsDir);
    const destAssetsDir = path.join(destDir, 'assets');
    await fs.cp(sourceAssetsDir, destAssetsDir, { recursive: true });
    supportingFiles = await listFilesRecursive(destAssetsDir, destDir);
  } catch {
    // No assets/ directory alongside this example — nothing more to copy.
  }

  return { supportingFiles };
}
