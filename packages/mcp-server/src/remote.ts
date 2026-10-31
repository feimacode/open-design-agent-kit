// The remote profile (openspec add-remote-mcp-server, phase 1): what changes
// when the server runs as a hosted MCP endpoint for ChatGPT web, Claude web and
// other remote clients instead of a local stdio process.
//
// - Every MCP session gets its own folder under the data directory and works
//   like a Claude Desktop chat with no folder: the agent opens a design folder
//   with use_open_design_managed_workspace and saves files with
//   write_open_design_file.
// - Tools that need the user's own disk, a browser window on their machine, a
//   token of theirs, or that would fetch arbitrary URLs from the server, are
//   hidden (REMOTE_HIDDEN_TOOLS). Every tool must be classified here.
// - Per-session limits, a request rate limit, signed expiring download links
//   for exports, and an expiry sweep that deletes idle sessions.
// Pure helpers only; the HTTP wiring is in httpServer.ts.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export const REMOTE_PROFILE = 'remote';

export function isRemoteProfile(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OPEN_DESIGN_PROFILE?.trim() === REMOTE_PROFILE;
}

/** Tools a remote session offers. */
export const REMOTE_AVAILABLE_TOOLS = new Set([
  'list_open_design_skills',
  'list_open_design_design_systems',
  'recommend_open_design_design_systems',
  'prepare_open_design_brief',
  'create_open_design_design_system',
  'get_open_design_artifact',
  'show_open_design_artifact',
  'show_open_design_examples',
  'show_open_design_design_systems',
  'show_open_design_questions',
  'get_open_design_preview_state',
  'save_open_design_comment',
  'list_open_design_integrations',
  'list_open_design_print_houses',
  'find_open_design_3d_assets',
  'prepare_open_design_exploration',
  'compare_open_design_exploration',
  'choose_open_design_direction',
  'register_open_design_artifact',
  'set_active_design_system',
  'remix_open_design_example',
  'export_open_design_artifact',
  'add_open_design_diagram_runtime',
  'check_open_design_artifact',
  'adapt_open_design_artifact',
  'create_open_design_qr_code',
  'use_open_design_managed_workspace',
  'write_open_design_file',
  'publish_open_design_artifact',
]);

/** Tools a remote session hides, with why. */
export const REMOTE_HIDDEN_TOOLS: Record<string, string> = {
  set_open_design_workspace: "a folder on the user's computer",
  set_up_open_design_browser_pane: "Claude Desktop's Code tab on the user's computer",
  open_open_design_preview: "a browser window on the user's computer",
  port_open_design_artifact_to_app: "the user's code project",
  prepare_open_design_component_library: "the user's code project",
  read_open_design_source: "documents on the user's computer",
  start_open_design_job_run: 'scheduled jobs on the user’s computer',
  finish_open_design_job_run: 'scheduled jobs on the user’s computer',
  pull_open_design_figma_frame: "the user's own Figma token",
  push_open_design_artifact_to_figma: "the user's own Figma token",
  publish_open_design_artifact_to_canva: "the user's own Canva connector",
  publish_open_design_artifact_to_shop: "the user's own shop connector",
  restore_open_design_artifact: 'a Claude artifact read on the user’s side',
  extract_open_design_design_system: 'rendering any website from the server',
};

/** Publish providers a remote session may use: the temporary ones that need no token of the server's. */
export const REMOTE_PUBLISH_PROVIDERS = new Set(['netlify-temporary', 'cloudflare-temporary']);

/** Why a remote call with these arguments is refused, or undefined when it's fine. */
export function remoteArgRefusal(tool: string, args: Record<string, unknown>): string | undefined {
  if (tool === 'create_open_design_design_system' && typeof args.sourceUrl === 'string' && args.sourceUrl.trim()) {
    return 'The hosted Open Design server does not fetch websites. Call create_open_design_design_system again without sourceUrl, and describe the brand in brief (colours, fonts, tone) from what the user tells you.';
  }
  if (tool === 'export_open_design_artifact' && args.embedAssets === true) {
    return 'The hosted Open Design server does not download remote assets (embedAssets). Export again without embedAssets.';
  }
  if (tool === 'publish_open_design_artifact') {
    const provider = typeof args.provider === 'string' ? args.provider : 'netlify-temporary';
    if (!REMOTE_PUBLISH_PROVIDERS.has(provider)) {
      return `The hosted Open Design server can only make temporary links (${[...REMOTE_PUBLISH_PROVIDERS].join(', ')}). Call publish_open_design_artifact again with one of those providers.`;
    }
  }
  return undefined;
}

export interface RemoteLimits {
  maxFiles: number;
  maxBytes: number;
  maxExports: number;
  /** Tool calls per minute. */
  callsPerMinute: number;
  /** Days a session's files are kept after its last request. */
  sessionDays: number;
  /** Hours a download link stays valid. */
  linkHours: number;
}

function intFromEnv(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function remoteLimits(env: NodeJS.ProcessEnv = process.env): RemoteLimits {
  return {
    maxFiles: intFromEnv(env.OPEN_DESIGN_REMOTE_MAX_FILES, 500),
    maxBytes: intFromEnv(env.OPEN_DESIGN_REMOTE_MAX_MB, 200) * 1024 * 1024,
    maxExports: intFromEnv(env.OPEN_DESIGN_REMOTE_MAX_EXPORTS, 50),
    callsPerMinute: intFromEnv(env.OPEN_DESIGN_REMOTE_CALLS_PER_MINUTE, 120),
    sessionDays: intFromEnv(env.OPEN_DESIGN_REMOTE_SESSION_DAYS, 7),
    linkHours: intFromEnv(env.OPEN_DESIGN_REMOTE_LINK_HOURS, 24),
  };
}

export interface FolderUsage {
  files: number;
  bytes: number;
}

/** Files and bytes under a folder (symlinks are not followed). */
export async function folderUsage(dir: string): Promise<FolderUsage> {
  const usage: FolderUsage = { files: 0, bytes: 0 };
  const walk = async (d: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        usage.files += 1;
        usage.bytes += (await fs.stat(full)).size;
      }
    }
  };
  await walk(dir);
  return usage;
}

