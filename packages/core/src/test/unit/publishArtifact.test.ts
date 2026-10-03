import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { publishArtifact } from '../../generation/publishArtifact';
import { siteNameForShare, slugForShare } from '../../generation/publishInstructions';
import { writeArtifactManifest } from '../../vendored/artifactCreate';
import {
  isExpired,
  liveShareRecords,
  MAX_SHARE_RECORDS,
  PUBLISH_PROVIDERS,
  readShareRecords,
  upsertShareRecord,
  validatePublished,
  type ShareRecord,
} from '../../workspace/shareRecords';

const ENTRY = '.open-design/pitch/pitch.html';
const PAGE = '<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><h1>Pitch</h1></body></html>';

async function workspace(register = true, metadata?: Record<string, unknown>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-publish-'));
  await fs.mkdir(path.join(root, '.open-design/pitch'), { recursive: true });
  await fs.writeFile(path.join(root, ENTRY), PAGE);
  if (register) {
    await writeArtifactManifest({
      workspaceRoot: root,
      entryPath: ENTRY,
      artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Launch Pitch', ...(metadata ? { metadata } : {}) },
    });
  }
  return root;
}

async function manifestOf(root: string) {
  return JSON.parse(await fs.readFile(path.join(root, `${ENTRY}.artifact.json`), 'utf8'));
}

