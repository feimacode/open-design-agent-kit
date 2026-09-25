import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { CLI_REFERENCE_URL, DOCS_BASE_URL, TROUBLESHOOTING_URL, cliHelpEpilogue } from '../../docsLinks';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
const REPO_BLOB = 'https://github.com/feimacode/open-design-agent-kit/blob/main/';

describe('CLI documentation links', () => {
  it('help ends with the CLI reference and troubleshooting URLs', () => {
    assert.ok(cliHelpEpilogue().includes(CLI_REFERENCE_URL));
    assert.ok(cliHelpEpilogue().includes(TROUBLESHOOTING_URL));
  });

  for (const url of [CLI_REFERENCE_URL, TROUBLESHOOTING_URL]) {
    it(`${url} points at a file in docs/`, async () => {
      assert.ok(url.startsWith(DOCS_BASE_URL) && url.startsWith(REPO_BLOB));
      await fs.access(path.join(repoRoot, url.slice(REPO_BLOB.length)));
    });
  }
});
