import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// openspec add-integrations-list: the integrations list command ships on every host.
test('open-design-integrations is generated for every host', async () => {
  const files = [
    'packages/claude-plugin/skills/open-design-integrations/SKILL.md',
    '.agents/skills/open-design-integrations/SKILL.md',
    'packages/cli/assets/claude-skills/open-design-integrations/SKILL.md',
    'packages/cli/assets/codex-skills/open-design-integrations/SKILL.md',
    'packages/vscode/prompts/local/open-design-integrations.prompt.md',
  ];
  for (const f of files) {
    const text = await fs.readFile(path.join(root, f), 'utf8');
    assert.match(text, /list_open_design_integrations/, f);
    assert.match(text, /Don't install anything from the list itself/, f);
  }
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'packages/vscode/package.json'), 'utf8'));
  assert.ok(pkg.contributes.chatPromptFiles.some((p) => p.path.endsWith('open-design-integrations.prompt.md')));
});