describe('publishArtifact — prepare', () => {
  it('builds the bundle and asks the user to choose when no provider is given', async () => {
    const root = await workspace();
    const result = await publishArtifact({ workspaceRoot: root, entryPath: ENTRY });
    assert.ok(result.ok, result.text);
    for (const id of PUBLISH_PROVIDERS) assert.ok(result.text.includes(`\`${id}\``), id);
    assert.match(result.text, /call `publish_open_design_artifact` again/);
    assert.ok(!/npx -y/.test(result.text), 'no deploy commands before a provider is chosen');
    await fs.access(path.join(root, '.open-design/pitch/exports/site/index.html'));
  });

  it('puts a stop-and-confirm stage before the first deploy command, for every provider', async () => {
    const root = await workspace();
    for (const provider of PUBLISH_PROVIDERS) {
      const { ok, text } = await publishArtifact({ workspaceRoot: root, entryPath: ENTRY, provider });
      assert.ok(ok, `${provider}: ${text}`);
      const confirm = text.indexOf('## Stage 2 — confirm');
      const deploy = text.indexOf('## Stage 3 — deploy');
      assert.ok(confirm > 0 && deploy > confirm, provider);
      const beforeDeploy = text.slice(0, deploy);
      assert.ok(!/ deploy (\.|--)/.test(beforeDeploy), `${provider}: a deploy command appears before confirmation`);
      assert.match(beforeDeploy, /anyone with the link/, provider);
      assert.match(beforeDeploy, /badge/i, provider);
      assert.match(text, /Do NOT run any deploy command until the user has said yes/, provider);
      assert.match(text, /Never deploy the workspace root/, provider);
    }
  });

  it('uses the anonymous flags and states expiry for temporary providers', async () => {
    const root = await workspace();
    const netlify = await publishArtifact({ workspaceRoot: root, entryPath: ENTRY, provider: 'netlify-temporary' });
    assert.match(netlify.text, /deploy --allow-anonymous --dir \. --no-build --json/);
    assert.match(netlify.text, /expires in about 60 minutes unless the user claims it/);
    assert.match(netlify.text, /password/);
    const cf = await publishArtifact({ workspaceRoot: root, entryPath: ENTRY, provider: 'cloudflare-temporary' });
    assert.match(cf.text, /wrangler@latest deploy \. --temporary --name od-launch-pitch-[0-9a-f]{4} --compatibility-date \d{4}-\d{2}-\d{2}/);
  });

  it('gates own-account providers on a login check and forbids inventing accounts', async () => {
    const root = await workspace();
    const vercel = await publishArtifact({ workspaceRoot: root, entryPath: ENTRY, provider: 'vercel' });
    assert.ok(vercel.text.indexOf('vercel@latest whoami') < vercel.text.indexOf('## Stage 2'));
    assert.match(vercel.text, /ask the user to run `npx -y vercel@latest login` themselves/);
    assert.match(vercel.text, /Never invent an account/);
    const gh = await publishArtifact({ workspaceRoot: root, entryPath: ENTRY, provider: 'github-pages' });
    assert.match(gh.text, /gh auth status/);
    assert.match(gh.text, /public, even from private repositories/);
  });

  it('redeploys to the recorded site and adds og:image from its URL', async () => {
    const root = await workspace();
    await fs.mkdir(path.join(root, '.open-design/pitch/exports'), { recursive: true });
    await fs.writeFile(path.join(root, '.open-design/pitch/exports/pitch.png'), 'png');
    const recorded = await publishArtifact({
      workspaceRoot: root,
      entryPath: ENTRY,
      published: { provider: 'netlify', url: 'https://pitch-abc.netlify.app/', siteRef: 'site-123' },
    });
    assert.ok(recorded.ok, recorded.text);
    const again = await publishArtifact({ workspaceRoot: root, entryPath: ENTRY, provider: 'netlify' });
    assert.match(again.text, /--site 'site-123'/);
    assert.ok(!again.text.includes('--site-name'));
    const html = await fs.readFile(path.join(root, '.open-design/pitch/exports/site/index.html'), 'utf8');
    assert.match(html, /og:image" content="https:\/\/pitch-abc\.netlify\.app\/og\.png"/);
  });

  it('honours badge: false and the host setting', async () => {
    const root = await workspace();
    const off = await publishArtifact({ workspaceRoot: root, entryPath: ENTRY, provider: 'netlify', badge: false });
    assert.match(off.text, /Footer badge: not included/);
    const settingOff = await publishArtifact({ workspaceRoot: root, entryPath: ENTRY, provider: 'netlify', badgeSetting: false });
    assert.match(settingOff.text, /Footer badge: not included/);
    const on = await publishArtifact({ workspaceRoot: root, entryPath: ENTRY, provider: 'netlify' });
    assert.match(on.text, /Footer badge: \*\*included\*\*/);
  });

  it('returns errors without instructions for unregistered artifacts, unknown providers and broken bundles', async () => {
    const unregistered = await publishArtifact({ workspaceRoot: await workspace(false), entryPath: ENTRY });
    assert.ok(!unregistered.ok && /isn't registered/.test(unregistered.text));
    const root = await workspace();
    const unknown = await publishArtifact({ workspaceRoot: root, entryPath: ENTRY, provider: 'surge' });
    assert.ok(!unknown.ok && /Unknown provider/.test(unknown.text));
    await fs.writeFile(path.join(root, ENTRY), '<!doctype html><img src="gone.png">');
    const broken = await publishArtifact({ workspaceRoot: root, entryPath: ENTRY, provider: 'netlify' });
    assert.ok(!broken.ok);
    assert.match(broken.text, /missing-references/);
    assert.ok(!broken.text.includes('Stage'));
  });
});

describe('publishArtifact — record', () => {
  it('records a temporary link with its claim URL and expiry', async () => {
    const root = await workspace();
    const result = await publishArtifact({
      workspaceRoot: root,
      entryPath: ENTRY,
      published: {
        provider: 'cloudflare-temporary',
        url: 'https://x.workers.dev',
        claimUrl: 'https://dash.cloudflare.com/claim/abc',
        expiresAt: '2026-10-03T13:00:00Z',
      },
      now: new Date('2026-10-03T12:00:00Z'),
    });
    assert.ok(result.ok, result.text);
    const shares = readShareRecords(await manifestOf(root));
    assert.deepStrictEqual(shares, [
      {
        provider: 'cloudflare-temporary',
        url: 'https://x.workers.dev',
        claimUrl: 'https://dash.cloudflare.com/claim/abc',
        expiresAt: '2026-10-03T13:00:00.000Z',
        publishedAt: '2026-10-03T12:00:00.000Z',
      },
    ]);
  });

  it('rejects non-https URLs and leaves the manifest alone', async () => {
    const root = await workspace();
    const before = await manifestOf(root);
    for (const url of ['http://example.com', 'file:///tmp/x.html']) {
      const result = await publishArtifact({ workspaceRoot: root, entryPath: ENTRY, published: { provider: 'netlify', url } });
      assert.ok(!result.ok && /invalid-args/.test(result.text), url);
    }
    assert.deepStrictEqual(await manifestOf(root), before);
  });

  it('keeps other metadata when recording', async () => {
    const root = await workspace(true, { remixedFrom: 'od:prototype:x' });
    await publishArtifact({ workspaceRoot: root, entryPath: ENTRY, published: { provider: 'vercel', url: 'https://a.vercel.app', siteRef: 'a' } });
    assert.strictEqual((await manifestOf(root)).metadata.remixedFrom, 'od:prototype:x');
  });
});

describe('share records', () => {
  const rec = (provider: ShareRecord['provider'], siteRef: string | undefined, url: string, publishedAt = '2026-10-01T00:00:00.000Z'): ShareRecord => ({
    provider,
    url,
    publishedAt,
    ...(siteRef ? { siteRef } : {}),
  });

  it('replaces the record for the same provider and siteRef only', () => {
    let metadata = upsertShareRecord({}, rec('netlify', 's1', 'https://one.netlify.app'));
    metadata = upsertShareRecord(metadata, rec('netlify', 's2', 'https://two.netlify.app'));
    metadata = upsertShareRecord(metadata, rec('netlify', 's1', 'https://one-new.netlify.app'));
    assert.deepStrictEqual(
      readShareRecords({ metadata }).map((r) => r.url),
      ['https://two.netlify.app', 'https://one-new.netlify.app'],
    );
  });

  it(`keeps at most ${MAX_SHARE_RECORDS} records, dropping the oldest`, () => {
    let metadata: Record<string, unknown> = {};
    for (let i = 0; i < MAX_SHARE_RECORDS + 3; i++) metadata = upsertShareRecord(metadata, rec('vercel', `p${i}`, `https://p${i}.vercel.app`));
    const shares = readShareRecords({ metadata });
    assert.strictEqual(shares.length, MAX_SHARE_RECORDS);
    assert.strictEqual(shares[0]!.siteRef, 'p3');
  });

  it('reports expired temporary records and lists live ones newest first', () => {
    const now = new Date('2026-10-03T12:00:00Z');
    const expired: ShareRecord = { ...rec('netlify-temporary', undefined, 'https://a.netlify.app'), expiresAt: '2026-10-03T11:00:00.000Z' };
    const live = rec('vercel', 'p', 'https://p.vercel.app');
    const newer = rec('netlify', 's', 'https://s.netlify.app');
    assert.ok(isExpired(expired, now));
    assert.deepStrictEqual(liveShareRecords([expired, live, newer], now), [newer, live]);
  });

  it('validates what the model reports', () => {
    assert.ok(!validatePublished({ provider: 'surge', url: 'https://x' }).ok);
    assert.ok(!validatePublished({ provider: 'netlify', url: 'https://x', expiresAt: 'soon' }).ok);
    assert.ok(!validatePublished({ provider: 'netlify', url: 'https://x', claimUrl: 'http://x' }).ok);
    assert.ok(validatePublished({ provider: 'github-pages', url: 'https://me.github.io/od-shares/pitch/', siteRef: 'me/od-shares/pitch' }).ok);
  });

  it('skips malformed stored records', () => {
    assert.deepStrictEqual(readShareRecords({ metadata: { shares: [{ provider: 'nope' }, 'x', null] } }), []);
    assert.deepStrictEqual(readShareRecords(null), []);
  });
});

describe('share naming', () => {
  it('derives a slug from the title, else the file name', () => {
    assert.strictEqual(slugForShare('Launch Pitch — Q4!', ENTRY), 'launch-pitch-q4');
    assert.strictEqual(slugForShare(undefined, '.open-design/x/My_Page.html'), 'my-page');
    assert.strictEqual(slugForShare('日本語', '.open-design/x/日本.html'), 'design');
  });

  it('suffixes site names with four hex digits', () => {
    assert.strictEqual(siteNameForShare('pitch', () => 0.5), 'od-pitch-8000');
  });
});
