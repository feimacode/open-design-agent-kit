import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContentIndex, parseSkillId, toPublicSkillId } from '../../content/contentIndex';

async function makeFixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-ext-content-'));

  await fs.mkdir(path.join(root, 'skills', 'landing-page'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'skills', 'landing-page', 'SKILL.md'),
    [
      '---',
      'name: landing-page',
      'description: |',
      '  Build a single-page marketing landing page.',
      'triggers:',
      '  - "landing page"',
      '  - "marketing page"',
      'od:',
      '  category: web',
      '  mode: prototype',
      '---',
      '',
      '# landing-page',
      '',
      'Body content describing the workflow.',
    ].join('\n'),
  );

  await fs.mkdir(path.join(root, 'design-templates', 'growth-deck'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'design-templates', 'growth-deck', 'SKILL.md'),
    [
      '---',
      'name: growth-deck',
      'en_name: "Write a Brand-to-Revenue Story like a Growth Strategy Lead"',
      'description: |',
      '  Internal slug-y description.',
      'en_description: |',
      '  A marketing/GTM deck template.',
      'tags:',
      '  - "growth"',
      '  - "gtm"',
      'od:',
      '  mode: deck',
      '  default_for: deck',
      '  example_prompt: "Create a growth deck."',
      '---',
      '',
      '# growth-deck',
      '',
      'Template workflow body.',
    ].join('\n'),
  );

  // Example (remixable): SKILL.md + example.html + open-design.json, like
  // plugins/_official/examples/<id>/.
  await fs.mkdir(path.join(root, 'examples', 'holo-hero'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'examples', 'holo-hero', 'SKILL.md'),
    ['---', 'name: holo-hero', 'description: A holographic hero section.', 'od:', '  mode: prototype', '---', '', 'Body.'].join('\n'),
  );
  await fs.writeFile(path.join(root, 'examples', 'holo-hero', 'example.html'), '<!doctype html><h1>Holo</h1>');
  await fs.writeFile(
    path.join(root, 'examples', 'holo-hero', 'open-design.json'),
    JSON.stringify({ od: { useCase: { query: { en: 'Build a holographic hero section.' } } } }),
  );

  // Skill-only entry under examples/ with no example.html — must NOT be loaded.
  await fs.mkdir(path.join(root, 'examples', 'no-artifact'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'examples', 'no-artifact', 'SKILL.md'),
    ['---', 'name: no-artifact', 'description: Has no rendered example.', '---', '', 'Body.'].join('\n'),
  );

  // No od.mode at all — exercises the 'other' fallback bucket.
  await fs.mkdir(path.join(root, 'skills', 'no-mode-skill'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'skills', 'no-mode-skill', 'SKILL.md'),
    ['---', 'name: no-mode-skill', 'description: A skill with no od.mode set.', '---', '', 'Body.'].join('\n'),
  );

  // Legacy design system: DESIGN.md only, no manifest.json (upstream's
  // documented fallback shape) — exercises the heading/blockquote parser.
  await fs.mkdir(path.join(root, 'design-systems', 'starbucks'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'design-systems', 'starbucks', 'DESIGN.md'),
    [
      '# Design System Inspired by Starbucks',
      '',
      '> Category: E-Commerce & Retail',
      '> Warm green retail system.',
      '',
      '## 1. Visual Theme',
      '',
      'Details here.',
    ].join('\n'),
  );

  // Modern design system: DESIGN.md + manifest.json (the canonical shape).
  await fs.mkdir(path.join(root, 'design-systems', 'acme'), { recursive: true });
  await fs.writeFile(path.join(root, 'design-systems', 'acme', 'DESIGN.md'), '# Acme\n\nFull design prose here.');
  await fs.writeFile(
    path.join(root, 'design-systems', 'acme', 'manifest.json'),
    JSON.stringify({
      schemaVersion: 'od-design-system-project/v1',
      id: 'acme',
      name: 'Acme',
      category: 'Productivity & SaaS',
      description: 'A concise SaaS design system summary.',
      craft: { suggested: ['typography', 'color'] },
    }),
  );

  await fs.mkdir(path.join(root, 'craft'), { recursive: true });
  await fs.writeFile(path.join(root, 'craft', 'typography.md'), '# Typography\n\nUse a clear scale.');

  return root;
}

