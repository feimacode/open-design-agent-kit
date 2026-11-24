// The remote profile (openspec add-remote-mcp-server, add-mcp-gateway): what
// changes when the tools run in the hosted gateway (packages/mcp-gateway) for
// the Claude connector and ChatGPT plugin directory listings, instead of a
// local stdio process.
//
// - Tools that need the user's own disk, a browser window on their machine, a
//   token of theirs, or that would fetch arbitrary URLs from the server, are
//   hidden (REMOTE_HIDDEN_TOOLS). Every tool must be classified here.
// - Per-project limits and the export-link helpers. The HTTP side, project
//   handles, signed links and sweeps live in packages/mcp-gateway.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { browserMeasureLoader, browserMeasureScript, MAX_MEASURED_SOURCES } from '@feimacode/open-design-agent-kit-core';
import { parseCanvaUrl, parseFigmaUrl } from '@feimacode/open-design-agent-kit-core';

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
  'export_open_design_design_system',
  'extract_open_design_design_system',
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
  'prepare_open_design_edit',
  'create_open_design_qr_code',
  'use_open_design_managed_workspace',
  'write_open_design_file',
  'publish_open_design_artifact',
  'save_open_design_project',
  'save_open_design_portfolio_target',
  'get_open_design_library',
  'import_open_design_work',
  'import_open_design_comments',
]);

/** Tools a remote session hides, with why. */
export const REMOTE_HIDDEN_TOOLS: Record<string, string> = {
  set_open_design_workspace: "a folder on the user's computer",
  set_up_open_design_browser_pane: "Claude Desktop's Code tab on the user's computer",
  open_open_design_preview: "a browser window on the user's computer",
  port_open_design_artifact_to_app: "the user's code project",
  scan_open_design_app: "the user's code project",
  prepare_open_design_component_library: "the user's code project",
  read_open_design_source: "documents on the user's computer",
  start_open_design_job_run: 'scheduled jobs on the user’s computer',
  finish_open_design_job_run: 'scheduled jobs on the user’s computer',
  pull_open_design_figma_frame: "the user's own Figma token",
  push_open_design_artifact_to_figma: "the user's own Figma token",
  publish_open_design_artifact_to_canva: "the user's own Canva connector",
  publish_open_design_artifact_to_shop: "the user's own shop connector",
  restore_open_design_artifact: 'a Claude artifact read on the user’s side',
  audit_open_design_site: 'rendering any website from the server',
  compare_open_design_before_after: 'a redesign of a live website, which the hosted server doesn\'t render',
  inspect_open_design_reference_video: "a video file on the user's computer (the hosted server takes no video uploads)",
};

/**
 * The hosted refusal of a website (openspec add-browser-measured-source):
 * measure the page in the agent's own browser with the kit's script, or fall
 * back to sources; never estimate.
 */
export function browserMeasureRefusal(url: string | undefined, scriptUrl?: string): string {
  const script = browserMeasureScript();
  const page = url || 'the page';
  const block = {
    scriptVersion: script.version,
    ...(scriptUrl ? { loader: browserMeasureLoader(scriptUrl) } : {}),
    script: script.source,
    next: `extract_open_design_design_system with no url and sources: [{ kind: "measured", url: "${url || '<the page>'}", data: <the text the script returned, unchanged>, screenshot: <optional PNG base64 of the viewport at the top> }]`,
  };
  return [
    'The hosted Open Design server does not fetch websites. Measure the page in your own browser instead, with the Open Design measurement script below. Use it only if you have a browser tool that runs JavaScript in a page (for example Claude in Chrome\'s javascript_tool):',
    `1. Open ${page} at desktop width (about 1280px) and wait for it to load. Don't sign in, accept cookies or click anything.`,
    `2. Run ${scriptUrl ? 'the loader (if the page blocks it, run the script itself)' : 'the script'} as one expression. It hides cookie banners, scrolls the page once in about 2 seconds, and resolves to a JSON text. It only reads styles and adds data-od-* marker attributes; reloading the page removes them.`,
    '3. If your browser tool can return a screenshot as base64 PNG, take one of the viewport at the top of the page.',
    `4. Call ${block.next}. Up to ${MAX_MEASURED_SOURCES} pages of the same site, one measured source each (a pricing or product page from its navigation helps).`,
    'Without a browser tool, fetch the page yourself and pass its HTML and stylesheets as sources ({ kind: "html", text } and { kind: "css", text }), or ask the user for a screenshot, the CSS, a brand guide or a PowerPoint template.',
    'Never estimate a value you didn\'t measure: leave the token out so its default applies, and tell the user which ones were not measured.',
    '',
    `browserMeasure: ${JSON.stringify(block)}`,
  ].join('\n');
}

