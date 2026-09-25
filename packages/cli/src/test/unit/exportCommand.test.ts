import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildRenderVideoArgs, ExportArgsError, parseExportFlags, resolveWorkspaceRoot } from '../../exportCommand';

describe('export command', () => {
  it('maps string flags onto export options', () => {
    assert.deepStrictEqual(
      parseExportFlags({ width: '1080', height: '1350', scale: '2', format: 'jpg', quality: '80', maxBytes: '5000000', selector: '[data-od-card]', browser: '/b' }),
      { width: 1080, height: 1350, scale: 2, format: 'jpeg', quality: 80, maxBytes: 5000000, selector: '[data-od-card]', browserPath: '/b', deck: undefined, slides: undefined },
    );
    assert.deepStrictEqual(parseExportFlags({}), {
      width: undefined,
      height: undefined,
      scale: undefined,
      format: undefined,
      quality: undefined,
      maxBytes: undefined,
      selector: undefined,
      browserPath: undefined,
      deck: undefined,
      slides: undefined,
    });
  });

  it('parses deck flags', () => {
    const parsed = parseExportFlags({ format: 'pptx', deck: true, slides: '1, 3' });
    assert.deepStrictEqual([parsed.format, parsed.deck, parsed.slides], ['pptx', true, [1, 3]]);
    assert.strictEqual(parseExportFlags({ format: 'PDF' }).format, 'pdf');
    assert.throws(() => parseExportFlags({ slides: '1,x' }), /--slides must be/);
  });

  it('rejects malformed flags', () => {
    assert.throws(() => parseExportFlags({ width: '10.5' }), ExportArgsError);
    assert.throws(() => parseExportFlags({ format: 'gif' }), /--format must be png, jpeg, pdf or pptx/);
    assert.throws(() => parseExportFlags({ scale: 'big' }), /--scale must be a number/);
  });

  it('resolves the workspace as the nearest ancestor containing .open-design/, else cwd, unless given explicitly', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-cli-ws-'));
    await fs.mkdir(path.join(root, '.open-design', 'post'), { recursive: true });
    const artifactDir = path.join(root, '.open-design', 'post');
    assert.strictEqual(await resolveWorkspaceRoot('post.html', undefined, artifactDir), root);
    assert.strictEqual(await resolveWorkspaceRoot('.open-design/post/post.html', undefined, root), root);
    assert.strictEqual(await resolveWorkspaceRoot('post.html', '../..', artifactDir), root);
    const elsewhere = await fs.mkdtemp(path.join(os.tmpdir(), 'od-cli-none-'));
    assert.strictEqual(await resolveWorkspaceRoot('x.html', undefined, elsewhere), elsewhere);
  });

  it('builds the HyperFrames render invocation', () => {
    assert.deepStrictEqual(buildRenderVideoArgs('.open-design/promo', '.open-design/promo/exports/promo.mp4', undefined), [
      '--yes',
      'hyperframes',
      'render',
      '.open-design/promo',
      '--quality',
      'high',
      '--output',
      '.open-design/promo/exports/promo.mp4',
    ]);
  });
});
