// The remote profile's tool classification and limits (openspec add-remote-mcp-server, add-mcp-gateway).
// The HTTP side is tested in packages/mcp-gateway.
import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  hostedDesignSystemResult,
  isRemoteProfile,
  MinuteRateLimiter,
  newDownloads,
  remoteArgRefusal,
  remoteLimits,
  REMOTE_AVAILABLE_TOOLS,
  REMOTE_HIDDEN_TOOLS,
  snapshotFiles,
  usageRefusal,
} from '../../remote';

describe('remote profile (add-remote-mcp-server)', () => {
  it('classifies every tool as available or hidden, never both', async () => {
    const source = await fs.readFile(path.join(__dirname, '..', '..', 'session.ts'), 'utf8');
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

  it('refuses URL fetching and asset embedding', () => {
    assert.match(remoteArgRefusal('create_open_design_design_system', { sourceUrl: 'http://169.254.169.254/' }) ?? '', /does not fetch websites/);
    assert.strictEqual(remoteArgRefusal('create_open_design_design_system', { brief: 'calm' }), undefined);
    assert.match(remoteArgRefusal('export_open_design_artifact', { embedAssets: true }) ?? '', /embedAssets/);
    assert.strictEqual(remoteArgRefusal('export_open_design_artifact', { format: 'pdf' }), undefined);
    assert.strictEqual(remoteArgRefusal('publish_open_design_artifact', { provider: 'netlify' }), undefined);
    assert.match(remoteArgRefusal('extract_open_design_design_system', { url: 'https://example.com' }) ?? '', /pass its HTML and stylesheets as sources/);
    assert.match(remoteArgRefusal('extract_open_design_design_system', { compareTo: 'user:acme', sources: [] }) ?? '', /does not fetch websites/);
    assert.strictEqual(remoteArgRefusal('extract_open_design_design_system', { sources: [{ kind: 'css', text: ':root{--brand:#e4002b}' }], content: false }), undefined);
    // A Figma link is allowed: nothing is fetched, the agent reads the file through its own connector.
    assert.strictEqual(remoteArgRefusal('extract_open_design_design_system', { url: 'https://www.figma.com/design/AbC123/Brand?node-id=1-2' }), undefined);
    assert.strictEqual(remoteArgRefusal('extract_open_design_design_system', { url: 'https://www.figma.com/design/AbC123/Brand', sources: [{ kind: 'figma', figma: { kind: 'figma', file: 'AbC123', frames: [{ nodeId: '1:2', variables: {} }] } }] }), undefined);
    // Published styles need the local token, so the hosted server refuses that fallback.
    assert.match(remoteArgRefusal('extract_open_design_design_system', { sources: [{ kind: 'figma', figma: { kind: 'figma', file: 'AbC123', styles: true } }] }) ?? '', /cannot use styles: true/);
    // Logo files are the user's own; the hosted server lists them as needed instead.
    assert.match(remoteArgRefusal('extract_open_design_design_system', { sources: [{ kind: 'figma', figma: { kind: 'figma', file: 'AbC123', frames: [{ nodeId: '1:2', variables: {} }], logos: [{ role: 'logo', data: 'AAAA' }] } }] }) ?? '', /cannot store Figma logo exports/);
    assert.match(remoteArgRefusal('extract_open_design_design_system', { sources: [{ kind: 'figma', figma: { kind: 'figma', file: 'AbC123', frames: [{ nodeId: '1:2', variables: {} }], logos: [{ role: 'logo', path: 'exports/logo.svg' }] } }] }) ?? '', /cannot store Figma logo exports/);
    assert.strictEqual(remoteArgRefusal('extract_open_design_design_system', { sources: [{ kind: 'figma', figma: { kind: 'figma', file: 'AbC123', frames: [{ nodeId: '1:2', variables: {} }], logos: [{ role: 'logo', name: 'logo.svg' }], fonts: [{ family: 'Inter' }] } }] }), undefined);
    // A Canva link is never opened, and its export links come as fileUrl sources (openspec add-design-system-from-canva).
    assert.strictEqual(remoteArgRefusal('extract_open_design_design_system', { url: 'https://www.canva.com/design/DAHXIhXhUfw/AbCd/edit' }), undefined);
    assert.strictEqual(remoteArgRefusal('extract_open_design_design_system', { url: 'https://canva.link/abc123', sources: [{ kind: 'template', fileUrl: 'https://export-download.canva.com/a/b.pptx' }] }), undefined);
    assert.match(remoteArgRefusal('extract_open_design_design_system', { url: 'https://www.canva.com/pricing/' }) ?? '', /does not fetch websites/);
  });

  it('hands out the measurement script when it refuses a website, and never asks for estimates (add-browser-measured-source)', () => {
    const refusal = remoteArgRefusal('extract_open_design_design_system', { url: 'https://example.com/' }, { measureScriptUrl: 'https://od.example/measure/abc.js' }) ?? '';
    const block = JSON.parse(/^browserMeasure: (.+)$/m.exec(refusal)![1]) as { scriptVersion: string; loader: string; script: string; next: string };
    assert.match(block.scriptVersion, /^\d+-[0-9a-f]{12}$/);
    assert.match(block.loader, /od\.example\/measure\/abc\.js/);
    assert.ok(block.script.startsWith('(async () => {') && block.script.length < 60 * 1024);
    assert.match(block.next, /kind: "measured", url: "https:\/\/example\.com\/"/);
    assert.match(refusal, /browser tool/);
    assert.match(refusal, /Without a browser tool/);
    assert.match(refusal, /Never estimate/);
    // No gateway URL: the inline script only.
    assert.ok(!/"loader"/.test(remoteArgRefusal('extract_open_design_design_system', { url: 'https://example.com/' }) ?? ''));
    // A measured source is fine on the hosted server.
    assert.strictEqual(remoteArgRefusal('extract_open_design_design_system', { sources: [{ kind: 'measured', url: 'https://example.com/', data: '{}' }] }), undefined);
  });

  it('gives hosted design-system results links, never server paths (keep-hosted-extraction-honest)', async () => {
    const links = { download: (rel: string) => `https://od.example/files/odf_x/${rel}?sig=1`, view: async (entry: string) => `https://view.example/v/odv_1/#${entry}` };
    const exported = JSON.parse(
      await hostedDesignSystemResult(
        'export_open_design_design_system',
        JSON.stringify({ dir: 'claude-design/acme', files: ['claude-design/acme/project/tokens.json'], brandPage: 'claude-design/acme/brand.html', zip: 'claude-design/acme/claude-design-project.zip', notes: ['n'], warnings: [], next: 'give the user the folder' }),
        links,
      ),
    );
    assert.deepStrictEqual(Object.keys(exported).sort(), ['brandPageLink', 'claudeDesignDownload', 'next', 'notes', 'warnings']);
    assert.match(exported.claudeDesignDownload, /claude-design-project\.zip/);
    assert.ok(!/\/data\/|give the user the folder/.test(JSON.stringify(exported)));
    assert.match(exported.next, /never show the user a file or folder path/);
    const created = JSON.parse(await hostedDesignSystemResult('create_open_design_design_system', JSON.stringify({ instructions: 'x', suggestedEntryPath: 'design-systems/acme/DESIGN.md', id: 'user:acme', review: 'design-systems/acme/review.html' }), links));
    assert.match(created.next, /write_open_design_file only/);
    assert.match(created.next, /show_open_design_artifact with entryPath "design-systems\/acme\/review\.html"/);
    assert.match(created.next, /Not measured/);
    assert.strictEqual(await hostedDesignSystemResult('list_open_design_skills', 'plain', links), 'plain');
  });

  it('reads limits from the environment, ignoring bad values', () => {
    const d = remoteLimits({});
    assert.deepStrictEqual(d, { maxFiles: 500, maxBytes: 200 * 1024 * 1024, maxExports: 50, callsPerMinute: 120, sessionDays: 7, accountProjectDays: 180, projectsPerHour: 20, linkHours: 24 });
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
});
