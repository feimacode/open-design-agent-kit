// The remote profile's tool classification and limits (openspec add-remote-mcp-server, add-mcp-gateway).
// The HTTP side is tested in packages/mcp-gateway.
import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
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
