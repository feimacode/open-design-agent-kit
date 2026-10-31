// The preview MCP App's server side (openspec add-mcp-app-preview): host
// detection, the show text, the state the page reads, and comment writes.
import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  applyCommentsMessage,
  clientSupportsMcpApps,
  exportRequestMessage,
  MCP_APP_MIME_TYPE,
  pickDirectionMessage,
  PREVIEW_APP_URI,
  previewAppToolMeta,
  appOnlyToolMeta,
} from '../../preview/mcpApp/protocol';
import {
  buildArtifactPreviewState,
  buildExplorationPreviewState,
  parseCommentFromApp,
  prepareShow,
  previewAppResourceDomains,
  remoteOrigins,
  renderPreviewAppPage,
  saveCommentFromApp,
} from '../../preview/server/mcpApp';
import { writeArtifactManifest } from '../../vendored/artifactCreate';
import { readArtifactComments, writeArtifactComments, type ArtifactComment } from '../../workspace/artifactComments';
import { writeExplorationPlan, type ExplorationPlan } from '../../workspace/explorationStore';

const OUT = '.open-design';
const ENTRY = `${OUT}/poster/index.html`;
const POSTER = `<!doctype html><html><head><title>Poster</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces">
<link rel="stylesheet" href="poster.css"></head>
<body><h1 class="headline">Coffee</h1><img src="https://images.example.com/cup.png" alt=""></body></html>`;

const comment = (over: Partial<ArtifactComment> = {}): ArtifactComment => ({
  id: 'c-1',
  selector: 'h1.headline',
  htmlHint: '<h1 class="headline">',
  note: 'too dark',
  status: 'open',
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
  text: 'Coffee',
  ...over,
});

