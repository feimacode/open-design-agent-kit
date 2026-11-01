// Unit tests for the gateway's pure parts (openspec add-mcp-gateway, add-gateway-sign-in, add-hosted-design-viewer).
import * as assert from 'node:assert';
import { generateKeyPairSync, sign } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { kitToolNames } from '@feimacode/open-design-agent-kit-mcp/src/session';
import { REMOTE_HIDDEN_TOOLS, remoteLimits } from '@feimacode/open-design-agent-kit-mcp/src/remote';
import { challengeHeader, protectedResourceMetadata, TokenVerifier } from '../../auth';
import { loadConfig, sameSite } from '../../config';
import { gatewayTools } from '../../gatewayTools';
import { GATEWAY_INSTRUCTIONS } from '../../guidance';
import { alwaysAJob, ExportJobs, Slots } from '../../jobs';
import { downloadUrl, verifyDownload } from '../../links';
import { PROJECT_HANDLE, ProjectStore, userKey } from '../../projects';
import { withReportBar } from '../../viewer';
import { calledTools } from '../../server';

const REF = 'odf_0123456789abcdef0123456789abcdef';

describe('download links', () => {
  it('sign, expire and refuse retargeting or traversal', () => {
    const url = new URL(downloadUrl('https://od.example', 'secret-secret-123', REF, 'poster/exports/poster.pdf', 2000));
    assert.ok(url.pathname.startsWith(`/files/${REF}/poster/`));
    assert.deepStrictEqual(verifyDownload('secret-secret-123', url.pathname, url.searchParams, 1000), { ok: true, ref: REF, rel: 'poster/exports/poster.pdf' });
    assert.strictEqual((verifyDownload('secret-secret-123', url.pathname, url.searchParams, 3000) as { status: number }).status, 410);
    assert.strictEqual((verifyDownload('other-secret-1234', url.pathname, url.searchParams, 1000) as { status: number }).status, 403);
    const moved = url.pathname.replace('poster.pdf', 'other.pdf');
    assert.strictEqual((verifyDownload('secret-secret-123', moved, url.searchParams, 1000) as { status: number }).status, 403);
    assert.strictEqual((verifyDownload('secret-secret-123', `/files/${REF}/../x`, url.searchParams, 1000) as { status: number }).status, 400);
    assert.strictEqual((verifyDownload('secret-secret-123', '/files/odp_handle/x.pdf', url.searchParams, 1000) as { status: number }).status, 400);
  });
});

describe('config', () => {
  it('needs a link secret and keeps the viewer off the gateway’s site', () => {
    assert.throws(() => loadConfig({}), /OPEN_DESIGN_LINK_SECRET/);
    assert.throws(
      () => loadConfig({ OPEN_DESIGN_LINK_SECRET: 'x'.repeat(16), OPEN_DESIGN_PUBLIC_URL: 'https://open-design.feimacode.com', OPEN_DESIGN_USERCONTENT_URL: 'https://view.feimacode.com' }),
      /different registrable domain/,
    );
    const c = loadConfig({ OPEN_DESIGN_LINK_SECRET: 'x'.repeat(16), OPEN_DESIGN_PUBLIC_URL: 'https://open-design.feimacode.com/', OPEN_DESIGN_AUTH_ISSUER: 'https://auth.feimacode.com/' });
    assert.strictEqual(c.publicUrl, 'https://open-design.feimacode.com');
    assert.strictEqual(c.authJwksUrl, 'https://auth.feimacode.com/.well-known/jwks.json');
    assert.strictEqual(c.exportWaitMs, 20000);
    assert.strictEqual(sameSite('https://a.example.com', 'https://b.example.com'), true);
    assert.strictEqual(sameSite('https://a.example.com', 'https://example-usercontent.com'), false);
  });
});

