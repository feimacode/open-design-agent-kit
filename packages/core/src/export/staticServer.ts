// A throwaway static file server rooted at the workspace, used to load an
// artifact for export. Serving over http rather than file:// makes ES modules
// and fetch() of sibling files work, lets sandboxed browsers (e.g. snap
// Chromium) reach files under hidden directories, and keeps relative
// references outside the artifact's own folder (`../shared.css`) resolving.
// GET/HEAD only, paths confined to the root, closed right after capture.
//
// Host selection: with a local browser the server is loopback-only
// (127.0.0.1), which is the safe default. When a *remote* browser is configured
// (OPEN_DESIGN_BROWSER_URL, e.g. a shared browserless service in another Pod),
// the browser cannot reach this process's 127.0.0.1, so the server binds
// 0.0.0.0 and the base URL advertises a cluster-reachable address (the Pod IP
// from OPEN_DESIGN_ARTIFACT_HOST, else the first non-internal IPv4). That lets
// export/check render local artifacts through the remote browser.
import { promises as fs } from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { hasIncludes, resolveIncludes } from './flowIncludes';

const BROWSER_URL_ENV = 'OPEN_DESIGN_BROWSER_URL';
const ARTIFACT_HOST_ENV = 'OPEN_DESIGN_ARTIFACT_HOST';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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
  '.txt': 'text/plain; charset=utf-8',
};

function isRemoteBrowser(): boolean {
  return !!process.env[BROWSER_URL_ENV]?.trim();
}

/** First non-internal IPv4 address of this host (the Pod IP in Kubernetes). */
function firstReachableIPv4(): string | undefined {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const addr of ifaces[name] ?? []) {
      if ((addr.family === 'IPv4' || (addr.family as unknown) === 4) && !addr.internal) return addr.address;
    }
  }
  return undefined;
}

function hostForUrl(host: string): string {
  // IPv6 literals need brackets in a URL authority.
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

export interface StaticServer {
  /** Base URL with a trailing slash, e.g. http://127.0.0.1:43123/ (plus the path token, when there is one) */
  baseUrl: string;
  close(): Promise<void>;
}

export interface StaticServerOptions {
  /** Root-relative path of the artifact's entry file — the only file transformEntry applies to. */
  entryPath?: string;
  /** Rewrites the entry document as served (never the file on disk), e.g. to inject the <deck-stage> fallback. */
  transformEntry?: (html: string) => string;
  /** Rewrites every HTML document as served (after transformEntry), e.g. to inject the preview bridge into any page the preview navigates to. */
  transformHtml?: (html: string, relPath: string) => string;
  /**
   * A secret first path segment every request must carry (`/<token>/…`).
   * For long-lived servers (the VS Code served preview), so another local
   * process that finds the port still can't read the workspace.
   */
  pathToken?: string;
  /** Address to bind. Defaults to 127.0.0.1, or 0.0.0.0 when a remote browser is configured. */
  bindHost?: string;
  /** Host used in baseUrl. Defaults to 127.0.0.1, or a cluster-reachable address when a remote browser is configured. */
  publicHost?: string;
}

export async function startStaticServer(root: string, options: StaticServerOptions = {}): Promise<StaticServer> {
  const absRoot = path.resolve(root);
  const absEntry = options.entryPath ? path.resolve(absRoot, options.entryPath) : undefined;
  const remote = isRemoteBrowser();
  const bindHost = options.bindHost ?? (remote ? '0.0.0.0' : '127.0.0.1');
  const publicHost =
    options.publicHost ??
    (remote ? process.env[ARTIFACT_HOST_ENV]?.trim() || firstReachableIPv4() || '127.0.0.1' : '127.0.0.1');
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    let rel: string;
    try {
      rel = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (options.pathToken) {
      const prefix = `/${options.pathToken}/`;
      if (!rel.startsWith(prefix)) {
        res.writeHead(404).end();
        return;
      }
      rel = rel.slice(prefix.length - 1);
    }
    const abs = path.resolve(absRoot, '.' + rel);
    const within = path.relative(absRoot, abs);
    if (within.startsWith('..') || path.isAbsolute(within)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const stat = await fs.stat(abs);
      const file = stat.isDirectory() ? path.join(abs, 'index.html') : abs;
      let body = await fs.readFile(file);
      if (options.transformEntry && file === absEntry) body = Buffer.from(options.transformEntry(body.toString('utf8')), 'utf8');
      if (/\.html?$/i.test(file) && hasIncludes(body.toString('utf8'))) body = Buffer.from((await resolveIncludes(body.toString('utf8'), file, absRoot)).html, 'utf8');
      if (options.transformHtml && /\.html?$/i.test(file)) body = Buffer.from(options.transformHtml(body.toString('utf8'), path.relative(absRoot, file).split(path.sep).join('/')), 'utf8');
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404).end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, bindHost, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://${hostForUrl(publicHost)}:${port}/${options.pathToken ? `${options.pathToken}/` : ''}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/** URL for a workspace-relative path, segment-encoded. */
export function urlForPath(baseUrl: string, relPath: string): string {
  return baseUrl + relPath.split(/[\\/]+/).filter(Boolean).map(encodeURIComponent).join('/');
}
