import * as assert from 'node:assert';
import { exportsForKind } from '../../export/exportFormats';
import { validateArtifactManifestInput } from '../../vendored/artifactManifest';

describe('exportsForKind', () => {
  it('lists only what this project can produce, per kind', () => {
    assert.deepStrictEqual(exportsForKind('deck'), ['html', 'png', 'jpeg', 'pdf', 'pptx']);
    assert.deepStrictEqual(exportsForKind('html'), ['html', 'png', 'jpeg', 'pdf']);
    assert.deepStrictEqual(exportsForKind('markdown-document'), ['md']);
    assert.strictEqual(exportsForKind('nope'), undefined);
    for (const kind of ['html', 'deck', 'svg', 'react-component']) assert.ok(!exportsForKind(kind)!.includes('zip'));
  });

  it('returns a copy callers can mutate safely', () => {
    exportsForKind('deck')!.push('x');
    assert.ok(!exportsForKind('deck')!.includes('x'));
  });

  it('every listed format passes the manifest validator, and legacy zip manifests still validate', () => {
    for (const kind of ['html', 'deck', 'svg', 'markdown-document', 'react-component', 'code-snippet', 'design-system', 'mini-app', 'diagram']) {
      const result = validateArtifactManifestInput({ kind, renderer: 'html', exports: exportsForKind(kind), title: 't' }, 'a.html');
      assert.ok(result.ok, `${kind}: ${!result.ok ? result.error : ''}`);
    }
    assert.ok(validateArtifactManifestInput({ kind: 'html', renderer: 'html', exports: ['html', 'zip'], title: 't' }, 'a.html').ok);
  });
});
