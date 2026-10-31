import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  capKeepingHeadings,
  designMdFrontMatter,
  findProjectDesignMd,
  PRODUCT_CONTEXT_CAP,
  projectDesignMd,
  readProductContext,
  writeProjectDesignMd,
} from '../../workspace/projectContext';
import { composeInstructions } from '../../generation/composeInstructions';

const DS = {
  name: 'Harbor',
  summary: 'Calm coastal palette for a café.',
  body: '# Design System Inspired by Harbor\n\n## 1. Visual Theme & Atmosphere\n\nCalm.\n',
  tokensCss: `:root {
  --bg: #fbfaf7; --surface: #ffffff; --fg: #1d2a33; --accent: #1f6f8b; --accent-on: #ffffff;
  --accent-hover: color-mix(in oklab, var(--accent), black 8%);
  --font-display: "Fraunces", Georgia, serif; --font-body: Inter, system-ui, sans-serif;
  --text-base: 16px; --text-2xl: 32px; --text-4xl: 64px; --leading-body: 1.6; --leading-tight: 1.05;
  --radius-sm: 6px; --radius-md: 10px; --space-2: 8px; --space-4: 16px;
}`,
};

async function tempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'od-project-context-'));
}

describe('project context files (add-impeccable-interop)', () => {
  it('reads a short PRODUCT.md as-is and nothing when absent', async () => {
    const root = await tempWorkspace();
    assert.strictEqual(await readProductContext(root), undefined);
    await fs.writeFile(path.join(root, 'PRODUCT.md'), '## Users\n\nCafé regulars.\n');
    const ctx = await readProductContext(root);
    assert.deepStrictEqual(ctx, { path: 'PRODUCT.md', text: '## Users\n\nCafé regulars.' });
  });

  it('falls back to .agents/context/ and docs/, root first', async () => {
    const root = await tempWorkspace();
    await fs.mkdir(path.join(root, 'docs'), { recursive: true });
    await fs.writeFile(path.join(root, 'docs', 'DESIGN.md'), '# docs');
    assert.strictEqual(await findProjectDesignMd(root), 'docs/DESIGN.md');
    await fs.writeFile(path.join(root, 'DESIGN.md'), '# root');
    assert.strictEqual(await findProjectDesignMd(root), 'DESIGN.md');
  });

  it('caps a long PRODUCT.md and keeps every heading', () => {
    const long = ['## Users', 'x'.repeat(3000), '## Product Purpose', 'y'.repeat(3000), '## Accessibility & Inclusion', 'z'.repeat(100)].join('\n');
    const capped = capKeepingHeadings(long);
    assert.ok(capped.length <= PRODUCT_CONTEXT_CAP);
    for (const h of ['## Users', '## Product Purpose', '## Accessibility & Inclusion']) assert.ok(capped.includes(h), h);
  });

  it('builds front matter from resolved tokens, skipping non-plain colours', () => {
    const fm = designMdFrontMatter(DS);
    assert.ok(fm.startsWith('---\nname: "Harbor"\ndescription: "Calm coastal palette for a café."'));
    assert.ok(fm.includes('colors:\n  primary: "#1f6f8b"'));
    assert.ok(fm.includes('  background: "#fbfaf7"'));
    assert.ok(fm.includes('typography:\n  display:\n    fontFamily: "Fraunces"\n    fontSize: "64px"'));
    assert.ok(fm.includes('  body:\n    fontFamily: "Inter"\n    fontSize: "16px"\n    lineHeight: "1.6"'));
    assert.ok(fm.includes('rounded:\n  sm: "6px"\n  md: "10px"'));
    assert.ok(/spacing:\n( {2}\w+: "[^"]+"\n)* {2}sm: "8px"\n {2}md: "16px"/.test(fm));
    assert.ok(!fm.includes('color-mix'));
    assert.ok(fm.endsWith('\n---'));
  });

  it('keeps a body that already has front matter', () => {
    const body = '---\nname: Mine\n---\n\n# Mine\n';
    assert.strictEqual(projectDesignMd({ ...DS, body }), body);
  });

  it('writes DESIGN.md once and never overwrites', async () => {
    const root = await tempWorkspace();
    assert.deepStrictEqual(await writeProjectDesignMd(root, DS), { outcome: 'written', path: 'DESIGN.md' });
    const first = await fs.readFile(path.join(root, 'DESIGN.md'), 'utf8');
    assert.ok(first.includes('# Design System Inspired by Harbor'));
    assert.deepStrictEqual(await writeProjectDesignMd(root, { ...DS, name: 'Other' }), { outcome: 'kept-existing', path: 'DESIGN.md' });
    assert.strictEqual(await fs.readFile(path.join(root, 'DESIGN.md'), 'utf8'), first);
  });

  it('keeps a DESIGN.md that lives in docs/', async () => {
    const root = await tempWorkspace();
    await fs.mkdir(path.join(root, 'docs'));
    await fs.writeFile(path.join(root, 'docs', 'DESIGN.md'), '# theirs');
    assert.deepStrictEqual(await writeProjectDesignMd(root, DS), { outcome: 'kept-existing', path: 'docs/DESIGN.md' });
    await assert.rejects(fs.access(path.join(root, 'DESIGN.md')));
  });

  it('adds the product context and DESIGN.md notice to a brief', () => {
    const base = { skillName: 's', skillBody: 'b', brief: 'a poster', suggestedEntryPath: '.open-design/p/p.html' };
    const text = composeInstructions({ ...base, productContext: { path: 'PRODUCT.md', text: '## Users\n\nCafé regulars.' }, projectDesignMdPath: 'DESIGN.md' });
    assert.ok(text.includes('## Product context'));
    assert.ok(text.includes('Café regulars.'));
    assert.ok(text.includes('## Project DESIGN.md found'));
    const withDs = composeInstructions({ ...base, designSystemTitle: 'X', designSystemBody: '# X', projectDesignMdPath: 'DESIGN.md' });
    assert.ok(!withDs.includes('## Project DESIGN.md found'));
    assert.ok(!composeInstructions(base).includes('## Product context'));
  });
});
