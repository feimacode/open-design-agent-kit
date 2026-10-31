// The hosted server's HTTP side (openspec add-remote-mcp-server, phase 1):
// MCP over streamable HTTP at /mcp (or /mcp/<token>), one MCP server and one
// session folder per MCP session, /healthz, signed export downloads at
// /files/..., and an hourly sweep of idle sessions.
//
// Environment:
//   OPEN_DESIGN_REMOTE_TOKEN     required: the shared secret a client presents as
//                                `Authorization: Bearer <token>` or in the URL (/mcp/<token>)
//   OPEN_DESIGN_REMOTE_SECRET    signs download links (defaults to the token)
//   OPEN_DESIGN_REMOTE_DATA_DIR  where session folders live (default <tmp>/open-design-remote)
//   OPEN_DESIGN_PUBLIC_URL       the server's public https origin, for links (default: from the request)
//   OPEN_DESIGN_REMOTE_*         limits, see remote.ts
import { randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { downloadUrl, isSessionId, remoteLimits, sweepSessions, tokenMatches, touchSession, verifyDownload, type RemoteLimits } from './remote';

export interface RemoteSessionInit {
  sessionId: string;
  root: string;
  limits: RemoteLimits;
  downloadLink(rel: string): string;
}

export interface HttpServerOptions {
  port: number;
  host?: string;
  createSession(remote: RemoteSessionInit): Server;
  serverVersion: string;
  env?: NodeJS.ProcessEnv;
}

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.zip': 'application/zip',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function send(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

function sendJsonRpcError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body too large');
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : undefined;
}

function publicOrigin(req: IncomingMessage, env: NodeJS.ProcessEnv): string {
  const configured = env.OPEN_DESIGN_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() || 'http';
  return `${proto}://${req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost'}`;
}

/** The token from `Authorization: Bearer` or the path `/mcp/<token>`; and the MCP path without it. */
export function presentedToken(req: IncomingMessage, pathname: string): { token?: string; mcpPath: boolean } {
  const auth = req.headers.authorization;
  const bearer = typeof auth === 'string' && /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, '').trim() : undefined;
  if (pathname === '/mcp') return { token: bearer, mcpPath: true };
  const match = /^\/mcp\/([^/]+)$/.exec(pathname);
  if (match) return { token: bearer ?? decodeURIComponent(match[1]), mcpPath: true };
  return { mcpPath: false };
}

export async function startHttpServer(options: HttpServerOptions): Promise<{ close(): Promise<void>; port: number }> {
  const env = options.env ?? process.env;
  const token = env.OPEN_DESIGN_REMOTE_TOKEN?.trim();
  if (!token || token.length < 16) throw new Error('OPEN_DESIGN_REMOTE_TOKEN must be set to a secret of at least 16 characters before the server can run over HTTP.');
  const secret = env.OPEN_DESIGN_REMOTE_SECRET?.trim() || token;
  const dataDir = path.resolve(env.OPEN_DESIGN_REMOTE_DATA_DIR?.trim() || path.join(os.tmpdir(), 'open-design-remote'));
  const sessionsDir = path.join(dataDir, 'sessions');
  await fs.mkdir(sessionsDir, { recursive: true });
  const limits = remoteLimits(env);
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const handleMcp = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const sessionHeader = req.headers['mcp-session-id'];
    const sessionId = typeof sessionHeader === 'string' ? sessionHeader : undefined;
    let body: unknown;
    if (req.method === 'POST') {
      try {
        body = await readJsonBody(req);
      } catch (err) {
        sendJsonRpcError(res, 400, err instanceof Error ? err.message : 'Bad request body');
        return;
      }
    }
    if (sessionId) {
      const transport = transports.get(sessionId);
      if (!transport) {
        sendJsonRpcError(res, 404, 'Unknown or expired session. Reconnect to start a new one.');
        return;
      }
      await touchSession(path.join(sessionsDir, sessionId)).catch(() => undefined);
      await transport.handleRequest(req, res, body);
      return;
    }
    if (req.method !== 'POST' || !isInitializeRequest(body)) {
      sendJsonRpcError(res, 400, 'Start with an initialize request (no Mcp-Session-Id yet).');
      return;
    }
    const id = randomUUID();
    const root = path.join(sessionsDir, id);
    await touchSession(root);
    const origin = publicOrigin(req, env);
    const server = options.createSession({
      sessionId: id,
      root,
      limits,
      downloadLink: (rel) => downloadUrl(origin, secret, id, rel, Math.floor(Date.now() / 1000) + limits.linkHours * 3600),
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => id,
      onsessioninitialized: (sid) => {
        transports.set(sid, transport);
      },
    });
    transport.onclose = () => {
      transports.delete(id);
    };
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  };

  const handleDownload = async (url: URL, res: ServerResponse): Promise<void> => {
    const check = verifyDownload(secret, url.pathname, url.searchParams);
    if (!check.ok) {
      send(res, check.status, check.message);
      return;
    }
    const sessionRoot = path.join(sessionsDir, check.sessionId);
    const file = path.resolve(sessionRoot, check.rel);
    if (!file.startsWith(sessionRoot + path.sep)) {
      send(res, 400, 'Bad path');
      return;
    }
    let stat;
    try {
      stat = await fs.stat(file);
    } catch {
      send(res, 404, 'This file is gone: sessions are deleted after a while. Ask for the export again.');
      return;
    }
    if (!stat.isFile()) {
      send(res, 404, 'Not found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
      'content-length': String(stat.size),
      'content-disposition': `attachment; filename="${path.basename(file).replace(/"/g, '')}"`,
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
    });
    createReadStream(file).pipe(res);
  };

  const httpServer = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void (async () => {
      try {
        if (url.pathname === '/healthz') {
          send(res, 200, JSON.stringify({ ok: true, version: options.serverVersion, sessions: transports.size }), { 'content-type': 'application/json' });
          return;
        }
        if (url.pathname.startsWith('/files/')) {
          if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
          await handleDownload(url, res);
          return;
        }
        const presented = presentedToken(req, url.pathname);
        if (!presented.mcpPath) return send(res, 404, 'Not found');
        if (!tokenMatches(token, presented.token)) return sendJsonRpcError(res, 401, 'Missing or wrong access token.');
        await handleMcp(req, res);
      } catch (err) {
        if (!res.headersSent) sendJsonRpcError(res, 500, err instanceof Error ? err.message : 'Internal error');
        else res.end();
      }
    })();
  });

  const sweep = async (): Promise<void> => {
    const removed = await sweepSessions(sessionsDir, limits.sessionDays);
    for (const id of removed) {
      if (!isSessionId(id)) continue;
      await transports.get(id)?.close().catch(() => undefined);
      transports.delete(id);
    }
  };
  const sweepTimer = setInterval(() => void sweep().catch(() => undefined), 60 * 60 * 1000);
  sweepTimer.unref();
  void sweep().catch(() => undefined);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port, options.host ?? '0.0.0.0', () => resolve());
  });
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  console.error(`open-design: hosted MCP server ${options.serverVersion} listening on port ${port} (sessions in ${sessionsDir})`);
  return {
    port,
    close: async () => {
      clearInterval(sweepTimer);
      await Promise.all([...transports.values()].map((t) => t.close().catch(() => undefined)));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
