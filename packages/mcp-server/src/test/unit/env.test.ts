import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { workspaceRootFromClientRoots } from '../../env';

describe('workspaceRootFromClientRoots', () => {
  const project = path.resolve('/tmp/od-project');

  it('returns the first file:// root as a path', () => {
    const other = path.resolve('/tmp/od-other');
    assert.strictEqual(
      workspaceRootFromClientRoots([{ uri: pathToFileURL(project).href }, { uri: pathToFileURL(other).href }]),
      project,
    );
  });

  it('skips roots that are not file URIs', () => {
    assert.strictEqual(
      workspaceRootFromClientRoots([{ uri: 'vscode-remote://ssh/home/me' }, { uri: pathToFileURL(project).href }]),
      project,
    );
  });

  it('returns undefined when no root is usable', () => {
    assert.strictEqual(workspaceRootFromClientRoots([]), undefined);
    assert.strictEqual(workspaceRootFromClientRoots([{ uri: 'https://example.com' }]), undefined);
  });
});