describe('ContentIndex', () => {
  it('lists and filters skills, merging skills and design-templates into one catalog', async () => {
    const index = new ContentIndex(await makeFixture());
    const all = await index.listSkills();
    assert.strictEqual(all.length, 4, 'landing-page, growth-deck, no-mode-skill, holo-hero (no-artifact excluded, no example.html)');

    const landingPage = all.find((s) => s.id === 'od:prototype:landing-page');
    assert.ok(landingPage, 'expected the public id to be namespaced as od:<mode>:<dirId>');
    assert.strictEqual(landingPage!.category, 'web');
    assert.strictEqual(landingPage!.mode, 'prototype');
    assert.strictEqual(landingPage!.source, 'skill');
    assert.strictEqual(landingPage!.featured, false);

    const filtered = await index.listSkills('landing page');
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 'od:prototype:landing-page');

    const none = await index.listSkills('nonexistent-xyz');
    assert.strictEqual(none.length, 0);
  });

  it('loads remixable examples with their exampleArtifactPath and open-design.json prompt, excluding skill-only entries with no example.html', async () => {
    const index = new ContentIndex(await makeFixture());
    const holo = await index.getSkill('holo-hero');
    assert.ok(holo);
    assert.strictEqual(holo!.source, 'example');
    assert.strictEqual(holo!.examplePrompt, 'Build a holographic hero section.');
    assert.strictEqual(holo!.exampleArtifactPath, 'examples/holo-hero/example.html');

    const noArtifact = await index.getSkill('no-artifact');
    assert.strictEqual(noArtifact, undefined, 'entries under examples/ without example.html must not be loaded');

    const list = await index.listSkills();
    const holoSummary = list.find((s) => s.source === 'example');
    assert.ok(holoSummary);
    assert.strictEqual(holoSummary!.exampleArtifactPath, 'examples/holo-hero/example.html');
  });

  it('gets a skill by its bare dirId or by its full namespaced public id', async () => {
    const index = new ContentIndex(await makeFixture());
    const byBareId = await index.getSkill('landing-page');
    assert.ok(byBareId);
    assert.match(byBareId!.body, /Body content/);

    const byPublicId = await index.getSkill('od:prototype:landing-page');
    assert.ok(byPublicId);
    assert.strictEqual(byPublicId!.body, byBareId!.body);
  });

  it('treats design-templates as skills, preferring en_name and reading od.mode/default_for/example_prompt', async () => {
    const index = new ContentIndex(await makeFixture());
    const template = await index.getSkill('growth-deck');
    assert.ok(template);
    assert.strictEqual(template!.source, 'design-template');
    assert.strictEqual(template!.mode, 'deck');
    assert.strictEqual(template!.name, 'Write a Brand-to-Revenue Story like a Growth Strategy Lead');
    assert.strictEqual(template!.featured, true);
    assert.strictEqual(template!.examplePrompt, 'Create a growth deck.');
    assert.ok(template!.triggers.includes('growth'));

    const list = await index.listSkills('growth strategy lead');
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].id, 'od:deck:growth-deck');
  });

  it('falls back to mode "other" when od.mode is absent or unrecognized', async () => {
    const index = new ContentIndex(await makeFixture());
    const noMode = await index.getSkill('no-mode-skill');
    assert.ok(noMode);
    assert.strictEqual(noMode!.mode, 'other');
  });

  it('filters listSkills by exact mode', async () => {
    const index = new ContentIndex(await makeFixture());
    const decks = await index.listSkills(undefined, 'deck');
    assert.strictEqual(decks.length, 1);
    assert.strictEqual(decks[0].id, 'od:deck:growth-deck');
  });

  it('listSkillModes returns the distinct modes present, sorted', async () => {
    const index = new ContentIndex(await makeFixture());
    const modes = await index.listSkillModes();
    assert.deepStrictEqual(modes, ['deck', 'other', 'prototype']);
  });

  it('toPublicSkillId/parseSkillId round-trip, and parseSkillId passes through a bare id unchanged', () => {
    const publicId = toPublicSkillId('deck', 'guizang-ppt');
    assert.strictEqual(publicId, 'od:deck:guizang-ppt');
    assert.strictEqual(parseSkillId(publicId), 'guizang-ppt');
    assert.strictEqual(parseSkillId('guizang-ppt'), 'guizang-ppt');
  });

  it('falls back to parsing DESIGN.md heading/blockquote when manifest.json is absent', async () => {
    const index = new ContentIndex(await makeFixture());
    const starbucks = await index.getDesignSystem('starbucks');
    assert.ok(starbucks);
    assert.match(starbucks!.name, /Starbucks/);
    assert.match(starbucks!.summary, /Warm green retail system/);
    assert.strictEqual(starbucks!.category, undefined);
    assert.deepStrictEqual(starbucks!.craftSuggested, []);
  });

  it('reads name/category/summary/craftSuggested from manifest.json when present', async () => {
    const index = new ContentIndex(await makeFixture());
    const acme = await index.getDesignSystem('acme');
    assert.ok(acme);
    assert.strictEqual(acme!.name, 'Acme');
    assert.strictEqual(acme!.category, 'Productivity & SaaS');
    assert.strictEqual(acme!.summary, 'A concise SaaS design system summary.');
    assert.deepStrictEqual(acme!.craftSuggested, ['typography', 'color']);
  });

  it('lists design systems sorted by category, filterable by exact category or free-text query', async () => {
    const index = new ContentIndex(await makeFixture());
    const all = await index.listDesignSystems();
    assert.strictEqual(all.length, 2);
    // Sorted by category ascending: 'E-Commerce & Retail' < 'Productivity & SaaS'
    assert.strictEqual(all[0].id, 'starbucks');
    assert.strictEqual(all[1].id, 'acme');

    const byCategory = await index.listDesignSystems(undefined, 'Productivity & SaaS');
    assert.strictEqual(byCategory.length, 1);
    assert.strictEqual(byCategory[0].id, 'acme');

    const byQueryOnCategory = await index.listDesignSystems('E-Commerce');
    assert.strictEqual(byQueryOnCategory.length, 1);
    assert.strictEqual(byQueryOnCategory[0].id, 'starbucks');
  });

  it('lists distinct sorted design system categories', async () => {
    const index = new ContentIndex(await makeFixture());
    const categories = await index.listDesignSystemCategories();
    assert.deepStrictEqual(categories, ['Productivity & SaaS']);
  });

  it('loads craft sections', async () => {
    const index = new ContentIndex(await makeFixture());
    const craft = await index.craftSections();
    assert.strictEqual(craft.length, 1);
    assert.strictEqual(craft[0].id, 'typography');
  });

  it('tags built-in design systems with source: "built-in" and gracefully has no user ones when no provider is given', async () => {
    const index = new ContentIndex(await makeFixture());
    const all = await index.listDesignSystems();
    assert.ok(all.length > 0);
    assert.ok(all.every((d) => d.source === 'built-in'));
  });

  it('merges in user-created design systems from a workspace-local directory, id-prefixed and tagged source: "user"', async () => {
    const assetsRoot = await makeFixture();
    const userDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-ext-user-ds-'));
    await fs.mkdir(path.join(userDir, 'acme-custom'), { recursive: true });
    await fs.writeFile(
      path.join(userDir, 'acme-custom', 'DESIGN.md'),
      ['# My Custom Brand', '', '> Category: Custom', '> A hand-written brand.', ''].join('\n'),
    );

    const index = new ContentIndex(assetsRoot, () => userDir);
    const all = await index.listDesignSystems();
    assert.strictEqual(all.length, 3, 'starbucks + acme (built-in) + acme-custom (user)');

    const custom = await index.getDesignSystem('user:acme-custom');
    assert.ok(custom);
    assert.strictEqual(custom!.source, 'user');
    assert.match(custom!.name, /My Custom Brand/);

    const starbucks = await index.getDesignSystem('starbucks');
    assert.strictEqual(starbucks!.source, 'built-in');
  });

  it('re-scans the user design-systems directory on every call rather than caching it', async () => {
    const assetsRoot = await makeFixture();
    const userDir = await fs.mkdtemp(path.join(os.tmpdir(), 'od-ext-user-ds-live-'));
    const index = new ContentIndex(assetsRoot, () => userDir);

    const before = await index.listDesignSystems();
    assert.strictEqual(before.filter((d) => d.source === 'user').length, 0);

    await fs.mkdir(path.join(userDir, 'new-brand'), { recursive: true });
    await fs.writeFile(path.join(userDir, 'new-brand', 'DESIGN.md'), '# New Brand\n\n> Category: X\n> Y.\n');

    const after = await index.listDesignSystems();
    assert.strictEqual(after.filter((d) => d.source === 'user').length, 1, 'a file written after construction should still appear, unlike the cached built-in pool');
  });
});
