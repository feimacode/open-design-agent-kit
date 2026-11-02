// A throwaway, loopback-only static file server rooted at the workspace,
// used to load an artifact for export. Serving over http://127.0.0.1 rather
// than file:// makes ES modules and fetch() of sibling files work, lets
// sandboxed browsers (e.g. snap Chromium) reach files under hidden
// directories, and keeps relative references outside the artifact's own
// folder (`../shared.css`) resolving. GET/HEAD only, paths confined to the
// root, closed right after capture.
import { promises as fs } from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import { hasIncludes, resolveIncludes } from './flowIncludes';

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
}

export async function startStaticServer(root: string, options: StaticServerOptions = {}): Promise<StaticServer> {
  const absRoot = path.resolve(root);
  const absEntry = options.entryPath ? path.resolve(absRoot, options.entryPath) : undefined;
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
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/${options.pathToken ? `${options.pathToken}/` : ''}`,
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
