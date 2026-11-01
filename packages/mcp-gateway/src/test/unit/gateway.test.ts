// The gateway end to end over HTTP with the SDK client (openspec add-mcp-gateway,
// add-gateway-sign-in, add-hosted-design-viewer, deploy-hosted-gateway).
import * as assert from 'node:assert';
import { generateKeyPairSync, sign } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { REMOTE_HIDDEN_TOOLS } from '@feimacode/open-design-agent-kit-mcp/src/remote';
import { TokenVerifier } from '../../auth';
import { loadConfig } from '../../config';
import { startGateway, type Gateway } from '../../server';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ISSUER = 'https://auth.example';
function token(claims: Record<string, unknown>): string {
  const head = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'k1' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 600, ...claims })).toString('base64url');
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
}

/** A request with a chosen Host header (fetch won't send one). */
function hostRequest(url: string, host: string, method = 'GET'): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers: { host } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

function text(result: unknown): string {
  return ((result as { content: Array<{ type: string; text?: string }> }).content ?? []).map((c) => c.text ?? '').join('\n');
}

async function start(env: Record<string, string>, dataDir: string): Promise<Gateway> {
  const config = loadConfig({
    OPEN_DESIGN_LINK_SECRET: 'test-link-secret-0123456789',
    OPEN_DESIGN_REMOTE_DATA_DIR: dataDir,
    PORT: '1',
    HOST: '127.0.0.1',
    OPEN_DESIGN_AUTH_ISSUER: ISSUER,
    OPEN_DESIGN_USERCONTENT_URL: 'http://localhost',
    OPEN_DESIGN_OPENAI_CHALLENGE: 'challenge-value-123',
    ...env,
  });
  config.port = 0;
  const verifier = new TokenVerifier(ISSUER, `${ISSUER}/jwks`, async () => ({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig' } as never] }));
  return startGateway(config, 'test', verifier);
}

describe('hosted gateway over HTTP', function () {
  this.timeout(60000);
  let dataDir: string;
  let gw: Gateway;
  let base: string;

  before(async () => {
    process.env.OPEN_DESIGN_PREVIEW = 'off';
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-gateway-'));
    gw = await start({}, dataDir);
    base = `http://127.0.0.1:${gw.port}`;
  });

  after(async () => {
    await gw?.close();
  });

  const connect = async (headers: Record<string, string> = {}, url = `${base}/mcp`) => {
    const client = new Client({ name: 'chatgpt', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }));
    return client;
  };

  it('answers the health check, the OpenAI challenge and sign-in metadata', async () => {
    const health = await (await fetch(`${base}/healthz`)).json();
    assert.strictEqual(health.ok, true);
    assert.strictEqual(health.signIn, true);
    const challenge = await fetch(`${base}/.well-known/openai-apps-challenge`);
    assert.strictEqual(challenge.status, 200);
    assert.strictEqual(await challenge.text(), 'challenge-value-123');
    const prm = await (await fetch(`${base}/.well-known/oauth-protected-resource`)).json();
    assert.deepStrictEqual(prm.authorization_servers, [ISSUER]);
    assert.strictEqual(prm.resource, `${base}/mcp`);
    assert.strictEqual((await fetch(`${base}/mcp`)).status, 405);
  });

  it('lists titled tools with a project argument and hides local-only ones', async () => {
    const client = await connect();
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      assert.strictEqual(names[0], 'start_open_design_project');
      for (const hidden of Object.keys(REMOTE_HIDDEN_TOOLS)) assert.ok(!names.includes(hidden), `${hidden} is hidden`);
      for (const t of tools) assert.ok(t.title, `${t.name} has a title`);
      const write = tools.find((t) => t.name === 'write_open_design_file')!;
      assert.ok((write.inputSchema.required ?? []).includes('project'));
      const listSkills = tools.find((t) => t.name === 'list_open_design_skills')!;
      assert.ok(!('project' in (listSkills.inputSchema.properties ?? {})));
      assert.match(client.getInstructions() ?? '', /start_open_design_project/);
    } finally {
      await client.close();
    }
  });

  it('keeps projects apart, survives a restart, and refuses unknown handles', async () => {
    const client = await connect();
    let handleA: string;
    try {
      handleA = ((await client.callTool({ name: 'start_open_design_project', arguments: { title: 'Café poster' } })).structuredContent as { project: string }).project;
      const handleB = ((await client.callTool({ name: 'start_open_design_project', arguments: {} })).structuredContent as { project: string }).project;
      for (const project of [handleA, handleB]) {
        const opened = await client.callTool({ name: 'use_open_design_managed_workspace', arguments: { project, name: 'cafe poster' } });
        assert.ok(!opened.isError, text(opened));
      }
      const wrote = await client.callTool({ name: 'write_open_design_file', arguments: { project: handleA, path: 'cafe-poster/cafe-poster.html', content: '<!doctype html><body><p>A</p></body>' } });
      assert.ok(!wrote.isError, text(wrote));
      const a = path.join(dataDir, 'anon', handleA, 'files', 'cafe-poster', 'cafe-poster.html');
      assert.strictEqual(await fs.readFile(a, 'utf8'), '<!doctype html><body><p>A</p></body>');
      await assert.rejects(fs.access(path.join(dataDir, 'anon', handleB, 'files', 'cafe-poster', 'cafe-poster.html')));
      const missing = await client.callTool({ name: 'write_open_design_file', arguments: { path: 'x/x.html', content: 'x' } });
      assert.strictEqual(missing.isError, true);
      assert.match(text(missing), /start_open_design_project/);
      const unknown = await client.callTool({ name: 'get_open_design_artifact', arguments: { project: `odp_${'0'.repeat(32)}`, entryPath: 'x.html' } });
      assert.strictEqual(unknown.isError, true);
      assert.match(text(unknown), /unknown or has expired/);
      const browse = await client.callTool({ name: 'list_open_design_design_systems', arguments: { query: 'kami' } });
      assert.ok(!browse.isError, text(browse));
    } finally {
      await client.close();
    }
    // A new gateway on the same data: the project and the open design folder are still there.
    const second = await start({}, dataDir);
    try {
      const client2 = new Client({ name: 'claude-ai', version: '1.0.0' });
      await client2.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${second.port}/mcp`)));
      const wrote = await client2.callTool({ name: 'write_open_design_file', arguments: { project: handleA, path: 'cafe-poster/notes.txt', content: 'again' } });
      assert.ok(!wrote.isError, text(wrote));
      await client2.close();
    } finally {
      await second.close();
    }
  });

  it('makes viewer links on the user-content host only, with no-index headers', async () => {
    const client = await connect();
    try {
      const project = ((await client.callTool({ name: 'start_open_design_project', arguments: {} })).structuredContent as { project: string }).project;
      await client.callTool({ name: 'use_open_design_managed_workspace', arguments: { project, name: 'flyer' } });
      await client.callTool({ name: 'write_open_design_file', arguments: { project, path: 'flyer/flyer.html', content: '<!doctype html><html><body><h1>Flyer</h1></body></html>' } });
      const reg = await client.callTool({ name: 'register_open_design_artifact', arguments: { project, entryPath: 'flyer/flyer.html', kind: 'html', title: 'Flyer' } });
      assert.ok(!reg.isError, text(reg));
      const published = await client.callTool({ name: 'publish_open_design_artifact', arguments: { project, entryPath: 'flyer/flyer.html', provider: 'netlify' } });
      assert.ok(!published.isError, text(published));
      const link = /http:\/\/localhost\/v\/(odv_[0-9a-f]{32})\//.exec(text(published));
      assert.ok(link, text(published));
      assert.ok(!text(published).includes(project), 'the link does not reveal the project handle');
      const page = await hostRequest(`${base}/v/${link[1]}/`, 'localhost');
      assert.strictEqual(page.status, 200);
      assert.match(page.body, /<h1>Flyer<\/h1>[\s\S]*data-od-report/);
      assert.match(String(page.headers['x-robots-tag'] ?? ''), /noindex/);
      assert.strictEqual(page.headers['set-cookie'], undefined);
      const onGatewayHost = await fetch(`${base}/v/${link[1]}/`);
      assert.strictEqual(onGatewayHost.status, 404, 'the viewer never runs on the gateway host');
      const mcpOnViewerHost = await hostRequest(`${base}/mcp`, 'localhost', 'POST');
      assert.strictEqual(mcpOnViewerHost.status, 404);
      await client.callTool({ name: 'delete_open_design_project', arguments: { project } });
      const gone = await hostRequest(`${base}/v/${link[1]}/`, 'localhost');
      assert.strictEqual(gone.status, 404);
      assert.match(gone.body, /isn't available/);
    } finally {
      await client.close();
    }
  });

  it('asks for sign-in for the library, and keeps signed-in projects per user', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_open_design_projects', arguments: {} } }),
    });
    assert.strictEqual(res.status, 401);
    assert.match(res.headers.get('www-authenticate') ?? '', /resource_metadata=".*\/\.well-known\/oauth-protected-resource"/);

    const wrongAud = await fetch(`${base}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token({ sub: 'alice', aud: 'vscode-client' })}` }, body: '{}' });
    assert.strictEqual(wrongAud.status, 401);
    assert.match(wrongAud.headers.get('www-authenticate') ?? '', /invalid_token/);

    const alice = await connect({ authorization: `Bearer ${token({ sub: 'alice', aud: `${base}/mcp` })}` });
    const bob = await connect({ authorization: `Bearer ${token({ sub: 'bob', aud: `${base}/mcp` })}` });
    const anon = await connect();
    try {
      const anonProject = ((await anon.callTool({ name: 'start_open_design_project', arguments: { title: 'Draft' } })).structuredContent as { project: string }).project;
      const mine = ((await alice.callTool({ name: 'start_open_design_project', arguments: { title: 'Menu' } })).structuredContent as { project: string; signedIn: boolean });
      assert.strictEqual(mine.signedIn, true);
      const claimed = await alice.callTool({ name: 'claim_open_design_project', arguments: { project: anonProject } });
      assert.ok(!claimed.isError, text(claimed));
      const listed = await alice.callTool({ name: 'list_open_design_projects', arguments: {} });
      assert.match(text(listed), /Menu/);
      assert.match(text(listed), /Draft/);
      const stolen = await bob.callTool({ name: 'get_open_design_artifact', arguments: { project: mine.project, entryPath: 'x.html' } });
      assert.match(text(stolen), /unknown or has expired/);
      const gone = await anon.callTool({ name: 'get_open_design_artifact', arguments: { project: anonProject, entryPath: 'x.html' } });
      assert.match(text(gone), /unknown or has expired/, 'a claimed handle stops working anonymously');
    } finally {
      await Promise.all([alice.close(), bob.close(), anon.close()]);
    }
  });

  it('refuses download links with a bad signature', async () => {
    const res = await fetch(`${base}/files/odf_${'0'.repeat(32)}/x.pdf?exp=99999999999&sig=nope`);
    assert.strictEqual(res.status, 403);
  });
});

describe('read-only gateway', function () {
  this.timeout(60000);
  it('answers write tools with the maintenance notice and keeps browsing', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-gateway-ro-'));
    const gw = await start({ OPEN_DESIGN_GATEWAY_READONLY: '1' }, dataDir);
    const client = new Client({ name: 'chatgpt', version: '1.0.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${gw.port}/mcp`)));
      const started = await client.callTool({ name: 'start_open_design_project', arguments: {} });
      assert.strictEqual(started.isError, true);
      assert.match(text(started), /maintenance/);
      const browse = await client.callTool({ name: 'list_open_design_skills', arguments: { query: 'poster' } });
      assert.ok(!browse.isError);
      assert.deepStrictEqual(await fs.readdir(path.join(dataDir, 'anon')), []);
    } finally {
      await client.close();
      await gw.close();
    }
  });
});
