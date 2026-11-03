import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { compareBeforeAfter, copyEditsOf, formatBeforeAfterResult, pairFindings, validateSummary, type PairedFinding } from '../../export/beforeAfter';
import { findBrowser } from '../../export/browserDiscovery';
import type { AuditFinding, AuditGroup } from '../../export/siteAudit';
import { prepareBaseScreen } from '../../generation/baseScreen';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const SITE = 'https://www.rosa.example/';

const group = (over: Partial<AuditGroup>): AuditGroup => ({
  id: 'F1',
  check: 'contrast',
  page: SITE,
  region: 'main',
  viewport: 'desktop',
  severity: 'warning',
  count: 1,
  score: 1,
  title: 'Text that is hard to read',
  cost: '',
  fix: 'Darken it.',
  detail: '',
  examples: [],
  ...over,
});

const auditFinding = (over: Partial<AuditFinding>): AuditFinding => ({
  check: 'contrast',
  severity: 'warning',
  message: 'a.cta "Book a table" has a contrast ratio of 1.43:1 against its background (needs 4.5:1 for body text).',
  selector: 'a.cta "Book a table"',
  page: SITE,
  viewport: 'desktop',
  region: 'main',
  aboveFold: true,
  ...over,
});

const paired = (id: string, status: PairedFinding['status']): PairedFinding => ({ id, title: 't', check: 'contrast', viewport: 'desktop', region: 'main', status, before: '', after: '', fix: '' });

describe('before/after: evidence', () => {
  it('keeps summary lines that cite fixed findings and rejects the rest, saying why', () => {
    const findings = [paired('F1', 'fixed'), paired('F2', 'open'), paired('F3', 'not-rechecked')];
    const { lines, rejected } = validateSummary(
      [
        { text: 'The booking button is readable now.', cites: ['F1'] },
        { text: 'Loads twice as fast', cites: [] },
        { text: 'Phones work great', cites: ['F2'] },
        { text: 'Lighter page', cites: ['F3'] },
        { text: 'Better SEO', cites: ['F9'] },
      ],
      findings,
    );
    assert.deepStrictEqual(lines, [{ text: 'The booking button is readable now.', cites: ['F1'] }]);
    assert.deepStrictEqual(
      rejected.map((r) => [r.text, r.reason.split(':')[0].split(',')[0]]),
      [
        ['Loads twice as fast', 'it cites no finding'],
        ['Phones work great', 'it cites F2'],
        ['Lighter page', 'it cites F3'],
        ['Better SEO', 'it cites F9'],
      ],
    );
    assert.match(rejected[1].reason, /not fixed \(open\)/);
    assert.ok(validateSummary('nice', findings).error);
  });

  it('marks a finding fixed only when the same check passes at the same size, with before and after values', () => {
    const groups = [
      group({ id: 'F1' }),
      group({ id: 'F2', check: 'tap-target', viewport: 'phone', region: 'header', count: 2, title: 'Buttons too small' }),
      group({ id: 'F3', check: 'page-weight', viewport: 'phone', region: 'page', detail: 'The phone load downloads 3.1 MB (budget 2 MB).' }),
      group({ id: 'F4', check: 'horizontal-scroll', viewport: 'phone', region: 'page' }),
    ];
    const audit = [
      auditFinding({}),
      auditFinding({ check: 'tap-target', viewport: 'phone', region: 'header', selector: 'a.ico "f"', message: 'a.ico "f" is 16×16' }),
      auditFinding({ check: 'tap-target', viewport: 'phone', region: 'header', selector: 'a.ico "i"', message: 'a.ico "i" is 16×16' }),
      auditFinding({ check: 'horizontal-scroll', viewport: 'phone', region: 'page', selector: undefined, message: 'scrolls' }),
    ];
    const design = {
      findings: [
        { check: 'tap-target', severity: 'warning' as const, message: 'a.ico "f" is 16×16', viewport: 'phone', region: 'header' },
        { check: 'contrast', severity: 'warning' as const, message: 'p "x" has a contrast ratio of 3:1', viewport: 'phone', region: 'footer' },
      ],
      contrast: new Map([['desktop|Book a table', 6.84]]),
    };
    const out = pairFindings(groups, audit, design);
    assert.deepStrictEqual(
      out.map((f) => [f.id, f.status, f.before, f.after]),
      [
        ['F1', 'fixed', '"Book a table" 1.43:1', '"Book a table" 6.84:1'],
        ['F2', 'open', '2 found', '1 still found'],
        ['F3', 'not-rechecked', 'downloads 3.1 MB (budget 2 MB).', "not re-checked: the design isn't served the way the live site is, so its download can't be compared"],
        ['F4', 'fixed', '1 found', 'none found'],
      ],
    );
  });

  it('lists copy edits with their originals', () => {
    assert.deepStrictEqual(copyEditsOf('<p data-od-copy-edit data-od-original="We have made pasta by hand since 1962">Handmade since 1962</p><h2 data-od-copy-edit>Menu</h2>'), [
      { original: 'We have made pasta by hand since 1962', text: 'Handmade since 1962' },
      { original: '', text: 'Menu' },
    ]);
  });
});

