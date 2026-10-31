// The preview MCP App's pickers (openspec add-mcp-app-pickers): pick
// messages, the page's state arguments, the example preview's size cap,
// design-system tiles and the campaign view's fallbacks.
import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ContentIndex, DesignSystemDetail } from '../../content/contentIndex';
import { campaignSheetPaths, writeCampaignSheetSidecar } from '../../export/campaignSheet';
import { fixCampaignPieceMessage, remixExampleMessage, saveTileMessage, useDesignSystemMessage } from '../../preview/mcpApp/protocol';
import { stateArgs } from '../../preview/mcpApp/transport';
import { buildCampaignState, buildExamplePreview, designSystemTile, loadedUrls } from '../../preview/server/mcpAppPickers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const tmp = (prefix: string): Promise<string> => fs.mkdtemp(path.join(os.tmpdir(), prefix));

describe('preview MCP App pickers', () => {
  describe('pick messages', () => {
    it('"Remix this" names the skill id and remix_open_design_example, and asks for a brief first', () => {
      const m = remixExampleMessage({ id: 'od:deck:swiss-international:example', name: 'Swiss deck' });
      assert.match(m, /skillId "od:deck:swiss-international:example"/);
      assert.match(m, /remix_open_design_example/);
      assert.match(m, /ask me first/);
    });

    it('"Use this design system" names the id and set_active_design_system', () => {
      assert.strictEqual(useDesignSystemMessage({ id: 'stripe', name: 'Stripe' }), 'Use the "Stripe" design system: call set_active_design_system with designSystemId "stripe".');
    });

    it('"Use as design system" names the exploration, the tile and next: "save-design-system"', () => {
      const m = saveTileMessage('tiles-1', { id: 'b', label: 'Cool' });
      assert.match(m, /"Cool" \(b\)/);
      assert.match(m, /explorationId "tiles-1", directionId "b" and next: "save-design-system"/);
    });

    it('"Fix this piece" names the shape and each error, or the piece\'s entry path', () => {
      const banner = fixCampaignPieceMessage('.open-design/launch/launch.html', { label: 'Mobile banner', shape: 'banner-mobile', errors: [{ check: 'overflow', message: 'Text overflows.' }] });
      assert.match(banner, /"banner-mobile" shape of "\.open-design\/launch\/launch\.html"/);
      assert.match(banner, /- overflow: Text overflows\./);
      assert.match(banner, /campaignSheet: true \(entryPath "\.open-design\/launch\/launch\.html"\)/);
      assert.match(banner, /don't call show_open_design_artifact again/);
      const landing = fixCampaignPieceMessage('m.html', { label: 'Landing', entryPath: 'landing.html', errors: [] });
      assert.match(landing, /the piece "landing\.html"/);
      assert.match(landing, /ask me what to change/);
    });
  });

  it('the page asks for each view with its filters, never its title', () => {
    assert.deepStrictEqual(stateArgs({ view: 'examples', title: 'x', surface: 'slides' }, '24'), { view: 'examples', surface: 'slides', cursor: '24' });
    assert.deepStrictEqual(stateArgs({ view: 'design-systems', title: 'x', ids: ['a', 'b'] }), { view: 'design-systems', ids: ['a', 'b'] });
    assert.deepStrictEqual(stateArgs({ view: 'campaign', title: 'x', entryPath: 'm.html' }), { view: 'campaign', entryPath: 'm.html' });
    assert.deepStrictEqual(stateArgs({ view: 'artifact', title: 'x', entryPath: 'm.html' }), { entryPath: 'm.html' });
  });

  describe('example previews', () => {
    const index = (exampleArtifactPath: string): ContentIndex => ({ getSkill: async () => ({ id: 'od:deck:big:example', name: 'Big', exampleArtifactPath }) }) as unknown as ContentIndex;

    it('bundle the example with its assets from the content root', async () => {
      const assets = await tmp('od-examples-');
      await fs.mkdir(path.join(assets, 'examples/small/assets'), { recursive: true });
      await fs.writeFile(path.join(assets, 'examples/small/assets/a.css'), 'h1 { color: red; }');
      await fs.writeFile(path.join(assets, 'examples/small/example.html'), '<!doctype html><html><head><link rel="stylesheet" href="assets/a.css"></head><body><h1>Hi</h1></body></html>');
      const result = await buildExamplePreview(index('examples/small/example.html'), assets, 'od:deck:big:example');
      assert.ok(result.ok && result.preview.html);
      assert.match(result.preview.html, /color: red/);
    });

    it('show text in place of a preview over 5 MiB', async () => {
      const assets = await tmp('od-examples-');
      await fs.mkdir(path.join(assets, 'examples/big'), { recursive: true });
      await fs.writeFile(path.join(assets, 'examples/big/example.html'), `<!doctype html><html><body><p>${'x'.repeat(5 * 1024 * 1024 + 10)}</p></body></html>`);
      const result = await buildExamplePreview(index('examples/big/example.html'), assets, 'od:deck:big:example');
      assert.ok(result.ok);
      assert.strictEqual(result.preview.html, undefined);
      assert.match(result.preview.fallback!, /too large to preview here/);
    });

    it('lists the remote URLs a page loads, not the ones it links to', () => {
      const urls = loadedUrls('<link rel="stylesheet" href="https://fonts.example.com/a.css"><img src="//cdn.example.com/x.png"><a href="https://example.com/page">x</a><style>@import "https://css.example.com/b.css"; .a { background: url(https://img.example.com/y.png) }</style>');
      assert.deepStrictEqual(urls.sort(), ['//cdn.example.com/x.png', 'https://css.example.com/b.css', 'https://fonts.example.com/a.css', 'https://img.example.com/y.png']);
    });
  });

  describe('design-system tiles', () => {
    const detail = (over: Partial<DesignSystemDetail>): DesignSystemDetail =>
      ({ id: 'acme', name: 'Acme', summary: 'Acme brand', category: 'Retail', source: 'built-in', hasTokens: false, body: '# Acme\n', craftSuggested: [], craftApplies: [], ...over }) as DesignSystemDetail;

    it('take swatches and fonts from tokens.css', () => {
      const tile = designSystemTile(
        detail({ hasTokens: true, tokensCss: ':root { --bg: #ffffff; --fg: #111111; --accent: #ff5500; --surface: #f4f4f4; --muted: #777777; --font-display: "Fraunces", serif; --font-body: Inter, sans-serif; }' }),
        'acme',
      );
      assert.deepStrictEqual(tile.swatches, ['#ffffff', '#111111', '#ff5500', '#f4f4f4', '#777777']);
      assert.strictEqual(tile.displayFont, 'Fraunces');
      assert.strictEqual(tile.bodyFont, 'Inter');
      assert.strictEqual(tile.active, true);
    });

    it('use DESIGN.md colors without tokens.css', () => {
      const tile = designSystemTile(detail({ body: '# Acme\n\n## Colors\n\n- **Brand Orange** (`#FF5500`): primary actions\n- **Ink** (`#101010`): text\n' }), undefined);
      assert.ok(tile.swatches.some((c) => c.toLowerCase() === '#ff5500'), JSON.stringify(tile.swatches));
      assert.strictEqual(tile.active, false);
    });
  });

  describe('campaign view', () => {
    const MASTER = '.open-design/launch/launch.html';

    it('asks for an export when there is no sheet', async () => {
      const root = await tmp('od-campaign-');
      const state = await buildCampaignState({ workspaceRoot: root, entryPath: MASTER, title: 'Launch' });
      assert.deepStrictEqual(state.tiles, []);
      assert.match(state.message!, /campaignSheet: true/);
      assert.strictEqual(state.sheetImage, undefined);
    });

    it('shows campaign-sheet.png from an older export without a sidecar', async () => {
      const root = await tmp('od-campaign-');
      const { sheet } = campaignSheetPaths(MASTER);
      await fs.mkdir(path.join(root, path.dirname(sheet)), { recursive: true });
      await fs.writeFile(path.join(root, sheet), PNG);
      const state = await buildCampaignState({ workspaceRoot: root, entryPath: MASTER, title: 'Launch' });
      assert.match(state.sheetImage!, /^data:image\/png;base64,/);
      assert.deepStrictEqual(state.tiles, []);
    });

    it('reads tiles in sheet order from the sidecar, leaving out images over the per-tile cap', async () => {
      const root = await tmp('od-campaign-');
      await fs.mkdir(path.join(root, '.open-design/launch'), { recursive: true });
      await writeCampaignSheetSidecar({
        workspaceRoot: root,
        master: MASTER,
        tiles: [
          { label: 'Mobile banner', shape: 'banner-mobile', errors: [{ check: 'overflow', message: 'Overflows.' }] },
          { label: 'Huge', shape: 'poster-a2', errors: [] },
        ],
        images: [{ data: PNG }, { data: Buffer.alloc(1024 * 1024 + 1) }],
      });
      const state = await buildCampaignState({ workspaceRoot: root, entryPath: MASTER, title: 'Launch' });
      assert.deepStrictEqual(state.tiles.map((t) => [t.label, t.shape, t.errors.length, !!t.image]), [
        ['Mobile banner', 'banner-mobile', 1, true],
        ['Huge', 'poster-a2', 0, false],
      ]);
    });
  });
});
