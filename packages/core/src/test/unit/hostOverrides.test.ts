import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { ContentIndex } from '../../content/contentIndex';
import { composeInstructions } from '../../generation/composeInstructions';
import { HOST_OVERRIDES, hostOverrideFor, referencesDaemon } from '../../generation/hostOverrides';

const assetsRoot = path.resolve(__dirname, '..', '..', '..', '..', 'content', 'assets', 'open-design');

async function briefFor(index: ContentIndex, skillId: string): Promise<string> {
  const skill = await index.getSkill(skillId);
  assert.ok(skill, `missing skill ${skillId}`);
  return composeInstructions({
    skillName: skill.name,
    skillBody: skill.body,
    brief: 'test',
    suggestedEntryPath: '.open-design/test/test.html',
    hostOverride: hostOverrideFor(skill.id, skill.body),
  });
}

describe('hostOverrides', () => {
  const index = new ContentIndex(assetsRoot);

  it('detects the daemon-invocation forms upstream skills use', () => {
    assert.ok(referencesDaemon('run "$OD_NODE_BIN" "$OD_BIN" media wait'));
    assert.ok(referencesDaemon('Dispatch render through the OD daemon.'));
    assert.ok(referencesDaemon('call od media generate'));
    assert.ok(!referencesDaemon('A 1600×900 quote card with a gradient.'));
  });

  it('appends the HyperFrames CLI override, after the skill text, for the hyperframes template', async () => {
    const text = await briefFor(index, 'od:video:hyperframes');
    const skillAt = text.indexOf('## Active skill');
    const overrideAt = text.indexOf('## Host override — takes precedence over the skill text above');
    assert.ok(skillAt >= 0 && overrideAt > skillAt);
    assert.match(text, /npx hyperframes render <artifact-dir> --quality high --output <artifact-dir>\/exports\/.*\.mp4/);
    assert.match(text, /1920×1080 at 30 fps/);
    assert.match(text, /ffmpeg -version/);
    assert.ok(text.includes(HOST_OVERRIDES.hyperframes));
  });

  it('appends the daemon-unavailable notice for a daemon-backed skill with no override', async () => {
    const text = await briefFor(index, 'image-poster');
    assert.match(text, /## Host override/);
    assert.match(text, /That daemon doesn't exist in this host/);
  });

  it('adds nothing for a skill that never mentions the daemon', async () => {
    const text = await briefFor(index, 'od:prototype:card-twitter');
    assert.doesNotMatch(text, /## Host override/);
  });

  it('leaves the vendored hyperframes SKILL.md untouched (still carries the daemon step)', async () => {
    const raw = await fs.readFile(path.join(assetsRoot, 'design-templates', 'hyperframes', 'SKILL.md'), 'utf8');
    assert.ok(referencesDaemon(raw));
  });
});