const png = (w: number, h: number, rgb: [number, number, number]): Buffer => {
  const img = new PNG({ width: w, height: h });
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = rgb[0];
    img.data[i + 1] = rgb[1];
    img.data[i + 2] = rgb[2];
    img.data[i + 3] = 255;
  }
  return PNG.sync.write(img);
};

const DESIGN = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Rosa's</title>
<style>body{margin:0;font-family:Georgia,serif;background:#f4f1ec;color:#222}header{display:flex;justify-content:space-between;padding:12px 16px;background:#fff}.ico{display:inline-block;width:16px;height:16px;font-size:10px}.cta{display:inline-block;padding:14px 22px;background:#9a4a1c;color:#fff;text-decoration:none}</style></head>
<body data-od-redesign="${SITE}"><aside data-od-concept role="note">Concept by me, not affiliated with Rosa's Trattoria</aside>
<header><strong>Rosa's</strong><nav><a class="ico" href="#fb">f</a><a class="ico" href="#ig">i</a></nav></header>
<main style="padding:24px 16px"><h1>Pasta made fresh every morning</h1><p data-od-copy-edit data-od-original="Open Tuesday to Sunday, 12:00 to 22:00">Tue–Sun, 12–22</p><a class="cta" href="tel:0511234567">Book a table</a></main></body></html>`;

describe('before/after page in a browser', function () {
  this.timeout(120_000);
  let executablePath: string;

  before(async function () {
    const found = await findBrowser({});
    if (!found.ok) this.skip();
    executablePath = found.executablePath;
  });

  async function workspace(): Promise<{ root: string; entry: string }> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-before-after-'));
    const extract = '.open-design/.extract/rosa-example';
    const audits = '.open-design/.audits/rosa-example';
    await fs.mkdir(path.join(root, extract), { recursive: true });
    await fs.mkdir(path.join(root, audits), { recursive: true });
    await fs.writeFile(path.join(root, extract, 'desktop.png'), png(144, 90, [200, 190, 180]));
    await fs.writeFile(path.join(root, extract, 'mobile.png'), png(39, 84, [200, 190, 180]));
    await fs.writeFile(path.join(root, extract, 'evidence.json'), JSON.stringify({ pageShots: [{ url: SITE, desktop: `${extract}/desktop.png`, mobile: `${extract}/mobile.png` }] }));
    for (const f of ['desktop.png', 'phone.png', 'desktop-full.png', 'phone-full.png']) await fs.writeFile(path.join(root, audits, f), png(40, 40, [210, 200, 190]));
    await fs.writeFile(
      path.join(root, audits, 'audit.json'),
      JSON.stringify({
        url: SITE,
        pageShots: [{ page: SITE, desktop: `${audits}/desktop.png`, phone: `${audits}/phone.png`, desktopFull: `${audits}/desktop-full.png`, phoneFull: `${audits}/phone-full.png` }],
        groups: [
          group({ id: 'F1' }),
          group({ id: 'F2', check: 'tap-target', viewport: 'phone', region: 'header', count: 2, title: 'Buttons and links too small to tap' }),
          group({ id: 'F3', check: 'missing-viewport', viewport: 'phone', region: 'page', severity: 'error', title: 'Phones get the desktop page, shrunk' }),
        ],
        findings: [
          auditFinding({}),
          auditFinding({ check: 'tap-target', viewport: 'phone', region: 'header', selector: 'a.ico "f"', message: 'a.ico "f" is too small' }),
          auditFinding({ check: 'missing-viewport', viewport: 'phone', region: 'page', selector: undefined, message: 'no viewport' }),
        ],
      }),
    );
    const entry = '.open-design/rosa/home.html';
    await fs.mkdir(path.join(root, '.open-design/rosa'), { recursive: true });
    await fs.writeFile(path.join(root, entry), DESIGN);
    await writeArtifactManifest({ workspaceRoot: root, entryPath: entry, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: "Rosa's: home" } });
    return { root, entry };
  }

  it('says how to store a base screen when there is none', async () => {
    const { root, entry } = await workspace();
    const result = await compareBeforeAfter({ workspaceRoot: root, outputDir: '.open-design', entryPath: entry, executablePath });
    assert.strictEqual(result.status, 'no-base');
    assert.match(formatBeforeAfterResult(result), /baseScreen/);
  });

  it('re-checks the audit findings on the design, lists copy edits and keeps only cited summary lines', async () => {
    const { root, entry } = await workspace();
    const base = await prepareBaseScreen({ workspaceRoot: root, outputDir: '.open-design', entryPath: entry, baseScreen: '.open-design/.extract/rosa-example/desktop.png' });
    assert.ok(base.ok);
    const result = await compareBeforeAfter({
      workspaceRoot: root,
      outputDir: '.open-design',
      entryPath: entry,
      executablePath,
      summary: [
        { text: 'The booking button is readable now.', cites: ['F1'] },
        { text: 'Easier to tap on a phone.', cites: ['F2'] },
      ],
    });
    assert.ok(result.status === 'ok', JSON.stringify(result));
    const [page] = result.pages;
    assert.strictEqual(page.oldUrl, SITE);
    const status = Object.fromEntries(page.findings.map((f) => [f.id, f.status]));
    assert.deepStrictEqual(status, { F1: 'fixed', F2: 'open', F3: 'fixed' });
    const f1 = page.findings.find((f) => f.id === 'F1')!;
    assert.match(f1.after, /^"Book a table" \d+(\.\d+)?:1$/);
    assert.ok(Number(/([\d.]+):1/.exec(f1.after)![1]) >= 4.5, f1.after);
    assert.deepStrictEqual(page.copyEdits, [{ original: 'Open Tuesday to Sunday, 12:00 to 22:00', text: 'Tue–Sun, 12–22' }]);
    assert.deepStrictEqual(result.summary.map((l) => l.cites), [['F1']]);
    assert.match(result.rejectedSummary[0].reason, /F2/);
    assert.strictEqual(result.page, '.open-design/rosa/home.before-after.html');
    const html = await fs.readFile(path.join(root, result.page), 'utf8');
    assert.match(html, /type="range"/);
    assert.match(html, /data:image\/png;base64,/);
    assert.match(html, /data:image\/jpeg;base64,/);
    assert.match(html, /<aside data-od-concept/);
    assert.match(html, /Open Tuesday to Sunday, 12:00 to 22:00/);
    assert.match(html, /<span class="st open">Still open<\/span>/);
    assert.match(html, /1 of 3|2 of 3/);
    const manifest = JSON.parse(await fs.readFile(path.join(root, `${result.page}.artifact.json`), 'utf8'));
    assert.deepStrictEqual(manifest.metadata.beforeAfter.open, ['F2']);
  });
});
