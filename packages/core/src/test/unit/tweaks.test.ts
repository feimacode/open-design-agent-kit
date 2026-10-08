import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  discoverTweaks,
  formatTweaksForChat,
  readRootVariables,
  readTweakDeclarations,
  rewriteRootValues,
  variantEntryPath,
} from '../../generation/tweaks';

const ASSETS = path.resolve(__dirname, '../../../../content/assets/open-design');
const read = (rel: string) => fs.readFile(path.join(ASSETS, rel), 'utf8');

/** Lines that differ between two texts of the same line count. */
function changedLines(a: string, b: string): string[] {
  const al = a.split('\n');
  const bl = b.split('\n');
  assert.strictEqual(al.length, bl.length, 'line count unchanged');
  return bl.filter((line, i) => line !== al[i]);
}

describe('tweaks: knob discovery', () => {
  const landing = `<!doctype html><html><head><style>
:root {
  --bg: #fff;
  --fg: #111;
  --accent: #2f6fed;
  --radius-md: 8px;
  --fg-2: var(--fg);
  --brand-glow: rgba(47, 111, 237, 0.3);
  --hero-scale: 1.25;
  --grid: repeat(3, 1fr);
}
@media (prefers-color-scheme: dark) { :root { --bg: #000; } }
</style></head><body></body></html>`;

  it('types and labels contract tokens, and offers parseable others under More', () => {
    const { knobs, fewVariables } = discoverTweaks(landing);
    const by = new Map(knobs.map((k) => [k.name, k]));
    for (const name of ['--bg', '--fg', '--accent']) assert.strictEqual(by.get(name)?.type, 'color', name);
    assert.deepStrictEqual(
      { type: by.get('--radius-md')?.type, group: by.get('--radius-md')?.group, min: by.get('--radius-md')?.min, max: by.get('--radius-md')?.max, unit: by.get('--radius-md')?.unit },
      { type: 'length', group: 'Shape', min: 4, max: 16, unit: 'px' },
    );
    assert.strictEqual(by.get('--accent')?.label, 'Accent');
    assert.match(by.get('--accent')?.description ?? '', /Brand accent/);
    assert.strictEqual(by.get('--brand-glow')?.group, 'More');
    assert.strictEqual(by.get('--hero-scale')?.type, 'number');
    assert.ok(!by.has('--grid'), 'values of unknown type are not offered');
    assert.ok(by.get('--bg')?.overridden, 'the dark-mode override is flagged');
    assert.ok(!fewVariables);
  });

  it('edits a var() alias at the variable it references', () => {
    const fg2 = discoverTweaks(landing).knobs.find((k) => k.name === '--fg-2');
    assert.deepStrictEqual({ editAt: fg2?.editAt, resolved: fg2?.resolved, type: fg2?.type }, { editAt: '--fg', resolved: '#111', type: 'color' });
  });

  it('applies the od-tweaks block: labels, groups, ranges, options and extra variables', () => {
    const html = landing.replace(
      '</head>',
      `<script type="application/od-tweaks+json">{"knobs": [{"var": "--hero-scale", "label": "Hero size", "group": "Hero", "min": 1, "max": 2, "step": 0.05}, {"var": "--accent", "options": ["#2f6fed", "#e4572e"]}, {"bad": true}]}</script></head>`,
    );
    const by = new Map(discoverTweaks(html).knobs.map((k) => [k.name, k]));
    assert.deepStrictEqual(
      { label: by.get('--hero-scale')?.label, group: by.get('--hero-scale')?.group, min: by.get('--hero-scale')?.min, max: by.get('--hero-scale')?.max, source: by.get('--hero-scale')?.source },
      { label: 'Hero size', group: 'Hero', min: 1, max: 2, source: 'declared' },
    );
    assert.deepStrictEqual(by.get('--accent')?.options, ['#2f6fed', '#e4572e']);
    assert.match(readTweakDeclarations('<script type="application/od-tweaks+json">{nope</script>').error ?? '', /isn't valid JSON/);
  });

  it('says when a design has too few variables to tweak', () => {
    assert.ok(discoverTweaks('<style>:root { --gap: 4px; } body { color: #123; }</style>').fewVariables);
  });

  it('reads a real vendored design (waitlist page)', async () => {
    const { knobs } = discoverTweaks(await read('examples/waitlist-page/example.html'));
    const by = new Map(knobs.map((k) => [k.name, k]));
    assert.strictEqual(by.get('--accent')?.type, 'color');
    assert.strictEqual(by.get('--font-display')?.type, 'font');
    assert.ok(by.get('--font-display')?.options?.includes("'DM Sans', sans-serif"), 'font options include the design’s other faces');
    assert.strictEqual(by.get('--deco')?.group, 'More');
  });
});

describe('tweaks: in-place rewrite', () => {
  it('changes only the tweaked declarations of a real design, byte-for-byte elsewhere', async () => {
    const source = await read('examples/style-tile/example.html');
    const { text, changed, missing } = rewriteRootValues(source, { '--accent': '#e4572e', '--radius-md': '14px', '--nope': '1px' });
    assert.deepStrictEqual(changed.sort(), ['--accent', '--radius-md']);
    assert.deepStrictEqual(missing, ['--nope']);
    assert.deepStrictEqual(changedLines(source, text), ['  --accent: #e4572e;', '  --radius-md: 14px;']);
    assert.strictEqual(readRootVariables(text).values.get('--accent'), '#e4572e');
  });

  it("keeps spacing, !important and comments, and leaves media and other selectors' declarations alone", () => {
    const css = `:root{--a:1px!important;--b :  #fff ; /* keep */ --c: 2px}\n@media (max-width: 1px) { :root { --a: 9px; } }\n.x { --a: 3px; }`;
    const { text } = rewriteRootValues(css, { '--a': '5px', '--b': 'red', '--c': '4px' }, 'css');
    assert.strictEqual(text, `:root{--a:5px!important;--b :  red ; /* keep */ --c: 4px}\n@media (max-width: 1px) { :root { --a: 9px; } }\n.x { --a: 3px; }`);
  });

  it('rewrites a real design system tokens.css in place', async () => {
    const source = await read('design-systems/airbnb/tokens.css');
    const before = readRootVariables(source, 'css').values.get('--accent');
    assert.ok(before);
    const { text, changed } = rewriteRootValues(source, { '--accent': '#123456' }, 'css');
    assert.deepStrictEqual(changed, ['--accent']);
    const diff = changedLines(source, text);
    assert.strictEqual(diff.length, 1);
    assert.match(diff[0], /--accent:\s*#123456;/);
  });

  it('refuses values that would break out of the declaration', () => {
    const { text, changed } = rewriteRootValues('<style>:root { --a: 1px; }</style>', { '--a': '2px; } body { x: y' });
    assert.deepStrictEqual(changed, []);
    assert.strictEqual(text, '<style>:root { --a: 1px; }</style>');
  });
});

describe('tweaks: helpers', () => {
  it('names variants next to the original and phrases a chat request', () => {
    assert.strictEqual(variantEntryPath('.open-design/x/landing.html', 'Warm sand!'), '.open-design/x/landing-warm-sand.html');
    const chat = formatTweaksForChat('.open-design/x/landing.html', { '--accent': '#E4572E', '--text-base': '17px' });
    assert.match(chat, /"\.open-design\/x\/landing\.html"/);
    assert.match(chat, /`--accent`: `#E4572E`[\s\S]*`--text-base`: `17px`/);
  });
});

describe('tweaks: save as variant', () => {
  it('writes a tweaked sibling, registers both in one collection, and leaves the original unchanged', async () => {
    const os = await import('node:os');
    const { readArtifact, writeArtifactManifest } = await import('../../vendored/artifactCreate');
    const { saveTweakVariant } = await import('../../generation/tweaks');
    const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'od-tweak-variant-'));
    const entry = '.open-design/landing/landing.html';
    const source = '<!doctype html><html><head><style>:root { --accent: #2f6fed; }</style></head><body></body></html>';
    await fs.mkdir(path.join(ws, '.open-design/landing'), { recursive: true });
    await fs.writeFile(path.join(ws, entry), source);
    await writeArtifactManifest({ workspaceRoot: ws, entryPath: entry, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Landing', explorationId: 'e1', directionId: 'd1' } });

    const saved = await saveTweakVariant({ workspaceRoot: ws, entryPath: entry, outputDir: '.open-design', source, values: { '--accent': '#e4572e' }, label: 'Warm' });
    assert.deepStrictEqual(saved, { ok: true, entryPath: '.open-design/landing/landing-warm.html' });
    assert.strictEqual(await fs.readFile(path.join(ws, entry), 'utf8'), source, 'original file unchanged');
    assert.match(await fs.readFile(path.join(ws, saved.entryPath!), 'utf8'), /--accent: #e4572e;/);
    const original = (await readArtifact({ workspaceRoot: ws, entryPath: entry }))?.manifest;
    const variant = (await readArtifact({ workspaceRoot: ws, entryPath: saved.entryPath! }))?.manifest;
    assert.deepStrictEqual([original?.collectionId, original?.screenRole], ['landing-variants', 'master']);
    assert.deepStrictEqual([variant?.collectionId, variant?.screenRole, variant?.screenIndex, variant?.title, variant?.explorationId], ['landing-variants', 'variant', 1, 'Landing — Warm', undefined]);

    const again = await saveTweakVariant({ workspaceRoot: ws, entryPath: entry, outputDir: '.open-design', source, values: {}, label: 'warm' });
    assert.ok(!again.ok && /already exists/.test(again.error ?? ''));
    const second = await saveTweakVariant({ workspaceRoot: ws, entryPath: entry, outputDir: '.open-design', source, values: {}, label: 'Cool' });
    assert.strictEqual((await readArtifact({ workspaceRoot: ws, entryPath: second.entryPath! }))?.manifest?.screenIndex, 2);
  });
});
