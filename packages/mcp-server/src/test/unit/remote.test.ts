// The hosted server's profile and HTTP side (openspec add-remote-mcp-server, phase 1).
import * as assert from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  downloadUrl,
  isRemoteProfile,
  MinuteRateLimiter,
  newDownloads,
  remoteArgRefusal,
  remoteLimits,
  REMOTE_AVAILABLE_TOOLS,
  REMOTE_HIDDEN_TOOLS,
  snapshotFiles,
  sweepSessions,
  tokenMatches,
  touchSession,
  usageRefusal,
  verifyDownload,
} from '../../remote';

const SID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('remote profile (add-remote-mcp-server)', () => {
  it('classifies every tool as available or hidden, never both', async () => {
    const source = await fs.readFile(path.join(__dirname, '..', '..', 'index.ts'), 'utf8');
    const names = [...source.matchAll(/^\s{6}name: '([a-z0-9_]+)',$/gm)].map((m) => m[1]);
    assert.ok(names.length > 40);
    const unclassified = names.filter((n) => !REMOTE_AVAILABLE_TOOLS.has(n) && !(n in REMOTE_HIDDEN_TOOLS));
    assert.deepStrictEqual(unclassified, [], 'tools with no remote classification');
    assert.deepStrictEqual([...REMOTE_AVAILABLE_TOOLS].filter((n) => n in REMOTE_HIDDEN_TOOLS), []);
    assert.deepStrictEqual([...REMOTE_AVAILABLE_TOOLS, ...Object.keys(REMOTE_HIDDEN_TOOLS)].filter((n) => !names.includes(n)), [], 'classified names that are no tool');
  });

  it('turns on only for OPEN_DESIGN_PROFILE=remote', () => {
    assert.strictEqual(isRemoteProfile({ OPEN_DESIGN_PROFILE: 'remote' }), true);
    assert.strictEqual(isRemoteProfile({}), false);
    assert.strictEqual(isRemoteProfile({ OPEN_DESIGN_PROFILE: 'local' }), false);
  });

  it('refuses URL fetching, asset embedding and token-based publish targets', () => {
    assert.match(remoteArgRefusal('create_open_design_design_system', { sourceUrl: 'http://169.254.169.254/' }) ?? '', /does not fetch websites/);
    assert.strictEqual(remoteArgRefusal('create_open_design_design_system', { brief: 'calm' }), undefined);
    assert.match(remoteArgRefusal('export_open_design_artifact', { embedAssets: true }) ?? '', /embedAssets/);
    assert.strictEqual(remoteArgRefusal('export_open_design_artifact', { format: 'pdf' }), undefined);
    assert.match(remoteArgRefusal('publish_open_design_artifact', { provider: 'netlify' }) ?? '', /temporary links/);
    assert.strictEqual(remoteArgRefusal('publish_open_design_artifact', {}), undefined);
    assert.strictEqual(remoteArgRefusal('publish_open_design_artifact', { provider: 'cloudflare-temporary' }), undefined);
  });

  it('reads limits from the environment, ignoring bad values', () => {
    const d = remoteLimits({});
    assert.deepStrictEqual(d, { maxFiles: 500, maxBytes: 200 * 1024 * 1024, maxExports: 50, callsPerMinute: 120, sessionDays: 7, linkHours: 24 });
    const l = remoteLimits({ OPEN_DESIGN_REMOTE_MAX_FILES: '3', OPEN_DESIGN_REMOTE_MAX_MB: '1', OPEN_DESIGN_REMOTE_CALLS_PER_MINUTE: 'lots' });
    assert.strictEqual(l.maxFiles, 3);
    assert.strictEqual(l.maxBytes, 1024 * 1024);
    assert.strictEqual(l.callsPerMinute, 120);
    assert.match(usageRefusal({ files: 3, bytes: 0 }, l) ?? '', /limit of 3 files/);
    assert.match(usageRefusal({ files: 0, bytes: 2 * 1024 * 1024 }, l) ?? '', /limit of 1 MB/);
    assert.strictEqual(usageRefusal({ files: 2, bytes: 10 }, l), undefined);
  });

  it('rate-limits calls per minute', () => {
    let now = 0;
    const limiter = new MinuteRateLimiter(2, () => now);
    assert.deepStrictEqual([limiter.take(), limiter.take(), limiter.take()], [true, true, false]);
    now = 60_000;
    assert.strictEqual(limiter.take(), true);
  });

  it('signs download links that expire and cannot be retargeted', () => {
    const url = new URL(downloadUrl('https://od.example/', 'secret', SID, 'poster/poster A4.pdf', 2000));
    assert.strictEqual(url.pathname, `/files/${SID}/poster/poster%20A4.pdf`);
    assert.deepStrictEqual(verifyDownload('secret', url.pathname, url.searchParams, 1000), { ok: true, sessionId: SID, rel: 'poster/poster A4.pdf' });
    assert.strictEqual(verifyDownload('secret', url.pathname, url.searchParams, 3000).ok, false);
    assert.strictEqual((verifyDownload('secret', url.pathname, url.searchParams, 3000) as { status: number }).status, 410);
    assert.strictEqual((verifyDownload('other', url.pathname, url.searchParams, 1000) as { status: number }).status, 403);
    const other = url.pathname.replace('poster%20A4.pdf', 'other.pdf');
    assert.strictEqual((verifyDownload('secret', other, url.searchParams, 1000) as { status: number }).status, 403);
    const longer = new URLSearchParams(url.searchParams);
    longer.set('exp', '999999');
    assert.strictEqual((verifyDownload('secret', url.pathname, longer, 1000) as { status: number }).status, 403);
    assert.strictEqual((verifyDownload('secret', `/files/${SID}/../x.pdf`, url.searchParams, 1000) as { status: number }).status, 400);
    assert.strictEqual((verifyDownload('secret', `/files/${SID}/.open-design/x.pdf`, url.searchParams, 1000) as { status: number }).status, 400);
    assert.strictEqual((verifyDownload('secret', '/files/not-a-session/x.pdf', url.searchParams, 1000) as { status: number }).status, 400);
  });

  it('compares tokens exactly', () => {
    assert.strictEqual(tokenMatches('abcdefghijklmnop', 'abcdefghijklmnop'), true);
    assert.strictEqual(tokenMatches('abcdefghijklmnop', 'abcdefghijklmnoq'), false);
    assert.strictEqual(tokenMatches('abcdefghijklmnop', 'abc'), false);
    assert.strictEqual(tokenMatches('abcdefghijklmnop', undefined), false);
  });

  it('finds new export files, skipping hidden folders and sources', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-remote-snap-'));
    await fs.mkdir(path.join(root, 'p', '.open-design'), { recursive: true });
    await fs.writeFile(path.join(root, 'p', 'p.html'), '<p>');
    const before = await snapshotFiles(root);
    await fs.writeFile(path.join(root, 'p', 'p-A4.pdf'), 'pdf');
    await fs.writeFile(path.join(root, 'p', 'notes.md'), 'md');
    await fs.writeFile(path.join(root, 'p', '.open-design', 'shot.png'), 'png');
    assert.deepStrictEqual(newDownloads(before, await snapshotFiles(root)), ['p/p-A4.pdf']);
  });

  it('sweeps sessions idle for longer than the limit', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-remote-sweep-'));
    const old = '11111111-1111-4111-8111-111111111111';
    const fresh = '22222222-2222-4222-8222-222222222222';
    await touchSession(path.join(dir, old));
    await touchSession(path.join(dir, fresh));
    await fs.mkdir(path.join(dir, 'not-a-session'));
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    await fs.utimes(path.join(dir, old, '.last-request'), tenDaysAgo, tenDaysAgo);
    assert.deepStrictEqual(await sweepSessions(dir, 7), [old]);
    assert.deepStrictEqual((await fs.readdir(dir)).sort(), [fresh, 'not-a-session']);
  });
});

