import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readArtifactComments, writeArtifactComments, commentsSidecarPath, type ArtifactComment } from '../../workspace/artifactComments';

async function makeTempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'od-ext-comments-'));
}

const sampleComment: ArtifactComment = {
  id: 'c1',
  selector: '.hero h1',
  htmlHint: '<h1>Welcome</h1>',
  note: 'Make this bigger',
  status: 'open',
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
};

describe('artifactComments', () => {
  it('returns an empty array when no sidecar exists yet', async () => {
    const workspaceRoot = await makeTempWorkspace();
    const comments = await readArtifactComments(workspaceRoot, 'page.html');
    assert.deepStrictEqual(comments, []);
  });

  it('writes and reads back comments via the sidecar file', async () => {
    const workspaceRoot = await makeTempWorkspace();
    await writeArtifactComments(workspaceRoot, 'page.html', [sampleComment]);

    const sidecarExists = await fs
      .access(path.join(workspaceRoot, commentsSidecarPath('page.html')))
      .then(() => true)
      .catch(() => false);
    assert.strictEqual(sidecarExists, true);

    const comments = await readArtifactComments(workspaceRoot, 'page.html');
    assert.deepStrictEqual(comments, [sampleComment]);
  });

  it('returns an empty array for a malformed sidecar rather than throwing', async () => {
    const workspaceRoot = await makeTempWorkspace();
    await fs.writeFile(path.join(workspaceRoot, commentsSidecarPath('page.html')), 'not json');
    const comments = await readArtifactComments(workspaceRoot, 'page.html');
    assert.deepStrictEqual(comments, []);
  });

  it('rejects an entryPath that escapes the workspace', async () => {
    const workspaceRoot = await makeTempWorkspace();
    await assert.rejects(readArtifactComments(workspaceRoot, '../outside.html'));
    await assert.rejects(writeArtifactComments(workspaceRoot, '../outside.html', []));
  });
});