describe('guidance', () => {
  it('is short and names only tools that exist', () => {
    assert.ok(GATEWAY_INSTRUCTIONS.length < 3000, `instructions are ${GATEWAY_INSTRUCTIONS.length} characters`);
    const store = new ProjectStore(os.tmpdir(), remoteLimits({}));
    const gateway = gatewayTools({ store, jobs: new ExportJobs(1, 10), signInEnabled: true, caller: () => ({ ip: 'x' }) }).map((t) => t.tool.name);
    const known = new Set([...kitToolNames().filter((n) => !(n in REMOTE_HIDDEN_TOOLS)), ...gateway]);
    const named = [...GATEWAY_INSTRUCTIONS.matchAll(/\b([a-z]+(?:_[a-z0-9]+)+)\b/g)].map((m) => m[1]);
    assert.ok(named.length > 5);
    assert.deepStrictEqual(named.filter((n) => !known.has(n)), [], 'tools named in the instructions that the gateway does not offer');
  });

  it('gives every gateway tool a title and a read-only or destructive hint', () => {
    const store = new ProjectStore(os.tmpdir(), remoteLimits({}));
    for (const { tool } of gatewayTools({ store, jobs: new ExportJobs(1, 10), signInEnabled: true, caller: () => ({ ip: 'x' }) })) {
      assert.ok(tool.title && tool.annotations?.title, `${tool.name} has a title`);
      assert.ok(tool.annotations?.readOnlyHint === true || typeof tool.annotations?.destructiveHint === 'boolean', `${tool.name} has a hint`);
    }
  });
});

describe('export jobs', () => {
  it('run at most N at once', async () => {
    const slots = new Slots(2);
    let peak = 0;
    let running = 0;
    await Promise.all(
      [1, 2, 3, 4, 5].map(() =>
        slots.run(async () => {
          running += 1;
          peak = Math.max(peak, running);
          await new Promise((r) => setTimeout(r, 10));
          running -= 1;
        }),
      ),
    );
    assert.strictEqual(peak, 2);
  });

  it('return quick results directly and turn slow ones into jobs', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-jobs-'));
    const jobs = new ExportJobs(1, 50);
    const quick = await jobs.start(dir, { format: 'png' }, async () => ({ content: [{ type: 'text', text: 'done' }] }));
    assert.deepStrictEqual(quick, { result: { content: [{ type: 'text', text: 'done' }] } });
    const slow = await jobs.start(dir, { format: 'pdf' }, () => new Promise((r) => setTimeout(() => r({ content: [{ type: 'text', text: 'late' }] }), 120)));
    assert.ok('jobId' in slow);
    const id = (slow as { jobId: string }).jobId;
    assert.ok(['queued', 'running'].includes((await jobs.status(dir, id))!.status));
    await new Promise((r) => setTimeout(r, 200));
    const finished = await jobs.status(dir, id);
    assert.strictEqual(finished?.status, 'done');
    assert.strictEqual((finished?.result?.content[0] as { text: string }).text, 'late');
    assert.strictEqual(alwaysAJob({ format: 'pptx' }), true);
    assert.strictEqual(alwaysAJob({ format: 'png', data: 'a,b' }), true);
    assert.strictEqual(alwaysAJob({ format: 'pdf' }), false);
    assert.strictEqual(await jobs.status(dir, '../../etc'), undefined);
  });
});

