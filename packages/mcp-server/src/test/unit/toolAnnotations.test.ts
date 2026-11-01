// Every tool carries MCP annotations (openspec inline-preview-in-place, "Tool Annotations").
import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCP_APP_MIME_TYPE, MCP_APPS_EXTENSION_ID } from '@feimacode/open-design-agent-kit-core';
import { TOOL_ANNOTATIONS, TOOL_TITLES } from '../../toolAnnotations';

describe('tool annotations', function () {
  this.timeout(30000);

  it('every tool defined in index.ts has an entry, and every entry names a tool', async () => {
    const source = await fs.readFile(path.join(__dirname, '..', '..', 'session.ts'), 'utf8');
    const names = [...source.matchAll(/^\s{6}name: '([a-z0-9_]+)',$/gm)].map((m) => m[1]);
    assert.ok(names.length > 40, `found ${names.length} tool names`);
    assert.deepStrictEqual(names.filter((n) => !TOOL_ANNOTATIONS[n]), [], 'tools without annotations');
    assert.deepStrictEqual(Object.keys(TOOL_ANNOTATIONS).filter((n) => !names.includes(n)), [], 'annotations for no tool');
  });

  it('every tool has a title and a read-only or destructive hint (openspec add-mcp-gateway)', async () => {
    const source = await fs.readFile(path.join(__dirname, '..', '..', 'session.ts'), 'utf8');
    const names = [...source.matchAll(/^\s{6}name: '([a-z0-9_]+)',$/gm)].map((m) => m[1]);
    assert.deepStrictEqual(names.filter((n) => !TOOL_TITLES[n]?.trim()), [], 'tools without a title');
    assert.deepStrictEqual(Object.keys(TOOL_TITLES).filter((n) => !names.includes(n)), [], 'titles for no tool');
    // The ChatGPT plugin portal wants both hints set explicitly on every tool, read-only ones included.
    const noHint = names.filter((n) => typeof TOOL_ANNOTATIONS[n]?.readOnlyHint !== 'boolean' || typeof TOOL_ANNOTATIONS[n]?.destructiveHint !== 'boolean');
    assert.deepStrictEqual(noHint, [], 'tools without both readOnlyHint and destructiveHint');
  });

  it('the listed tools carry them, with the expected hints', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-annotations-'));
    const client = new Client({ name: 'reference-host', version: '1.0.0' }, { capabilities: { extensions: { [MCP_APPS_EXTENSION_ID]: { mimeTypes: [MCP_APP_MIME_TYPE] } } } as never });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['--require', 'tsx/cjs', path.join(__dirname, '..', '..', 'index.ts')],
        env: { ...process.env, OPEN_DESIGN_WORKSPACE_ROOT: root, OPEN_DESIGN_PREVIEW: 'off' } as Record<string, string>,
        stderr: 'ignore',
      }),
    );
    try {
      const { tools } = await client.listTools();
      for (const t of tools) assert.strictEqual(typeof t.annotations?.readOnlyHint, 'boolean', `${t.name} has readOnlyHint`);
      for (const t of tools) assert.strictEqual(typeof t.annotations?.destructiveHint, 'boolean', `${t.name} has destructiveHint`);
      for (const t of tools) assert.ok(t.title, `${t.name} has a title`);
      const byName = new Map(tools.map((t) => [t.name, t.annotations]));
      assert.strictEqual(byName.get('list_open_design_skills')?.readOnlyHint, true);
      assert.strictEqual(byName.get('get_open_design_preview_state')?.readOnlyHint, true);
      assert.strictEqual(byName.get('check_open_design_artifact')?.readOnlyHint, false);
      assert.strictEqual(byName.get('publish_open_design_artifact')?.readOnlyHint, false);
      assert.strictEqual(byName.get('publish_open_design_artifact')?.openWorldHint, true);
    } finally {
      await client.close();
    }
  });
});
