import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CheckArtifactOptions, CheckArtifactResult, Finding } from '@feimacode/open-design-agent-kit-core';
import { parseCheckFlags, runCheck, screenshotFileName } from '../../checkCommand';

function fakeCheck(findings: Finding[], seen: CheckArtifactOptions[] = []): (o: CheckArtifactOptions) => Promise<CheckArtifactResult> {
  return async (options) => {
    seen.push(options);
    return {
      ok: true,
      mode: 'page',
      findings,
      images: [
        { label: 'desktop', mime: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 1]), width: 1440, height: 900 },
        { label: 'mobile 2/3', mime: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 2]), width: 390, height: 844 },
      ],
      omitted: [],
      viewports: [{ name: 'desktop', width: 1440, height: 900 }],
      warnings: [],
      browserPath: '/fake/chrome',
    };
  };
}

const ERROR: Finding = { check: 'horizontal-scroll', severity: 'error', message: 'too wide', viewport: 'mobile' };
const WARNING: Finding = { check: 'contrast', severity: 'warning', message: 'low contrast' };

describe('check command', () => {
  let cwd: string;
  let log: typeof console.log;
  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'od-cli-check-'));
    await fs.mkdir(path.join(cwd, '.open-design'), { recursive: true });
    log = console.log;
    console.log = () => undefined;
  });
  afterEach(() => {
    console.log = log;
  });

  it('parses viewports, slides, max images and fail-on', () => {
    const { options, failOn } = parseCheckFlags({ viewport: ['tablet:768x1024', 'phone:360x740'], slides: '1, 3', maxImages: '2', failOn: 'warning', browser: '/b' });
    assert.deepStrictEqual(options.viewports, [
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'phone', width: 360, height: 740 },
    ]);
    assert.deepStrictEqual(options.slides, [1, 3]);
    assert.strictEqual(options.maxImages, 2);
    assert.strictEqual(options.browserPath, '/b');
    assert.strictEqual(failOn, 'warning');
  });

  it('rejects malformed flags', () => {
    assert.throws(() => parseCheckFlags({ viewport: ['768x1024'] }), /--viewport must look like/);
    assert.throws(() => parseCheckFlags({ slides: '0' }), /--slides/);
    assert.throws(() => parseCheckFlags({ failOn: 'info' }), /--fail-on/);
  });

  it('exits 1 with --fail-on error when an error is found', async () => {
    assert.strictEqual(await runCheck('page.html', { failOn: 'error' }, cwd, fakeCheck([ERROR, WARNING])), 1);
  });

  it('exits 0 on warnings alone, with or without --fail-on error', async () => {
    assert.strictEqual(await runCheck('page.html', {}, cwd, fakeCheck([WARNING])), 0);
    assert.strictEqual(await runCheck('page.html', { failOn: 'error' }, cwd, fakeCheck([WARNING])), 0);
    assert.strictEqual(await runCheck('page.html', { failOn: 'warning' }, cwd, fakeCheck([WARNING])), 1);
  });

  it('renders no images without --screenshots, and writes <label>.jpg files with it', async () => {
    const seen: CheckArtifactOptions[] = [];
    await runCheck('page.html', {}, cwd, fakeCheck([], seen));
    assert.strictEqual(seen[0].maxImages, 0);
    await runCheck('page.html', { screenshots: 'shots' }, cwd, fakeCheck([], seen));
    assert.strictEqual(seen[1].maxImages, undefined);
    assert.deepStrictEqual((await fs.readdir(path.join(cwd, 'shots'))).sort(), ['desktop.jpg', 'mobile-2-3.jpg']);
  });

  it('names screenshot files from their labels', () => {
    assert.strictEqual(screenshotFileName('slides 1–12'), 'slides-1-12.jpg');
    assert.strictEqual(screenshotFileName('Instagram portrait'), 'instagram-portrait.jpg');
  });
});