/** Why a remote call with these arguments is refused, or undefined when it's fine. */
export function remoteArgRefusal(tool: string, args: Record<string, unknown>, options: { measureScriptUrl?: string } = {}): string | undefined {
  if (tool === 'create_open_design_design_system' && typeof args.sourceUrl === 'string' && args.sourceUrl.trim()) {
    return 'The hosted Open Design server does not fetch websites. Call create_open_design_design_system again without sourceUrl, and describe the brand in brief (colours, fonts, tone) from what the user tells you.';
  }
  if (tool === 'extract_open_design_design_system') {
    const url = typeof args.url === 'string' ? args.url.trim() : '';
    // A Figma or Canva link is never opened: it returns the steps to read or export the design.
    if (url && !parseFigmaUrl(url) && !parseCanvaUrl(url)) return browserMeasureRefusal(url, options.measureScriptUrl);
    if (['extraUrls', 'compareTo', 'content'].some((k) => args[k] !== undefined && args[k] !== '' && args[k] !== false)) {
      return `Leave out extraUrls, compareTo and content: the hosted server opens no pages.\n${browserMeasureRefusal(Array.isArray(args.extraUrls) && typeof args.extraUrls[0] === 'string' ? args.extraUrls[0] : undefined, options.measureScriptUrl)}`;
    }
    const sources = Array.isArray(args.sources) ? (args.sources as unknown[]) : [];
    const figma = sources
      .filter((s) => s !== null && typeof s === 'object' && (s as { kind?: unknown }).kind === 'figma')
      .map((s) => ((s as { figma?: unknown }).figma !== null && typeof (s as { figma?: unknown }).figma === 'object' ? (s as { figma: Record<string, unknown> }).figma : (s as Record<string, unknown>)));
    if (figma.some((f) => f.styles === true)) {
      return 'The hosted Open Design server does not call Figma\'s REST API with a token, so a figma source cannot use styles: true. Read the frames with the Figma connector instead and pass their get_variable_defs replies in frames, with styles left out or false.';
    }
    const logoFiles = figma.some((f) => Array.isArray(f.logos) && (f.logos as unknown[]).some((l) => l !== null && typeof l === 'object' && ((typeof (l as { data?: unknown }).data === 'string' && (l as { data: string }).data.length > 0) || (typeof (l as { path?: unknown }).path === 'string' && (l as { path: string }).path.length > 0))));
    if (logoFiles) {
      return 'The hosted Open Design server cannot store Figma logo exports: it has no copy of the user\'s files and no Figma token. List each logo as needed instead (logos: [{ role, name }], with no data or path), and ask the person to export and attach them once the design system is saved.';
    }
  }
  if (tool === 'import_open_design_work') {
    const sources = Array.isArray(args.sources) ? (args.sources as Array<Record<string, unknown> | null>) : [];
    if (sources.some((s) => s?.kind === 'url')) {
      return 'The hosted Open Design server does not fetch websites, so it can\'t capture a live page. Ask the person for screenshots of the page at desktop and phone sizes and import them as { kind: "data", data, name } sources.';
    }
    if (sources.some((s) => s?.kind === 'figma' && !(typeof s.data === 'string' && s.data))) {
      return 'The hosted Open Design server does not call Figma with a token. Read the frame with the Figma connector\'s get_screenshot, then pass { kind: "figma", url, data: <the image as base64> }.';
    }
  }
  if (tool === 'export_open_design_artifact' && args.embedAssets === true) {
    return 'The hosted Open Design server does not download remote assets (embedAssets). Export again without embedAssets.';
  }
  return undefined;
}

