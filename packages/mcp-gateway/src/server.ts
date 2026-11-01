// The gateway's HTTP side (openspec add-mcp-gateway, add-gateway-sign-in,
// add-hosted-design-viewer, deploy-hosted-gateway).
//
//   POST /mcp                                   MCP over streamable HTTP
//   GET  /healthz                               health check
//   GET  /files/<ref>/<path>?exp&sig            signed export downloads
//   GET  /.well-known/openai-apps-challenge     OpenAI domain verification
//   GET  /.well-known/oauth-protected-resource  sign-in metadata (when sign-in is on)
//   GET  /v/<view id>/…                         read-only viewer, on the user-content host only
//
// MCP sessions hold only the client's capabilities (so MCP Apps views work);
// every durable thing lives in a project folder named by the handle the agent
// passes on each call. A lost session costs the client a new initialize, never
// a file. (MCP protocol 2026-07-28 drops sessions altogether; the SDK doesn't
// speak it yet, see openspec/changes/add-mcp-gateway/design.md.)
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import * as path from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createSession, type RemoteProject, type RemoteSession } from '@feimacode/open-design-agent-kit-mcp/src/session';
import { challengeHeader, protectedResourceMetadata, TokenVerifier } from './auth';
import type { GatewayConfig } from './config';
import { ACCOUNT_TOOLS, gatewayTools, UNKNOWN_PROJECT, type CallContext } from './gatewayTools';
import { GATEWAY_INSTRUCTIONS } from './guidance';
import { ExportJobs } from './jobs';
import { downloadUrl, verifyDownload } from './links';
import { ProjectStore, type GatewayUser, type ProjectRef } from './projects';
import { Viewer } from './viewer';

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
export const READ_ONLY_MESSAGE = 'Open Design is in maintenance for a short while, so nothing can be made or changed right now. Browsing still works. Please try again later.';

const DOWNLOAD_TYPES: Record<string, string> = {
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
  '.txt': 'text/plain; charset=utf-8',
};

function send(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(value));
}

function jsonRpcError(res: ServerResponse, status: number, message: string, headers: Record<string, string> = {}): void {
  sendJson(res, status, { jsonrpc: '2.0', error: { code: -32000, message }, id: null }, headers);
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

/** The client's IP: the proxy's header only when the gateway is told it sits behind one. */
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.trim()) return cf.trim();
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/** Tool names a JSON-RPC body calls (one message or a batch). */
export function calledTools(body: unknown): string[] {
  const messages = Array.isArray(body) ? body : [body];
  return messages
    .filter((m): m is { method: string; params?: { name?: unknown } } => typeof m === 'object' && m !== null && (m as { method?: unknown }).method === 'tools/call')
    .map((m) => (typeof m.params?.name === 'string' ? m.params.name : ''))
    .filter(Boolean);
}

export interface Gateway {
  port: number;
  close(): Promise<void>;
  store: ProjectStore;
}

