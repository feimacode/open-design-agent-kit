import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { injectDeckStageFallback, shouldInjectDeckStageFallback } from '../../export/deck/deckStageFallback';
import { startStaticServer } from '../../export/staticServer';

const DECK = '<html><body><deck-stage width="1024" height="768"><section class="slide">1</section></deck-stage></body></html>';

describe('deck-stage fallback', () => {
  it('injects before </body> only for <deck-stage> decks with no runtime of their own', () => {
    const out = injectDeckStageFallback(DECK);
    assert.match(out, /<script data-od-deck-stage-fallback>[\s\S]*customElements\.define\('deck-stage'[\s\S]*<\/script><\/body>/);
    assert.strictEqual(injectDeckStageFallback(out), out, 'idempotent');
    assert.strictEqual(injectDeckStageFallback('<html><body><div class="slide"></div></body></html>'), '<html><body><div class="slide"></div></body></html>');
    const withRuntime = DECK.replace('<body>', '<head><script src="assets/deck-stage.js"></script></head><body>');
    assert.ok(!shouldInjectDeckStageFallback(withRuntime));
    assert.ok(injectDeckStageFallback('<deck-stage></deck-stage>').endsWith('</script>'), 'appends when there is no </body>');
  });

  it('is applied by the static server to the served entry only, leaving the file on disk unchanged', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-deckstage-'));
    await fs.mkdir(path.join(root, 'd'));
    await fs.writeFile(path.join(root, 'd', 'deck.html'), DECK);
    await fs.writeFile(path.join(root, 'd', 'other.html'), DECK);
    const server = await startStaticServer(root, { entryPath: 'd/deck.html', transformEntry: injectDeckStageFallback });
    try {
      const served = await (await fetch(`${server.baseUrl}d/deck.html`)).text();
      const other = await (await fetch(`${server.baseUrl}d/other.html`)).text();
      assert.match(served, /data-od-deck-stage-fallback/);
      assert.strictEqual(other, DECK);
    } finally {
      await server.close();
    }
    assert.strictEqual(await fs.readFile(path.join(root, 'd', 'deck.html'), 'utf8'), DECK);
  });
});