/** A refusal when the session is at its file or size limit, for tools that write. */
export function usageRefusal(usage: FolderUsage, limits: RemoteLimits): string | undefined {
  if (usage.files >= limits.maxFiles) return `This session has reached its limit of ${limits.maxFiles} files. Nothing was written. Start a new chat to begin a fresh session.`;
  if (usage.bytes >= limits.maxBytes) return `This session has reached its limit of ${Math.round(limits.maxBytes / 1024 / 1024)} MB. Nothing was written. Start a new chat to begin a fresh session.`;
  return undefined;
}

/** A fixed-window rate limiter: at most `perMinute` calls in any calendar minute. */
export class MinuteRateLimiter {
  private windowStart = 0;
  private count = 0;
  constructor(
    private readonly perMinute: number,
    private readonly now: () => number = Date.now,
  ) {}
  /** True when the call may go ahead. */
  take(): boolean {
    const t = this.now();
    if (t - this.windowStart >= 60_000) {
      this.windowStart = t;
      this.count = 0;
    }
    if (this.count >= this.perMinute) return false;
    this.count += 1;
    return true;
  }
}

/** Export files a remote session hands out links for. */
export const DOWNLOADABLE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf', '.pptx', '.mp4', '.webm', '.zip', '.html', '.svg']);

/** path → mtimeMs for every file under dir, workspace-relative with / separators. Skips hidden folders such as .open-design. */
export async function snapshotFiles(dir: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const walk = async (d: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.set(path.relative(dir, full).split(path.sep).join('/'), (await fs.stat(full)).mtimeMs);
    }
  };
  await walk(dir);
  return out;
}

/** Files that are new or changed between two snapshots and are downloadable exports. */
export function newDownloads(before: Map<string, number>, after: Map<string, number>): string[] {
  return [...after.entries()]
    .filter(([rel, mtime]) => before.get(rel) !== mtime && DOWNLOADABLE_EXTENSIONS.has(path.extname(rel).toLowerCase()))
    .map(([rel]) => rel)
    .sort();
}

export function signDownload(secret: string, sessionId: string, rel: string, expires: number): string {
  return createHmac('sha256', secret).update(`${sessionId}\n${rel}\n${expires}`).digest('base64url');
}

/** `<base>/files/<session>/<path>?exp=<unix s>&sig=<hmac>` */
export function downloadUrl(baseUrl: string, secret: string, sessionId: string, rel: string, expires: number): string {
  const encodedPath = rel.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl.replace(/\/+$/, '')}/files/${encodeURIComponent(sessionId)}/${encodedPath}?exp=${expires}&sig=${signDownload(secret, sessionId, rel, expires)}`;
}

export type DownloadCheck = { ok: true; sessionId: string; rel: string } | { ok: false; status: number; message: string };

/** Checks a /files/ request's signature and expiry. */
export function verifyDownload(secret: string, pathname: string, search: URLSearchParams, nowSeconds = Math.floor(Date.now() / 1000)): DownloadCheck {
  const match = /^\/files\/([^/]+)\/(.+)$/.exec(pathname);
  if (!match) return { ok: false, status: 404, message: 'Not found' };
  let sessionId: string;
  let rel: string;
  try {
    sessionId = decodeURIComponent(match[1]);
    rel = match[2].split('/').map(decodeURIComponent).join('/');
  } catch {
    return { ok: false, status: 400, message: 'Bad path' };
  }
  if (!isSessionId(sessionId) || rel.split('/').some((part) => part === '..' || part === '' || part.startsWith('.'))) return { ok: false, status: 400, message: 'Bad path' };
  const expires = Number(search.get('exp'));
  const sig = search.get('sig') ?? '';
  if (!Number.isFinite(expires)) return { ok: false, status: 403, message: 'Missing expiry' };
  const expected = Buffer.from(signDownload(secret, sessionId, rel, expires));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, status: 403, message: 'Bad signature' };
  if (expires < nowSeconds) return { ok: false, status: 410, message: 'This download link has expired. Ask for the export again.' };
  return { ok: true, sessionId, rel };
}

export function isSessionId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** Constant-time comparison of a presented token with the configured one. */
export function tokenMatches(expected: string, presented: string | undefined): boolean {
  if (!presented) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const LAST_REQUEST_FILE = '.last-request';

/** Marks a session folder as used now. */
export async function touchSession(sessionRoot: string): Promise<void> {
  await fs.mkdir(sessionRoot, { recursive: true });
  await fs.writeFile(path.join(sessionRoot, LAST_REQUEST_FILE), new Date().toISOString());
}

/** Deletes session folders whose last request is older than `days`. Returns the ids removed. */
export async function sweepSessions(sessionsDir: string, days: number, now = Date.now()): Promise<string[]> {
  const removed: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(sessionsDir, { withFileTypes: true });
  } catch {
    return removed;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSessionId(entry.name)) continue;
    const dir = path.join(sessionsDir, entry.name);
    let last: number;
    try {
      last = (await fs.stat(path.join(dir, LAST_REQUEST_FILE))).mtimeMs;
    } catch {
      last = (await fs.stat(dir)).mtimeMs;
    }
    if (now - last > days * 24 * 60 * 60 * 1000) {
      await fs.rm(dir, { recursive: true, force: true });
      removed.push(entry.name);
    }
  }
  return removed;
}
