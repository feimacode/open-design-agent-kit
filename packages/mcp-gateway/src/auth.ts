// Optional sign-in through feima-idp (openspec add-gateway-sign-in): protected
// resource metadata (RFC 9728), and RS256 access-token checks against the
// issuer's JWKS with the audience set to this gateway's /mcp URL. Tokens are
// never forwarded anywhere.
import { createPublicKey, verify as verifySignature, type JsonWebKey, type KeyObject } from 'node:crypto';
import { userKey, type GatewayUser } from './projects';

export const PROJECT_SCOPE = 'open-design:projects';

export function protectedResourceMetadata(resource: string, issuer: string): Record<string, unknown> {
  return {
    resource,
    authorization_servers: [issuer],
    scopes_supported: [PROJECT_SCOPE, 'offline_access'],
    bearer_methods_supported: ['header'],
    resource_name: 'Open Design',
    resource_documentation: 'https://github.com/feimacode/open-design-agent-kit/blob/main/docs/reference/remote-server.md',
  };
}

/** The WWW-Authenticate header for a 401 (RFC 6750 + RFC 9728). */
export function challengeHeader(metadataUrl: string, error?: 'invalid_token'): string {
  return `Bearer resource_metadata="${metadataUrl}", scope="${PROJECT_SCOPE}"${error ? `, error="${error}"` : ''}`;
}

interface Jwk extends JsonWebKey {
  kid?: string;
  kty?: string;
  use?: string;
  alg?: string;
}

export type TokenCheck = { ok: true; user: GatewayUser } | { ok: false; reason: string };

function b64json(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

export class TokenVerifier {
  private keys = new Map<string, KeyObject>();
  private fetchedAt = 0;

  constructor(
    private readonly issuer: string,
    private readonly jwksUrl: string,
    private readonly fetchJwks: (url: string) => Promise<{ keys: Jwk[] }> = async (url) => {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`JWKS ${res.status}`);
      return (await res.json()) as { keys: Jwk[] };
    },
    private readonly now: () => number = Date.now,
  ) {}

  private async refresh(): Promise<void> {
    const { keys } = await this.fetchJwks(this.jwksUrl);
    const next = new Map<string, KeyObject>();
    for (const jwk of keys ?? []) {
      if (jwk.kty !== 'RSA' || (jwk.use && jwk.use !== 'sig')) continue;
      next.set(jwk.kid ?? '', createPublicKey({ key: jwk, format: 'jwk' }));
    }
    this.keys = next;
    this.fetchedAt = this.now();
  }

  private async keyFor(kid: string): Promise<KeyObject | undefined> {
    const stale = this.now() - this.fetchedAt > 10 * 60 * 1000;
    if (stale || !this.keys.has(kid)) {
      // An unknown kid refetches at most once a minute, so bad tokens can't hammer the issuer.
      if (stale || this.now() - this.fetchedAt > 60 * 1000) await this.refresh();
    }
    return this.keys.get(kid) ?? (this.keys.size === 1 && !kid ? [...this.keys.values()][0] : undefined);
  }

  async check(token: string, audience: string): Promise<TokenCheck> {
    const parts = token.split('.');
    if (parts.length !== 3) return { ok: false, reason: 'malformed token' };
    let header: Record<string, unknown>;
    let claims: Record<string, unknown>;
    try {
      header = b64json(parts[0]);
      claims = b64json(parts[1]);
    } catch {
      return { ok: false, reason: 'malformed token' };
    }
    if (header.alg !== 'RS256') return { ok: false, reason: 'unsupported algorithm' };
    let key: KeyObject | undefined;
    try {
      key = await this.keyFor(typeof header.kid === 'string' ? header.kid : '');
    } catch {
      return { ok: false, reason: 'signing keys unavailable' };
    }
    if (!key) return { ok: false, reason: 'unknown signing key' };
    const signed = verifySignature('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
    if (!signed) return { ok: false, reason: 'bad signature' };
    const nowS = Math.floor(this.now() / 1000);
    if (claims.iss !== this.issuer) return { ok: false, reason: 'wrong issuer' };
    if (typeof claims.exp !== 'number' || claims.exp <= nowS) return { ok: false, reason: 'expired' };
    if (typeof claims.nbf === 'number' && claims.nbf > nowS + 60) return { ok: false, reason: 'not yet valid' };
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(audience)) return { ok: false, reason: 'token is for another service' };
    if (typeof claims.sub !== 'string' || !claims.sub) return { ok: false, reason: 'no subject' };
    return { ok: true, user: { sub: claims.sub, key: userKey(this.issuer, claims.sub) } };
  }
}
