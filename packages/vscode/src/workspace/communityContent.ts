import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import * as tar from 'tar';
import type { ILogService } from '../extension/log/logService';

const CONFIG_SECTION = 'openDesign';
const REF_KEY = 'communityContentRef';
const ENABLED_KEY = 'communityContentEnabled';
// Tracks whether the extension has ever completed an auto-sync, so
// activate() only auto-fetches once (see B3 in the design) — separate from
// the ref/enabled settings, which the user can change any time.
const SYNCED_FLAG = 'openDesign.communityContentSynced';

const COMMUNITY_REPO_OWNER = 'feimacode';
const COMMUNITY_REPO_NAME = 'awesome-open-design';
// Mirrors DEFAULT_OPEN_DESIGN_REF's role in the build-time sync script: the
// tag this extension version ships knowing about, until the user (or a
// future extension default) points communityContentRef at something newer.
export const DEFAULT_COMMUNITY_CONTENT_REF = 'v0.1.0';

const FETCH_TIMEOUT_MS = 8000;
const DOWNLOAD_TIMEOUT_MS = 30000;

export function getCommunityContentRef(): string {
  const value = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(REF_KEY, DEFAULT_COMMUNITY_CONTENT_REF);
  return value.trim() || DEFAULT_COMMUNITY_CONTENT_REF;
}

export function isCommunityContentEnabled(): boolean {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>(ENABLED_KEY, true);
}

// Global, not Workspace-scoped: unlike activeDesignSystemId (deliberately
// per-project), which community pack you track is a personal preference
// that should follow the user across projects, not reset per workspace.
export async function setCommunityContentEnabled(enabled: boolean): Promise<void> {
  await vscode.workspace.getConfiguration(CONFIG_SECTION).update(ENABLED_KEY, enabled, vscode.ConfigurationTarget.Global);
}

// Deterministic and workspace-independent (unlike getUserDesignSystemsDir),
// so this never needs to return undefined — ContentIndex's loadExamples()
// already no-ops cleanly on a directory that doesn't exist yet (i.e. before
// the first sync).
export function getCommunityContentDir(context: vscode.ExtensionContext): string {
  return path.join(context.globalStorageUri.fsPath, 'community-content');
}

export function hasSyncedCommunityContentOnce(context: vscode.ExtensionContext): boolean {
  return context.globalState.get<boolean>(SYNCED_FLAG, false);
}

async function markSyncedOnce(context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(SYNCED_FLAG, true);
}

async function fetchWithTimeout(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Best-effort provenance only — resolveCommitSha never throws into the
// caller; a failure just leaves resolvedCommit undefined in MANIFEST.json.
async function resolveCommitSha(ref: string): Promise<string | undefined> {
  try {
    const res = await fetchWithTimeout(
      `https://api.github.com/repos/${COMMUNITY_REPO_OWNER}/${COMMUNITY_REPO_NAME}/git/ref/tags/${encodeURIComponent(ref)}`,
      FETCH_TIMEOUT_MS,
      { Accept: 'application/vnd.github+json' },
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { object?: { sha?: string } };
    return data.object?.sha;
  } catch {
    return undefined;
  }
}

export type SyncCommunityContentResult =
  | { ok: true; ref: string; exampleCount: number }
  | { ok: false; error: string };

/**
 * Fetches the tagged release named by `communityContentRef` from
 * awesome-open-design and replaces the local cache under
 * getCommunityContentDir(). No `git` dependency (an end user's machine
 * isn't guaranteed to have one, unlike the build-time sync script's own
 * `git clone` — see packages/content/scripts/sync-open-design-content.mjs):
 * a single HTTPS GET of the codeload tarball, extracted with the `tar`
 * package straight into a temp sibling directory, then renamed into place
 * atomically so an interrupted fetch can never leave ContentIndex reading a
 * half-written pool.
 */
export async function syncCommunityContent(context: vscode.ExtensionContext, log: ILogService): Promise<SyncCommunityContentResult> {
  const ref = getCommunityContentRef();
  const finalDir = getCommunityContentDir(context);
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-community-content-'));
  const tarPath = path.join(tmpRoot, 'archive.tar.gz');
  const extractDir = path.join(tmpRoot, 'extracted');

  try {
    log.info(`syncCommunityContent: fetching ${COMMUNITY_REPO_OWNER}/${COMMUNITY_REPO_NAME}@${ref}`);
    const tarballUrl = `https://codeload.github.com/${COMMUNITY_REPO_OWNER}/${COMMUNITY_REPO_NAME}/tar.gz/refs/tags/${encodeURIComponent(ref)}`;
    const res = await fetchWithTimeout(tarballUrl, DOWNLOAD_TIMEOUT_MS);
    if (!res.ok || !res.body) {
      return { ok: false, error: `Could not fetch awesome-open-design@${ref} (HTTP ${res.status}). Check the tag exists.` };
    }
    await fs.writeFile(tarPath, Buffer.from(await res.arrayBuffer()));

    await fs.mkdir(extractDir, { recursive: true });
    // `strip: 1` drops the top-level `<repo>-<ref>/` wrapper directory every
    // GitHub codeload tarball includes, so extractDir directly contains
    // examples/, README.md, etc. — the same layout as the built-in
    // assetsRoot's own `examples/` convention, so loadExamples() needs no
    // special-casing for the community root.
    await tar.x({ file: tarPath, cwd: extractDir, strip: 1 });

    const resolvedCommit = await resolveCommitSha(ref);
    const examplesDir = path.join(extractDir, 'examples');
    let exampleCount = 0;
    try {
      exampleCount = (await fs.readdir(examplesDir, { withFileTypes: true })).filter((e) => e.isDirectory()).length;
    } catch {
      exampleCount = 0;
    }

    await fs.writeFile(
      path.join(extractDir, 'MANIFEST.json'),
      JSON.stringify(
        {
          repo: `${COMMUNITY_REPO_OWNER}/${COMMUNITY_REPO_NAME}`,
          ref,
          resolvedCommit: resolvedCommit ?? null,
          syncedAt: new Date().toISOString(),
          exampleCount,
        },
        null,
        2,
      ),
    );

    // Atomic swap: remove the previous cache (if any), then rename the
    // freshly-extracted temp dir into its place. Never extract directly
    // over `finalDir` — a crash/offline mid-extraction must never leave
    // ContentIndex reading a half-written pool.
    await fs.rm(finalDir, { recursive: true, force: true });
    await fs.mkdir(path.dirname(finalDir), { recursive: true });
    await fs.rename(extractDir, finalDir);

    await markSyncedOnce(context);
    log.info(`syncCommunityContent: synced ${exampleCount} example(s) from ${ref}`);
    return { ok: true, ref, exampleCount };
  } catch (err) {
    log.error(err, 'syncCommunityContent: failed');
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