export interface RemoteLimits {
  maxFiles: number;
  maxBytes: number;
  maxExports: number;
  /** Tool calls per minute, per project. */
  callsPerMinute: number;
  /** Days an anonymous project's files are kept after its last request. */
  sessionDays: number;
  /** Days a signed-in user's project is kept after its last request (openspec add-gateway-sign-in). */
  accountProjectDays: number;
  /** New anonymous projects one client IP may start in an hour. */
  projectsPerHour: number;
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
    accountProjectDays: intFromEnv(env.OPEN_DESIGN_ACCOUNT_PROJECT_DAYS, 180),
    projectsPerHour: intFromEnv(env.OPEN_DESIGN_REMOTE_PROJECTS_PER_HOUR, 20),
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

/** A refusal when the project is at its file or size limit, for tools that write. */
export function usageRefusal(usage: FolderUsage, limits: RemoteLimits): string | undefined {
  if (usage.files >= limits.maxFiles) return `This project has reached its limit of ${limits.maxFiles} files. Nothing was written. Start a new project with start_open_design_project.`;
  if (usage.bytes >= limits.maxBytes) return `This project has reached its limit of ${Math.round(limits.maxBytes / 1024 / 1024)} MB. Nothing was written. Start a new project with start_open_design_project.`;
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

/** Links a hosted project can hand out. */
export interface HostedLinks {
  download(rel: string): string;
  view?(entryPath: string): Promise<string | undefined>;
}

const HOSTED_NO_PATHS = 'Files live on the Open Design server, not on the user\'s computer: never show the user a file or folder path. Give them links.';

/**
 * Hosted results for create_open_design_design_system and
 * export_open_design_design_system (openspec keep-hosted-extraction-honest):
 * links instead of server paths, and a `next` line saying so. Returns the
 * text unchanged for other tools or output that isn't JSON.
 */
export async function hostedDesignSystemResult(tool: string, text: string, links: HostedLinks): Promise<string> {
  if (tool !== 'create_open_design_design_system' && tool !== 'export_open_design_design_system') return text;
  let out: Record<string, unknown>;
  try {
    out = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return text;
  }
  if (!out || typeof out !== 'object' || Array.isArray(out)) return text;
  if (tool === 'create_open_design_design_system') {
    if (typeof out.suggestedEntryPath !== 'string') return text;
    const review = typeof out.review === 'string' ? out.review : undefined;
    const showReview = review
      ? ` Once both files are written, call show_open_design_artifact with entryPath "${review}" and give the user the viewer link in its reply: the site beside a sample styled by the new tokens.`
      : ' Once both files are written, show the user a design made with it.';
    return JSON.stringify(
      {
        ...out,
        next: `The paths here are for write_open_design_file only. ${HOSTED_NO_PATHS}${showReview} Then offer export_open_design_design_system for a brand page link and a Claude Design download. Name the tokens left on their defaults ("Not measured") in your reply.`,
      },
      null,
      2,
    );
  }
  const brandPage = typeof out.brandPage === 'string' ? out.brandPage : undefined;
  const zip = typeof out.zip === 'string' ? out.zip : undefined;
  const brandLink = brandPage && links.view ? await links.view(brandPage).catch(() => undefined) : undefined;
  const download = zip ? links.download(zip) : undefined;
  const rest = Object.fromEntries(Object.entries(out).filter(([k]) => !['dir', 'files', 'brandPage', 'zip', 'next'].includes(k)));
  return JSON.stringify(
    {
      ...rest,
      ...(brandLink ? { brandPageLink: brandLink } : {}),
      ...(download ? { claudeDesignDownload: download } : {}),
      next: `${HOSTED_NO_PATHS}${brandLink ? ' Show the brand page link.' : ''}${download ? ' The download is a zip of Claude Design\'s project/ folder: the user unzips it and imports the folder in Claude Design (Design Systems). The link expires.' : ''}`,
    },
    null,
    2,
  );
}
