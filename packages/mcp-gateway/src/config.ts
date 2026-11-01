// The gateway's settings, all from the environment (openspec add-mcp-gateway,
// add-gateway-sign-in, add-hosted-design-viewer, deploy-hosted-gateway).
//
//   PORT                              listen port (default 8080)
//   OPEN_DESIGN_REMOTE_DATA_DIR       where projects, views and link refs live (default <tmp>/open-design-gateway)
//   OPEN_DESIGN_PUBLIC_URL            the gateway's public https origin, e.g. https://open-design.feimacode.com
//   OPEN_DESIGN_LINK_SECRET           required: signs download links (16+ characters)
//   OPEN_DESIGN_USERCONTENT_URL       the viewer's origin on a separate registrable domain; no viewer when unset
//   OPEN_DESIGN_OPENAI_CHALLENGE      the value OpenAI's domain verification expects
//   OPEN_DESIGN_AUTH_ISSUER           feima-idp's issuer, e.g. https://auth.feimacode.com; no sign-in when unset
//   OPEN_DESIGN_AUTH_JWKS_URL         defaults to <issuer>/.well-known/jwks.json
//   OPEN_DESIGN_GATEWAY_READONLY=1    maintenance: every tool that writes answers with a notice
//   OPEN_DESIGN_TRUST_PROXY=1         take the client IP from CF-Connecting-IP / X-Forwarded-For (behind Cloudflare and Traefik only)
//   OPEN_DESIGN_EXPORT_CONCURRENCY    exports running at once (default 2)
//   OPEN_DESIGN_EXPORT_WAIT_SECONDS   how long a call waits for an export before handing back a job id (default 20)
//   OPEN_DESIGN_REMOTE_*              per-project limits (packages/mcp-server/src/remote.ts)
import * as os from 'node:os';
import * as path from 'node:path';
import { remoteLimits, type RemoteLimits } from '@feimacode/open-design-agent-kit-mcp/src/remote';

export interface GatewayConfig {
  port: number;
  host: string;
  dataDir: string;
  publicUrl?: string;
  linkSecret: string;
  usercontentUrl?: string;
  openaiChallenge?: string;
  authIssuer?: string;
  authJwksUrl?: string;
  readOnly: boolean;
  trustProxy: boolean;
  exportConcurrency: number;
  exportWaitMs: number;
  limits: RemoteLimits;
}

function origin(value: string | undefined, name: string): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    throw new Error(`${name} must be a URL such as https://example.com`);
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new Error(`${name} must use https`);
  return url.origin;
}

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const linkSecret = env.OPEN_DESIGN_LINK_SECRET?.trim() ?? '';
  if (linkSecret.length < 16) throw new Error('OPEN_DESIGN_LINK_SECRET must be set to a secret of at least 16 characters.');
  const publicUrl = origin(env.OPEN_DESIGN_PUBLIC_URL, 'OPEN_DESIGN_PUBLIC_URL');
  const usercontentUrl = origin(env.OPEN_DESIGN_USERCONTENT_URL, 'OPEN_DESIGN_USERCONTENT_URL');
  if (publicUrl && usercontentUrl && sameSite(publicUrl, usercontentUrl)) {
    throw new Error('OPEN_DESIGN_USERCONTENT_URL must be on a different registrable domain from OPEN_DESIGN_PUBLIC_URL: designs are untrusted pages.');
  }
  const authIssuer = env.OPEN_DESIGN_AUTH_ISSUER?.trim().replace(/\/+$/, '') || undefined;
  return {
    port: positive(env.PORT, 8080),
    host: env.HOST?.trim() || '0.0.0.0',
    dataDir: path.resolve(env.OPEN_DESIGN_REMOTE_DATA_DIR?.trim() || path.join(os.tmpdir(), 'open-design-gateway')),
    publicUrl,
    linkSecret,
    usercontentUrl,
    openaiChallenge: env.OPEN_DESIGN_OPENAI_CHALLENGE?.trim() || undefined,
    authIssuer,
    authJwksUrl: env.OPEN_DESIGN_AUTH_JWKS_URL?.trim() || (authIssuer ? `${authIssuer}/.well-known/jwks.json` : undefined),
    readOnly: env.OPEN_DESIGN_GATEWAY_READONLY === '1' || env.OPEN_DESIGN_GATEWAY_READONLY === 'true',
    trustProxy: env.OPEN_DESIGN_TRUST_PROXY === '1' || env.OPEN_DESIGN_TRUST_PROXY === 'true',
    exportConcurrency: Math.floor(positive(env.OPEN_DESIGN_EXPORT_CONCURRENCY, 2)),
    exportWaitMs: positive(env.OPEN_DESIGN_EXPORT_WAIT_SECONDS, 20) * 1000,
    limits: remoteLimits(env),
  };
}

/** The last two labels of a host: a rough registrable domain, good enough to refuse feimacode.com vs x.feimacode.com. */
export function registrableDomain(host: string): string {
  return host.split('.').slice(-2).join('.');
}

export function sameSite(a: string, b: string): boolean {
  return registrableDomain(new URL(a).hostname) === registrableDomain(new URL(b).hostname);
}