describe('hosted HTTP server (add-remote-mcp-server)', function () {
  this.timeout(60000);
  const token = 'test-token-0123456789';
  let child: ChildProcess;
  let base: string;
  let dataDir: string;

  before(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-remote-http-'));
    child = spawn(process.execPath, ['--require', 'tsx/cjs', path.join(__dirname, '..', '..', 'index.ts'), '--http', '--port', '0'], {
      env: { ...process.env, OPEN_DESIGN_REMOTE_TOKEN: token, OPEN_DESIGN_REMOTE_DATA_DIR: dataDir, OPEN_DESIGN_PREVIEW: 'off', OPEN_DESIGN_WORKSPACE_ROOT: '' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    base = await new Promise<string>((resolve, reject) => {
      let log = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        log += chunk.toString();
        const m = /listening on port (\d+)/.exec(log);
        if (m) resolve(`http://127.0.0.1:${m[1]}`);
      });
      child.once('exit', (code) => reject(new Error(`server exited ${code}: ${log}`)));
    });
  });

  after(() => {
    child?.kill();
  });

  const connect = async (url = `${base}/mcp`, headers: Record<string, string> = { authorization: `Bearer ${token}` }) => {
    const client = new Client({ name: 'chatgpt', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
    await client.connect(transport);
    return { client, transport };
  };

  it('answers /healthz and refuses MCP without the token', async () => {
    const health = await fetch(`${base}/healthz`);
    assert.strictEqual(health.status, 200);
    assert.strictEqual((await health.json()).ok, true);
    const res = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.strictEqual(res.status, 401);
    await assert.rejects(connect(`${base}/mcp`, { authorization: 'Bearer wrong-token-0000000' }));
  });

  it('lists the remote tools only, and accepts the token in the URL', async () => {
    const { client } = await connect(`${base}/mcp/${token}`, {});
    try {
      const names = (await client.listTools()).tools.map((t) => t.name);
      assert.ok(names.includes('use_open_design_managed_workspace'));
      assert.ok(names.includes('write_open_design_file'));
      assert.ok(names.includes('prepare_open_design_brief'));
      for (const hidden of Object.keys(REMOTE_HIDDEN_TOOLS)) assert.ok(!names.includes(hidden), `${hidden} is hidden`);
      const refused = await client.callTool({ name: 'set_open_design_workspace', arguments: { path: '/etc' } });
      assert.strictEqual(refused.isError, true);
      assert.match(JSON.stringify(refused.content), /isn't available on the hosted Open Design server/);
    } finally {
      await client.close();
    }
  });

  it('gives each session its own folder', async () => {
    const a = await connect();
    const b = await connect();
    try {
      assert.ok(a.transport.sessionId && b.transport.sessionId && a.transport.sessionId !== b.transport.sessionId);
      for (const { client } of [a, b]) {
        await client.callTool({ name: 'use_open_design_managed_workspace', arguments: { name: 'cafe poster' } });
      }
      await a.client.callTool({ name: 'write_open_design_file', arguments: { path: 'cafe-poster/cafe-poster.html', content: '<!doctype html><p>A</p>' } });
      const aFile = path.join(dataDir, 'sessions', a.transport.sessionId!, 'cafe-poster', 'cafe-poster.html');
      const bFile = path.join(dataDir, 'sessions', b.transport.sessionId!, 'cafe-poster', 'cafe-poster.html');
      assert.strictEqual(await fs.readFile(aFile, 'utf8'), '<!doctype html><p>A</p>');
      await assert.rejects(fs.access(bFile));
    } finally {
      await a.client.close();
      await b.client.close();
    }
  });

  it('refuses download links with a bad signature', async () => {
    const res = await fetch(`${base}/files/${SID}/x.pdf?exp=99999999999&sig=nope`);
    assert.strictEqual(res.status, 403);
  });
});