async function workspace(register = true): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-mcp-app-'));
  await fs.mkdir(path.join(root, OUT, 'poster'), { recursive: true });
  await fs.writeFile(path.join(root, ENTRY), POSTER);
  await fs.writeFile(path.join(root, OUT, 'poster', 'poster.css'), 'h1 { color: #222; }');
  if (register) await writeArtifactManifest({ workspaceRoot: root, entryPath: ENTRY, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Coffee poster' } });
  return root;
}

describe('preview MCP App', () => {
  describe('protocol', () => {
    it('detects hosts that render MCP Apps from their capabilities', () => {
      assert.strictEqual(clientSupportsMcpApps({ extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [MCP_APP_MIME_TYPE] } } }), true);
      assert.strictEqual(clientSupportsMcpApps({ extensions: { 'io.modelcontextprotocol/ui': {} } }), true);
      assert.strictEqual(clientSupportsMcpApps({ extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html'] } } }), false);
      assert.strictEqual(clientSupportsMcpApps({ roots: {} }), false);
      assert.strictEqual(clientSupportsMcpApps(undefined), false);
    });

    it('links the show tool to the resource and hides app-only tools from the model', () => {
      assert.deepStrictEqual(previewAppToolMeta(), { ui: { resourceUri: PREVIEW_APP_URI }, 'ui/resourceUri': PREVIEW_APP_URI });
      assert.deepStrictEqual(appOnlyToolMeta(), { ui: { resourceUri: PREVIEW_APP_URI, visibility: ['app'] } });
    });

    it('writes chat messages that name the entry, the comment ids and the tools to call', () => {
      const apply = applyCommentsMessage(ENTRY, [comment()]);
      assert.match(apply, /comment on the Open Design artifact "\.open-design\/poster\/index\.html"/);
      assert.match(apply, /- c-1: too dark/);
      assert.match(apply, /resolvedCommentIds/);
      assert.match(apply, /updates by itself, so don't call show_open_design_artifact again/);
      assert.match(exportRequestMessage(ENTRY, 'png'), /export_open_design_artifact with format "png"/);
      const pick = pickDirectionMessage('pricing', { id: 'b', label: 'Bold' });
      assert.match(pick, /"Bold" \(b\)/);
      assert.match(pick, /Ask me .* then call choose_open_design_direction/);
    });
  });

  describe('resource', () => {
    it('inlines the app script and the preview chrome in one page', () => {
      const html = renderPreviewAppPage('console.log("</script>")');
      assert.match(html, /<div id="root"><\/div>/);
      assert.match(html, /\.od-pin/);
      assert.ok(html.includes('console.log("<\\/script>")'), 'a closing script tag inside the bundle is escaped');
      assert.ok(!/<script src=/.test(html), 'nothing is loaded from elsewhere');
    });

    it('declares Google Fonts plus the remote origins designs needed', () => {
      assert.deepStrictEqual(remoteOrigins(['https://images.example.com/cup.png', '//cdn.example.org/x.js', 'data:,', 'poster.css']), ['https://images.example.com', 'https://cdn.example.org']);
      assert.deepStrictEqual(previewAppResourceDomains(['https://images.example.com']), ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://images.example.com']);
    });
  });

  describe('show_open_design_artifact', () => {
    it('returns the title, path and open comments, with the browser hint for hosts without MCP Apps', async () => {
      const root = await workspace();
      await writeArtifactComments(root, ENTRY, [comment(), comment({ id: 'c-2', status: 'resolved', note: 'done' })]);
      const shown = await prepareShow({ workspaceRoot: root, outputDir: OUT, entryPath: ENTRY, hostRendersApp: false });
      assert.ok(shown.ok);
      assert.deepStrictEqual(shown.ok && shown.target, { view: 'artifact', entryPath: ENTRY, title: 'Coffee poster' });
      assert.match(shown.text, /Showing "Coffee poster" \(\.open-design\/poster\/index\.html\)/);
      assert.match(shown.text, /Open comments \(1\):\n- c-1 \[open\] on "Coffee": too dark/);
      assert.match(shown.text, /open_open_design_preview/);
      const inline = await prepareShow({ workspaceRoot: root, outputDir: OUT, entryPath: ENTRY, hostRendersApp: true });
      assert.ok(!inline.text.includes('open_open_design_preview'));
    });

    it('returns a not-registered result for an entry without a manifest', async () => {
      const root = await workspace(false);
      const shown = await prepareShow({ workspaceRoot: root, outputDir: OUT, entryPath: ENTRY, hostRendersApp: true });
      assert.strictEqual(shown.ok, false);
      assert.match(shown.text, /isn't registered yet/);
      const missing = await prepareShow({ workspaceRoot: root, outputDir: OUT, entryPath: `${OUT}/nope.html`, hostRendersApp: true });
      assert.match(missing.text, /No artifact found/);
    });
  });

  describe('get_open_design_preview_state', () => {
    it('inlines local files, injects the bridge, and reports remote dependencies', async () => {
      const root = await workspace();
      await writeArtifactComments(root, ENTRY, [comment()]);
      const result = await buildArtifactPreviewState({ workspaceRoot: root, outputDir: OUT, entryPath: ENTRY, bridgeJs: 'window.__odBridgeTest=1' });
      assert.ok(result.ok);
      if (!result.ok) return;
      const { state } = result;
      assert.strictEqual(state.title, 'Coffee poster');
      assert.ok(state.html?.includes('h1 { color: #222; }'), 'the local stylesheet is inlined');
      assert.ok(state.html?.includes('window.__odBridgeTest=1'), 'the bridge is injected');
      assert.ok(state.html?.includes('odPreviewError'), 'the error reporter is injected');
      assert.deepStrictEqual(state.comments.map((c) => c.id), ['c-1']);
      assert.deepStrictEqual(state.exports, ['png', 'pdf', 'standalone']);
      assert.ok(result.externalDependencies.includes('https://images.example.com/cup.png'));
    });

    it('falls back to the check screenshot for kinds it cannot show inline', async () => {
      const root = await workspace();
      await writeArtifactManifest({ workspaceRoot: root, entryPath: ENTRY, artifactManifest: { kind: 'markdown-document', renderer: 'markdown', exports: ['md'], title: 'Notes' } });
      const result = await buildArtifactPreviewState({ workspaceRoot: root, outputDir: OUT, entryPath: ENTRY, bridgeJs: '' });
      assert.ok(result.ok && !result.state.html && /isn't shown inline/.test(result.state.fallback ?? ''));
    });

    it('lists an exploration\'s directions with their pages', async () => {
      const root = await workspace();
      const plan: ExplorationPlan = {
        version: 1,
        explorationId: 'poster',
        title: 'Poster directions',
        brief: 'A coffee poster',
        skillId: 'od:poster',
        skillMode: 'prototype',
        axis: 'visual',
        createdAt: new Date().toISOString(),
        directions: [
          { id: 'a', label: 'Warm', axis: 'visual', summary: 'Browns', spec: '', entryPath: ENTRY },
          { id: 'b', label: 'Bold', axis: 'visual', summary: 'Black and red', spec: '', entryPath: `${OUT}/poster/b.html` },
        ],
      };
      await writeExplorationPlan(root, OUT, plan);
      await writeArtifactManifest({ workspaceRoot: root, entryPath: ENTRY, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Warm', explorationId: 'poster', directionId: 'a' } });
      const result = await buildExplorationPreviewState({ workspaceRoot: root, outputDir: OUT, explorationId: 'poster' });
      assert.ok(result.ok);
      if (!result.ok) return;
      assert.deepStrictEqual(
        result.state.directions.map((d) => [d.id, d.entryPath, Boolean(d.html)]),
        [
          ['a', ENTRY, true],
          ['b', undefined, false],
        ],
      );
      const shown = await prepareShow({ workspaceRoot: root, outputDir: OUT, explorationId: 'poster', hostRendersApp: true });
      assert.deepStrictEqual(shown.ok && shown.target, { view: 'exploration', explorationId: 'poster', title: 'Poster directions' });
    });
  });

  describe('save_open_design_comment', () => {
    it('creates, edits by id and deletes one comment, keeping fields it did not send', async () => {
      const root = await workspace();
      await saveCommentFromApp({ workspaceRoot: root, entryPath: ENTRY, comment: comment({ host: 'mcp-app' }) });
      const [saved] = await readArtifactComments(root, ENTRY);
      assert.strictEqual(saved.note, 'too dark');
      assert.strictEqual(saved.host, 'mcp-app');
      // Another preview added a crop; an edit from the page doesn't drop it.
      await writeArtifactComments(root, ENTRY, [{ ...saved, screenshot: 'index.html.comments/c-1.png' }]);
      await saveCommentFromApp({ workspaceRoot: root, entryPath: ENTRY, comment: { ...saved, status: 'sent', updatedAt: '2026-10-21T00:00:00.000Z' } });
      const [edited] = await readArtifactComments(root, ENTRY);
      assert.strictEqual(edited.status, 'sent');
      assert.strictEqual(edited.screenshot, 'index.html.comments/c-1.png');
      await saveCommentFromApp({ workspaceRoot: root, entryPath: ENTRY, deleteId: 'c-1' });
      assert.deepStrictEqual(await readArtifactComments(root, ENTRY), []);
    });

    it('rejects malformed comments and unregistered entries', async () => {
      assert.match(String(parseCommentFromApp({ ...comment(), id: '../x' })), /comment\.id/);
      assert.match(String(parseCommentFromApp({ ...comment(), status: 'done' })), /comment\.status/);
      assert.match(String(parseCommentFromApp({ ...comment(), note: '' })), /comment\.note/);
      const root = await workspace(false);
      const result = await saveCommentFromApp({ workspaceRoot: root, entryPath: ENTRY, comment: comment() });
      assert.strictEqual(result.ok, false);
    });
  });
});
