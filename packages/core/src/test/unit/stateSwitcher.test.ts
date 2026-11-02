// The preview's states switcher (openspec add-states-board), run in real Chromium: bundled with esbuild and
// exposed as a global. Skipped when no browser is installed.
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as esbuild from 'esbuild';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { findBrowser } from '../../export/browserDiscovery';

const SRC = path.join(__dirname, '..', '..', '..', 'src');

const FIXTURE = `<!doctype html><html><head><style>[data-od-state][hidden]{display:none}</style></head><body><main>
  <section data-od-state="default"><p>Rows</p></section>
  <section data-od-state="empty" hidden><p>No rows yet</p></section>
  <section data-od-state="loading" hidden><p>Loading</p></section>
</main></body></html>`;

let browser: Browser | undefined;
let page: Page;

const visible = (): Promise<string[]> =>
  page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-od-state]')).filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.dataset.odState!));

describe('preview states switcher (real browser; skipped when none is installed)', () => {
  before(async function () {
    const found = await findBrowser();
    if (!found.ok) this.skip();
    const bundle = await esbuild.build({
      stdin: { contents: `export * from './preview/stateSwitcher'; export { serializeDocument } from './preview/dom/sourcePatches';`, resolveDir: SRC, loader: 'ts' },
      bundle: true,
      write: false,
      format: 'iife',
      globalName: 'od',
      platform: 'browser',
    });
    browser = await puppeteer.launch({ executablePath: found.executablePath, headless: true, args: ['--no-sandbox'] });
    page = await browser.newPage();
    await page.setContent(FIXTURE);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
  });

  after(async () => {
    await browser?.close();
  });

  it('adds one button per state plus All states, and switches between them', async () => {
    await page.evaluate(() => ((window as any).restore = (window as any).od.installStateSwitcher(document)));
    const labels = await page.$$eval('#od-state-switcher button', (bs) => bs.map((b) => b.textContent));
    assert.deepStrictEqual(labels, ['default', 'empty', 'loading', 'All states']);
    await page.click('#od-state-switcher button[data-state="empty"]');
    assert.deepStrictEqual(await visible(), ['empty']);
    await page.click('#od-state-switcher button[data-state="all"]');
    assert.deepStrictEqual(await visible(), ['default', 'empty', 'loading']);
  });

  it('puts the frames back and leaves itself out of a saved page', async () => {
    await page.evaluate(() => (window as any).restore());
    assert.deepStrictEqual(await visible(), ['default']);
    const saved = await page.evaluate(() => {
      const html = (window as any).od.serializeDocument(document) as string;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return { switcher: doc.querySelectorAll('#od-state-switcher, [data-od-preview-only]').length, board: doc.documentElement.hasAttribute('data-od-states-board'), hidden: doc.querySelectorAll('[data-od-state][hidden]').length };
    });
    assert.deepStrictEqual(saved, { switcher: 0, board: false, hidden: 2 });
  });

  it('does nothing on a page with one state', async () => {
    const single = await browser!.newPage();
    await single.setContent('<main><section data-od-state="default">Only</section></main>');
    await single.addScriptTag({ content: (await esbuild.build({ stdin: { contents: `export * from './preview/stateSwitcher';`, resolveDir: SRC, loader: 'ts' }, bundle: true, write: false, format: 'iife', globalName: 'od', platform: 'browser' })).outputFiles[0].text });
    assert.strictEqual(await single.evaluate(() => (window as any).od.installStateSwitcher(document)), undefined);
    await single.close();
  });
});
