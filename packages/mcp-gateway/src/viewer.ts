// Read-only viewer links (openspec add-hosted-design-viewer): a copy of one
// design, taken when the link is made, served from a separate user-content
// domain with no cookies. The view id is not the project handle, so a shared
// link opens that copy and nothing else.
//
// <data>/views/<view id>/view.json   { project folder, entry file, created }
// <data>/views/<view id>/site/       the design's folder, without exports and hidden files
import { randomBytes } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import type { ServerResponse } from 'node:http';
import * as path from 'node:path';
import type { ProjectRef, ProjectStore } from './projects';

export const VIEW_ID = /^odv_[0-9a-f]{32}$/;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.hdr': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
};

/** Headers on every viewer response (design.md decision 3). */
export const VIEWER_HEADERS: Record<string, string> = {
  'content-security-policy': "default-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https:; style-src 'self' 'unsafe-inline' https:; frame-ancestors *",
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
  'cross-origin-opener-policy': 'same-origin',
};

async function copyDesign(from: string, to: string): Promise<void> {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'exports' || entry.name === 'node_modules') continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) await copyDesign(src, dest);
    else if (entry.isFile() && (await fs.stat(src)).size <= MAX_FILE_BYTES) await fs.copyFile(src, dest);
  }
}

export class Viewer {
  constructor(
    private readonly store: ProjectStore,
    private readonly baseUrl: string,
    /** Where the "report this page" link in the footer bar writes to. */
    private readonly reportEmail = 'support@feimacode.com',
  ) {}

  /** Copies the design that `entryPath` (relative to the project's files) belongs to, and returns its link. */
  async mint(ref: ProjectRef, entryPath: string): Promise<string> {
    const root = this.store.filesRoot(ref);
    const entry = path.resolve(root, entryPath);
    if (!entry.startsWith(root + path.sep)) throw new Error('entryPath must be inside the project.');
    const stat = await fs.stat(entry).catch(() => undefined);
    if (!stat?.isFile()) throw new Error(`No design file at ${entryPath}. Register the design first.`);
    const id = `odv_${randomBytes(16).toString('hex')}`;
    const viewDir = path.join(this.store.dataDir, 'views', id);
    await copyDesign(path.dirname(entry), path.join(viewDir, 'site'));
    await fs.writeFile(path.join(viewDir, 'view.json'), JSON.stringify({ project: path.relative(this.store.dataDir, ref.dir), entry: path.basename(entry), createdAt: new Date().toISOString() }));
    await this.store.update(ref, { views: [...(ref.meta.views ?? []), id] });
    return `${this.baseUrl.replace(/\/+$/, '')}/v/${id}/`;
  }

  /** Serves GET /v/<id>/<path>. */
  async serve(pathname: string, res: ServerResponse): Promise<void> {
    const match = /^\/v\/([^/]+)(\/.*)?$/.exec(pathname);
    if (!match || !VIEW_ID.test(match[1])) return expired(res, 404);
    if (match[2] === undefined) {
      res.writeHead(301, { location: `/v/${match[1]}/`, ...VIEWER_HEADERS });
      res.end();
      return;
    }
    const viewDir = path.join(this.store.dataDir, 'views', match[1]);
    let meta: { project: string; entry: string };
    try {
      meta = JSON.parse(await fs.readFile(path.join(viewDir, 'view.json'), 'utf8'));
      await fs.access(path.resolve(this.store.dataDir, meta.project, 'project.json'));
    } catch {
      return expired(res, 404);
    }
    let rel: string;
    try {
      rel = decodeURIComponent(match[2].slice(1));
    } catch {
      return expired(res, 400);
    }
    if (rel === '') rel = meta.entry;
    const site = path.join(viewDir, 'site');
    const file = path.resolve(site, rel);
    if (!file.startsWith(site + path.sep) || rel.split('/').some((p) => p.startsWith('.'))) return expired(res, 404);
    const stat = await fs.stat(file).catch(() => undefined);
    if (!stat?.isFile()) return expired(res, 404);
    const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    if (rel === meta.entry && type.startsWith('text/html')) {
      const body = Buffer.from(withReportBar(await fs.readFile(file, 'utf8'), this.reportEmail, match[1]));
      res.writeHead(200, { ...VIEWER_HEADERS, 'content-type': type, 'content-length': String(body.length), 'cache-control': 'public, max-age=300' });
      res.end(body);
      return;
    }
    res.writeHead(200, {
      ...VIEWER_HEADERS,
      'content-type': type,
      'content-length': String(stat.size),
      'cache-control': 'public, max-age=300',
    });
    createReadStream(file).pipe(res);
  }
}

/** A small fixed bar with a "report this page" link (openspec add-hosted-design-viewer, task 1.5). */
export function withReportBar(html: string, email: string, viewId: string): string {
  const subject = encodeURIComponent(`Report Open Design page ${viewId}`);
  const bar =
    `<div data-od-report style="position:fixed;right:8px;bottom:8px;z-index:2147483647;font:12px system-ui,sans-serif;background:rgba(0,0,0,.6);color:#fff;padding:4px 8px;border-radius:6px">` +
    `Made with Open Design · <a href="mailto:${email}?subject=${subject}" style="color:#fff">Report this page</a></div>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${bar}</body>`) : html + bar;
}

function expired(res: ServerResponse, status: number): void {
  res.writeHead(status, { ...VIEWER_HEADERS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(
    '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Design not available</title>' +
      '<body style="font:16px system-ui;margin:4rem auto;max-width:32rem;padding:0 1rem">' +
      '<h1 style="font-size:1.4rem">This design isn\'t available</h1>' +
      '<p>The link is wrong, or the design has expired. Shared Open Design links stop working when their project is deleted.</p></body>',
  );
}
