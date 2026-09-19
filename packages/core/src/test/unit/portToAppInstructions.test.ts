import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { composePortToAppInstructions, suggestTargetComponentPath } from '../../generation/portToAppInstructions';

async function makeWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'od-ext-port-'));
}

describe('suggestTargetComponentPath', () => {
  it('returns undefined when no recognizable component directory exists', async () => {
    const root = await makeWorkspace();
    const suggestion = await suggestTargetComponentPath(root, 'Pricing Card');
    assert.strictEqual(suggestion, undefined);
  });

  it('suggests a PascalCase path under src/components when it exists, guessing the extension from existing files', async () => {
    const root = await makeWorkspace();
    await fs.mkdir(path.join(root, 'src', 'components'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'components', 'Button.tsx'), 'export default function Button() {}');
    await fs.writeFile(path.join(root, 'src', 'components', 'Card.tsx'), 'export default function Card() {}');

    const suggestion = await suggestTargetComponentPath(root, 'pricing card');
    assert.strictEqual(suggestion, 'src/components/PricingCard.tsx');
  });

  it('prefers src/components over app/components and components when multiple exist', async () => {
    const root = await makeWorkspace();
    await fs.mkdir(path.join(root, 'src', 'components'), { recursive: true });
    await fs.mkdir(path.join(root, 'components'), { recursive: true });
    await fs.writeFile(path.join(root, 'components', 'Widget.vue'), '<template></template>');

    const suggestion = await suggestTargetComponentPath(root, 'Hero');
    assert.match(suggestion!, /^src\/components\//, 'src/components should win even though it has no files to guess an extension from');
  });

  it('falls back to app/components when src/components does not exist', async () => {
    const root = await makeWorkspace();
    await fs.mkdir(path.join(root, 'app', 'components'), { recursive: true });
    await fs.writeFile(path.join(root, 'app', 'components', 'Nav.jsx'), 'export default function Nav() {}');

    const suggestion = await suggestTargetComponentPath(root, 'Footer');
    assert.strictEqual(suggestion, 'app/components/Footer.jsx');
  });
});

describe('composePortToAppInstructions', () => {
  const base = { artifactEntryPath: '.open-design/hero/hero.html', artifactContent: '<h1>Hello</h1>' };

  it('embeds the artifact content and entry path', () => {
    const result = composePortToAppInstructions(base);
    assert.match(result, /\.open-design\/hero\/hero\.html/);
    assert.match(result, /<h1>Hello<\/h1>/);
  });

  it('tells the model to use an explicit target path when given', () => {
    const result = composePortToAppInstructions({ ...base, targetComponentPath: 'src/components/Hero.tsx' });
    assert.match(result, /Write the new component at `src\/components\/Hero\.tsx`/);
  });

  it('tells the model to infer a target when none is suggested', () => {
    const result = composePortToAppInstructions(base);
    assert.match(result, /No target location could be suggested automatically/);
  });

  it('tells the model to read an explicit reference component when given', () => {
    const result = composePortToAppInstructions({ ...base, referenceComponentPath: 'src/components/Card.tsx' });
    assert.match(result, /Read `src\/components\/Card\.tsx` first/);
  });

  it('tells the model to search for a reference component when none is given', () => {
    const result = composePortToAppInstructions(base);
    assert.match(result, /find one or two existing components in this workspace/);
  });

  it('always instructs the model not to wire routing/navigation', () => {
    const result = composePortToAppInstructions(base);
    assert.match(result, /Do NOT wire the new component into routing/);
  });
});
