import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseJsonc, readConfiguredMcpServers, serversFromConfig, vscodeMcpConfigFiles } from '../../integrations/mcpConfig';

describe('MCP config reader', () => {
  it('parses JSONC with comments, trailing commas and comment-like strings', () => {
    const v = parseJsonc('{\n // a comment\n "servers": { /* inline */ "a": { "url": "https://x.com/mcp", }, },\n "note": "http://not//a/comment",\n}');
    assert.deepStrictEqual(v, { servers: { a: { url: 'https://x.com/mcp' } }, note: 'http://not//a/comment' });
    assert.strictEqual(parseJsonc('{ broken'), undefined);
  });

  it('reads both config shapes', () => {
    assert.deepStrictEqual(serversFromConfig({ servers: { notion: { type: 'http', url: 'https://mcp.notion.com/mcp' } } }), [{ name: 'notion', url: 'https://mcp.notion.com/mcp' }]);
    assert.deepStrictEqual(serversFromConfig({ mcpServers: { local: { command: 'node' } } }), [{ name: 'local', url: undefined }]);
    assert.deepStrictEqual(serversFromConfig('nope'), []);
  });

  it('finds user, profile and workspace files, skipping missing ones', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-mcpcfg-'));
    const user = path.join(root, 'User');
    const ws = path.join(root, 'ws');
    await fs.mkdir(path.join(user, 'profiles', 'p1'), { recursive: true });
    await fs.mkdir(path.join(ws, '.vscode'), { recursive: true });
    await fs.writeFile(path.join(user, 'mcp.json'), '{ "servers": { "canva": { "url": "https://mcp.canva.com/mcp" } } }');
    await fs.writeFile(path.join(user, 'profiles', 'p1', 'mcp.json'), '{ "servers": { "figma": { "url": "https://mcp.figma.com/mcp" } } } // jsonc');
    await fs.writeFile(path.join(ws, '.mcp.json'), '{ "mcpServers": { "notion": { "url": "https://mcp.notion.com/mcp" } } }');
    const files = await vscodeMcpConfigFiles(user, [ws]);
    assert.strictEqual(files.length, 4);
    const servers = await readConfiguredMcpServers(files);
    assert.deepStrictEqual(servers.map((s) => s.name).sort(), ['canva', 'figma', 'notion']);
  });
});