describe('projects', () => {
  it('isolate anonymous and user projects, claim, limit and sweep', async () => {
    let now = Date.parse('2026-11-01T00:00:00Z');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-projects-'));
    const store = new ProjectStore(dir, { ...remoteLimits({}), projectsPerHour: 2, maxExports: 1 }, () => now);
    await store.init();
    const a = await store.create({ title: 'Poster' });
    assert.match(a.meta.id, PROJECT_HANDLE);
    const alice = { sub: 'alice', key: userKey('https://auth.example', 'alice') };
    const bob = { sub: 'bob', key: userKey('https://auth.example', 'bob') };
    const mine = await store.create({ user: alice });
    assert.ok(await store.find(mine.meta.id, alice));
    assert.strictEqual(await store.find(mine.meta.id, bob), undefined, "another user's project");
    assert.strictEqual(await store.find(mine.meta.id), undefined, 'a user project without sign-in');
    assert.ok(await store.find(a.meta.id, bob), 'anonymous projects open for anyone with the handle');
    assert.strictEqual(await store.countExport(a), true);
    assert.strictEqual(await store.countExport(a), false);
    assert.deepStrictEqual([store.allowNewProject('1.2.3.4'), store.allowNewProject('1.2.3.4'), store.allowNewProject('1.2.3.4')], [true, true, false]);
    const claimed = await store.claim(a.meta.id, alice);
    assert.ok(claimed);
    assert.strictEqual(await store.find(a.meta.id), undefined, 'the anonymous handle stops working');
    assert.deepStrictEqual((await store.list(alice)).map((p) => p.id).sort(), [a.meta.id, mine.meta.id].sort());
    assert.ok(await store.dirForFilesRef(a.meta.filesRef));
    const anon = await store.create({});
    now += 8 * 24 * 60 * 60 * 1000;
    assert.deepStrictEqual(await store.sweep(), [anon.meta.id]);
    now += 200 * 24 * 60 * 60 * 1000;
    assert.strictEqual((await store.sweep()).length, 2);
    assert.strictEqual(await store.dirForFilesRef(a.meta.filesRef), undefined);
  });
});

describe('sign-in', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' };
  const token = (claims: Record<string, unknown>, kid = 'k1'): string => {
    const head = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString('base64url');
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
  };
  const now = 1_800_000_000_000;
  const verifier = new TokenVerifier('https://auth.example', 'https://auth.example/jwks', async () => ({ keys: [jwk as never] }), () => now);
  const good = { iss: 'https://auth.example', sub: 'alice', aud: 'https://od.example/mcp', exp: now / 1000 + 600 };

  it('accepts tokens for this resource only', async () => {
    const ok = await verifier.check(token(good), 'https://od.example/mcp');
    assert.ok(ok.ok && ok.user.sub === 'alice');
    assert.deepStrictEqual(await verifier.check(token({ ...good, aud: 'vscode-client' }), 'https://od.example/mcp'), { ok: false, reason: 'token is for another service' });
    assert.deepStrictEqual(await verifier.check(token({ ...good, iss: 'https://evil.example' }), 'https://od.example/mcp'), { ok: false, reason: 'wrong issuer' });
    assert.deepStrictEqual(await verifier.check(token({ ...good, exp: now / 1000 - 1 }), 'https://od.example/mcp'), { ok: false, reason: 'expired' });
    const t = token(good);
    const tampered = `${t.split('.')[0]}.${Buffer.from(JSON.stringify({ ...good, sub: 'mallory' })).toString('base64url')}.${t.split('.')[2]}`;
    assert.deepStrictEqual(await verifier.check(tampered, 'https://od.example/mcp'), { ok: false, reason: 'bad signature' });
    assert.deepStrictEqual(await verifier.check('a.b', 'https://od.example/mcp'), { ok: false, reason: 'malformed token' });
  });

  it('describes itself for hosts', () => {
    const meta = protectedResourceMetadata('https://od.example/mcp', 'https://auth.example');
    assert.deepStrictEqual(meta.authorization_servers, ['https://auth.example']);
    assert.match(challengeHeader('https://od.example/.well-known/oauth-protected-resource'), /^Bearer resource_metadata="https:\/\/od\.example\/\.well-known\/oauth-protected-resource"/);
  });
});

describe('viewer and requests', () => {
  it('adds the report bar once, before the last </body>', () => {
    const html = withReportBar('<html><body><p>x</p></body></html>', 'support@example.com', 'odv_1');
    assert.strictEqual(html.match(/data-od-report/g)?.length, 1);
    assert.ok(html.indexOf('data-od-report') < html.lastIndexOf('</body>'));
  });

  it('finds the tools a JSON-RPC body calls', () => {
    assert.deepStrictEqual(calledTools({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_open_design_projects' } }), ['list_open_design_projects']);
    assert.deepStrictEqual(calledTools([{ method: 'tools/list' }, { method: 'tools/call', params: { name: 'a_b' } }]), ['a_b']);
    assert.deepStrictEqual(calledTools(undefined), []);
  });
});
