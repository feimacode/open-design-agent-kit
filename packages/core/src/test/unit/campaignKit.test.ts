import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findBrowser } from '../../export/browserDiscovery';
import { exportArtifact } from '../../export/exportArtifact';
import { DEFAULT_SHEET_FORMAT_IDS, FORMAT_IDS, formatCatalogSummary, getFormat } from '../../poster/formats';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const ENTRY = '.open-design/campaign/master.html';
const CAMPAIGN_FORMATS = ['linkedin-image', 'og-image', 'x-header', 'linkedin-banner', 'email-header', 'banner-mrec', 'banner-leaderboard', 'banner-skyscraper', 'banner-mobile'];

/** A screen-sized fluid master: one headline and a call to action, laid out by aspect ratio. */
const master = (body = '<h1 data-od-field="headline">Ship reports on Monday</h1><p class="cta" data-od-field="cta">Try it free</p>', css = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0}
[data-od-card]{--od-w:1080px;--od-h:1350px;--od-bleed:0mm;width:calc(var(--od-w) + 2*var(--od-bleed));height:calc(var(--od-h) + 2*var(--od-bleed));
  container-type:size;position:relative;overflow:hidden;box-sizing:border-box;font-family:sans-serif;color:#fff;background:#1d2a24}
.od-safe{position:absolute;inset:max(4px,6cqmin);display:flex;flex-direction:column;justify-content:center;gap:3cqmin}
h1{margin:0;font-size:min(12cqw,22cqh);line-height:1}
.cta{margin:0;font-size:max(9px,4cqmin);font-weight:700}
@container (aspect-ratio > 3){.od-safe{flex-direction:row;align-items:center;justify-content:space-between}h1{font-size:min(5cqw,40cqh)}}
${css}
</style></head><body><div data-od-card data-od-fluid><div class="od-safe">${body}</div></div></body></html>`;

async function workspace(html: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-campaign-'));
  await fs.mkdir(path.join(root, '.open-design', 'campaign'), { recursive: true });
  await fs.writeFile(path.join(root, ENTRY), html);
  await writeArtifactManifest({ workspaceRoot: root, entryPath: ENTRY, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Launch', metadata: { format: 'ig-portrait', fluid: true } } });
  return root;
}

const pngSize = (buf: Buffer) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

describe('campaign channel formats', () => {
  it('adds the ad, web and social sizes with their budgets and scale', () => {
    const sizes = Object.fromEntries(CAMPAIGN_FORMATS.map((id) => [id, getFormat(id)]));
    assert.deepStrictEqual([sizes['linkedin-image']!.width, sizes['linkedin-image']!.height], [1200, 627]);
    assert.deepStrictEqual([sizes['og-image']!.width, sizes['og-image']!.height], [1200, 630]);
    assert.deepStrictEqual([sizes['email-header']!.width, sizes['email-header']!.height, sizes['email-header']!.scale], [600, 200, 2]);
    for (const id of ['banner-mrec', 'banner-leaderboard', 'banner-skyscraper', 'banner-mobile']) assert.strictEqual(sizes[id]!.maxBytes, 150_000, id);
    for (const id of CAMPAIGN_FORMATS) assert.ok(FORMAT_IDS.includes(id) && formatCatalogSummary().includes(id), id);
  });

  it('keeps headers, banners and ads out of a default shape sheet', () => {
    for (const id of ['x-header', 'linkedin-banner', 'email-header', 'banner-mrec', 'banner-leaderboard', 'banner-skyscraper', 'banner-mobile']) assert.ok(!DEFAULT_SHEET_FORMAT_IDS.includes(id), id);
    for (const id of ['linkedin-image', 'og-image', 'ig-portrait', 'a3']) assert.ok(DEFAULT_SHEET_FORMAT_IDS.includes(id), id);
  });
});

describe('campaign export (real browser; skipped when none is installed)', function () {
  this.timeout(180000);
  let browserPath: string | undefined;
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) this.skip();
    else browserPath = found.executablePath;
  });

  it('exports one fluid master to every campaign format, at 2× for the email header and within the ad budgets', async () => {
    const root = await workspace(master());
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, presets: CAMPAIGN_FORMATS });
    assert.ok(result.ok && !('output' in result) && !('inline' in result), JSON.stringify(result));
    assert.strictEqual(result.files.length, CAMPAIGN_FORMATS.length);
    for (const f of result.files) {
      const id = CAMPAIGN_FORMATS.find((c) => f.path.endsWith(`-${c}.png`) || f.path.endsWith(`-${c}.jpg`))!;
      const format = getFormat(id)!;
      const buf = await fs.readFile(path.join(root, f.path));
      if (f.format === 'png') assert.deepStrictEqual(pngSize(buf), { width: format.width * (format.scale ?? 1), height: format.height * (format.scale ?? 1) }, id);
      if (format.maxBytes) assert.ok(buf.length <= format.maxBytes, `${id}: ${buf.length} bytes`);
    }
  });

  const nowrap = 'h1{white-space:nowrap}';
  const rows = 'headline,cta\nShip it,Try it\nShip reports now,Try it\nShip reports every Monday morning to the whole leadership team,Try it\n';

  it('shrinks data-od-fit text per row until it fits, and leaves text that cannot fit at 70% to preflight', async () => {
    const root = await workspace(master('<h1 data-od-field="headline" data-od-fit>Ship it</h1><p class="cta" data-od-field="cta">Try it</p>', nowrap));
    await fs.writeFile(path.join(root, 'copy.csv'), rows);
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, data: 'copy.csv', checkOnly: true });
    assert.ok(result.ok && !('output' in result) && !('inline' in result), JSON.stringify(result));
    const fit = result.findings!.filter((f) => f.check === 'fit');
    assert.deepStrictEqual(fit.map((f) => f.row), [2], JSON.stringify(result.findings));
    const percent = Number(/at (\d+)%/.exec(fit[0].message)![1]);
    // The exact step depends on the machine's sans-serif font; what matters is that it shrank and now fits.
    assert.ok(percent >= 70 && percent < 100, String(percent));
    assert.ok(!result.findings!.some((f) => f.check === 'overflow' && f.row === 2), JSON.stringify(result.findings));
    assert.ok(result.findings!.some((f) => f.check === 'overflow' && f.row === 3), JSON.stringify(result.findings));
    assert.ok(!result.findings!.some((f) => f.row === 1 && (f.check === 'fit' || f.check === 'overflow')));
  });

  it('leaves text without data-od-fit alone', async () => {
    const root = await workspace(master('<h1 data-od-field="headline">Ship it</h1><p class="cta" data-od-field="cta">Try it</p>', nowrap));
    await fs.writeFile(path.join(root, 'copy.csv'), rows);
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, data: 'copy.csv', checkOnly: true });
    assert.ok(result.ok && !('output' in result) && !('inline' in result));
    assert.ok(!result.findings!.some((f) => f.check === 'fit'));
    assert.ok(result.findings!.some((f) => f.check === 'overflow' && f.row === 2));
  });

  it('writes a campaign sheet: every shape of the master plus the first screen of every other piece in its collection', async () => {
    const root = await workspace(master());
    const collection = { collectionId: 'launch', collectionName: 'Launch' };
    const manifestPath = path.join(root, `${ENTRY}.artifact.json`);
    const masterManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    await writeArtifactManifest({ workspaceRoot: root, entryPath: ENTRY, artifactManifest: { ...masterManifest, ...collection, screenRole: 'master' } });
    for (const [name, html] of [
      ['landing', '<!doctype html><body style="margin:0;font:18px sans-serif"><h1>Launch</h1><p>Landing page</p></body>'],
      ['email', '<!doctype html><body><table data-od-email role="presentation" width="100%" style="max-width:600px;margin:0 auto"><tr><td><div style="display:flex"><p>a</p><p>b</p></div></td></tr></table></body>'],
    ]) {
      const entry = `.open-design/campaign/${name}.html`;
      await fs.writeFile(path.join(root, entry), html);
      await writeArtifactManifest({ workspaceRoot: root, entryPath: entry, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: name === 'email' ? 'Launch email' : 'Landing page', ...collection, screenRole: name } });
    }
    const result = await exportArtifact({ workspaceRoot: root, entryPath: ENTRY, browserPath, settleMs: 0, presets: ['ig-portrait', 'og-image', 'banner-mrec'], campaignSheet: true, checkOnly: true });
    assert.ok(result.ok && !('output' in result) && !('inline' in result), JSON.stringify(result));
    assert.strictEqual(result.campaignSheet, '.open-design/campaign/exports/campaign-sheet.png');
    assert.deepStrictEqual(result.warnings.filter((w) => w.startsWith('Campaign sheet')), []);
    const sheet = await fs.readFile(path.join(root, result.campaignSheet!));
    assert.ok(pngSize(sheet).width > 600 && sheet.length > 10_000);
    assert.deepStrictEqual(result.files, [], 'checkOnly writes only the sheet');
  });
});