export async function startGateway(config: GatewayConfig, serverVersion: string, verifier?: TokenVerifier): Promise<Gateway> {
  const store = new ProjectStore(config.dataDir, config.limits);
  await store.init();
  const jobs = new ExportJobs(config.exportConcurrency, config.exportWaitMs);
  const viewer = config.usercontentUrl ? new Viewer(store, config.usercontentUrl, process.env.OPEN_DESIGN_SUPPORT_EMAIL?.trim() || undefined) : undefined;
  const auth = verifier ?? (config.authIssuer && config.authJwksUrl ? new TokenVerifier(config.authIssuer, config.authJwksUrl) : undefined);
  const callers = new AsyncLocalStorage<CallContext & { origin: string }>();
  const caller = (): CallContext & { origin: string } => callers.getStore() ?? { ip: 'unknown', origin: config.publicUrl ?? 'http://localhost' };
  const extraTools = gatewayTools({ store, jobs, signInEnabled: Boolean(auth), caller });

  const remoteProject = (ref: ProjectRef, origin: string): RemoteProject => ({
    id: ref.meta.id,
    root: store.filesRoot(ref),
    designSlug: ref.meta.designSlug,
    setDesignSlug: (slug) => store.update(ref, { designSlug: slug }),
    takeCall: () => store.takeCall(ref.meta.id),
    countExport: () => store.countExport(ref),
    downloadLink: (rel) => downloadUrl(origin, config.linkSecret, ref.meta.filesRef, rel, Math.floor(Date.now() / 1000) + config.limits.linkHours * 3600),
    ...(viewer ? { viewLink: (entryPath: string) => viewer.mint(ref, entryPath) } : {}),
  });

  const remote: RemoteSession = {
    limits: config.limits,
    instructions: GATEWAY_INSTRUCTIONS,
    extraTools,
    ...(config.readOnly ? { readOnlyMessage: READ_ONLY_MESSAGE } : {}),
    openProject: async (handle) => {
      const { user, origin } = caller();
      if (handle === undefined || handle === '') {
        return { ok: false, message: 'This tool needs a project. Call start_open_design_project first, then pass its handle as "project". Nothing was changed.' };
      }
      const ref = await store.find(handle, user);
      if (!ref) return { ok: false, message: UNKNOWN_PROJECT };
      await store.touch(ref);
      return { ok: true, project: remoteProject(ref, origin) };
    },
    runExport: async (project, args, run) => {
      const ref = await store.find(project.id, caller().user);
      if (!ref) return { result: { content: [{ type: 'text', text: UNKNOWN_PROJECT }], isError: true } };
      return jobs.start(ref.dir, args, run);
    },
  };

  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; lastSeen: number }>();
  const resource = (origin: string): string => `${origin}/mcp`;
  const metadataUrl = (origin: string): string => `${origin}/.well-known/oauth-protected-resource`;
  const publicOrigin = (req: IncomingMessage): string => {
    if (config.publicUrl) return config.publicUrl;
    const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() || 'http';
    return `${proto}://${req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost'}`;
  };

  const handleMcp = async (req: IncomingMessage, res: ServerResponse, origin: string): Promise<void> => {
    if (req.method !== 'POST' && req.method !== 'DELETE') {
      res.writeHead(405, { allow: 'POST, DELETE' });
      res.end();
      return;
    }
    // Sign-in is optional: a token, when sent, must be valid; account tools need one.
    let user: GatewayUser | undefined;
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
      if (!auth) return jsonRpcError(res, 401, 'This server has no sign-in.', {});
      const check = await auth.check(authHeader.replace(/^Bearer\s+/i, '').trim(), resource(origin));
      if (!check.ok) return jsonRpcError(res, 401, `Sign-in failed: ${check.reason}.`, { 'www-authenticate': challengeHeader(metadataUrl(origin), 'invalid_token') });
      user = check.user;
    }
    let body: unknown;
    if (req.method === 'POST') {
      try {
        body = await readJsonBody(req);
      } catch (err) {
        return jsonRpcError(res, 400, err instanceof Error ? err.message : 'Bad request body');
      }
      if (auth && !user && calledTools(body).some((name) => ACCOUNT_TOOLS.has(name))) {
        return jsonRpcError(res, 401, 'Sign in to use your Open Design library.', { 'www-authenticate': challengeHeader(metadataUrl(origin)) });
      }
    }
    const context = { user, ip: clientIp(req, config.trustProxy), origin };
    const sessionId = typeof req.headers['mcp-session-id'] === 'string' ? (req.headers['mcp-session-id'] as string) : undefined;
    if (sessionId) {
      const session = sessions.get(sessionId);
      // An unknown session (the gateway restarted, or it idled out): 404 tells the client to initialize again.
      if (!session) return jsonRpcError(res, 404, 'Unknown or expired session. Initialize again; projects are kept.');
      session.lastSeen = Date.now();
      await callers.run(context, () => session.transport.handleRequest(req, res, body));
      return;
    }
    if (req.method !== 'POST' || !isInitializeRequest(body)) return jsonRpcError(res, 400, 'Start with an initialize request (no Mcp-Session-Id yet).');
    const id = randomUUID();
    const server = createSession(remote);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => id,
      onsessioninitialized: (sid) => {
        sessions.set(sid, { transport, lastSeen: Date.now() });
      },
    });
    transport.onclose = () => {
      sessions.delete(id);
    };
    await server.connect(transport);
    await callers.run(context, () => transport.handleRequest(req, res, body));
  };

  const handleDownload = async (url: URL, res: ServerResponse): Promise<void> => {
    const check = verifyDownload(config.linkSecret, url.pathname, url.searchParams);
    if (!check.ok) return send(res, check.status, check.message);
    const dir = await store.dirForFilesRef(check.ref);
    if (!dir) return send(res, 404, 'This file is gone: projects are deleted after a while. Ask for the export again.');
    const root = path.join(dir, 'files');
    const file = path.resolve(root, check.rel);
    if (!file.startsWith(root + path.sep)) return send(res, 400, 'Bad path');
    const stat = await fs.stat(file).catch(() => undefined);
    if (!stat?.isFile()) return send(res, 404, 'This file is gone: projects are deleted after a while. Ask for the export again.');
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': DOWNLOAD_TYPES[ext] ?? 'application/octet-stream',
      'content-length': String(stat.size),
      'content-disposition': `attachment; filename="${path.basename(file).replace(/["\r\n]/g, '')}"`,
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    });
    createReadStream(file).pipe(res);
  };

  const usercontentHost = config.usercontentUrl ? new URL(config.usercontentUrl).host : undefined;

  const httpServer = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void (async () => {
      try {
        // The user-content host serves the viewer and nothing else; the viewer never runs on the gateway's own host.
        const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim();
        if (usercontentHost && host === usercontentHost) {
          if (url.pathname === '/healthz') return send(res, 200, 'ok');
          if ((req.method === 'GET' || req.method === 'HEAD') && viewer) return await viewer.serve(url.pathname, res);
          return send(res, 404, 'Not found');
        }
        if (url.pathname === '/healthz') {
          return sendJson(res, 200, { ok: true, version: serverVersion, sessions: sessions.size, readOnly: config.readOnly, signIn: Boolean(auth), viewer: Boolean(viewer) });
        }
        if (url.pathname === '/.well-known/openai-apps-challenge') {
          if (!config.openaiChallenge) return send(res, 404, 'Not found');
          return send(res, 200, config.openaiChallenge, { 'cache-control': 'no-store' });
        }
        if (url.pathname === '/.well-known/oauth-protected-resource' || url.pathname === '/.well-known/oauth-protected-resource/mcp') {
          if (!auth || !config.authIssuer) return send(res, 404, 'Not found');
          return sendJson(res, 200, protectedResourceMetadata(resource(publicOrigin(req)), config.authIssuer), { 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' });
        }
        if (url.pathname.startsWith('/files/')) {
          if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
          return await handleDownload(url, res);
        }
        if (url.pathname === '/mcp') return await handleMcp(req, res, publicOrigin(req));
        return send(res, 404, 'Not found');
      } catch (err) {
        if (!res.headersSent) jsonRpcError(res, 500, err instanceof Error ? err.message : 'Internal error');
        else res.end();
      }
    })();
  });

  const sweep = async (): Promise<void> => {
    await store.sweep();
    const cutoff = Date.now() - SESSION_IDLE_MS;
    for (const [id, session] of sessions) {
      if (session.lastSeen < cutoff) {
        await session.transport.close().catch(() => undefined);
        sessions.delete(id);
      }
    }
  };
  const sweepTimer = setInterval(() => void sweep().catch(() => undefined), 60 * 60 * 1000);
  sweepTimer.unref();
  void sweep().catch(() => undefined);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.port, config.host, () => resolve());
  });
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  console.error(
    `open-design-gateway ${serverVersion} listening on port ${port} (data in ${config.dataDir}; sign-in ${auth ? 'on' : 'off'}; viewer ${viewer ? 'on' : 'off'}${config.readOnly ? '; READ-ONLY' : ''})`,
  );
  return {
    port,
    store,
    close: async () => {
      clearInterval(sweepTimer);
      await Promise.all([...sessions.values()].map((s) => s.transport.close().catch(() => undefined)));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
