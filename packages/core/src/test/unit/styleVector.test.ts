import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContentIndex } from '../../content/contentIndex';
import { resolveLike, withNearestDesignSystems } from '../../content/nearestDesignSystem';
import { FEATURES, STYLE_VECTOR_VERSION, featureCount, styleVector, vectorDistance, vectorScale } from '../../content/styleVector';
import type { ExtractSiteResult } from '../../generation/siteExtraction';

const ASSETS = path.resolve(__dirname, '../../../../content/assets/open-design');

describe('style vector (add-nearest-design-system)', () => {
  const index = new ContentIndex(ASSETS);

  it('has about twenty features and leaves missing tokens null', () => {
    assert.ok(FEATURES.length >= 18 && FEATURES.length <= 24, String(FEATURES.length));
    const v = styleVector({ '--bg': '#ffffff', '--fg': '#111111' });
    assert.strictEqual(v.version, STYLE_VECTOR_VERSION);
    assert.strictEqual(v.raw.length, FEATURES.length);
    assert.ok(featureCount(v) < 8, `${featureCount(v)} features from two tokens`);
    assert.ok(v.raw.some((x) => x === null));
  });

  it('refuses to compare a vector of another version', () => {
    const v = styleVector({ '--bg': '#ffffff', '--fg': '#111111', '--accent': '#0b5fff' });
    const scale = vectorScale([v]);
    assert.throws(() => vectorDistance({ ...v, version: STYLE_VECTOR_VERSION + 1 }, v, scale), /version/);
  });

  it('ranks known pairs as expected: stripe is nearest itself, with vercel close by', async () => {
    const stripe = (await index.designSystemTokens('stripe'))!;
    const near = await index.nearestDesignSystems(stripe, 5);
    assert.ok(near.nearest, near.note);
    const ids = near.nearest!.map((n) => n.id);
    assert.ok(ids.includes('stripe'), `stripe is nearest to itself: ${ids}`);
    assert.strictEqual(near.nearest![0].distance, 0);
    assert.ok(ids.includes('vercel'), `vercel among stripe's nearest: ${ids}`);
    for (const n of near.nearest!) assert.ok(n.compared >= 8);
  });

  it('a thin draft gets a note and no nearest', async () => {
    const result = { status: 'ok', notes: [], draft: { tokens: { '--bg': '#ffffff', '--accent': '#e11d48' } } } as unknown as ExtractSiteResult;
    const out = (await withNearestDesignSystems(result, index)) as Extract<ExtractSiteResult, { slug: string }>;
    assert.strictEqual(out.nearest, undefined);
    assert.ok(out.notes.some((n: string) => /too little to compare/.test(n)), JSON.stringify(out.notes));
  });

  it('recommend with like leaves the named system out and ranks close ones first', async () => {
    const tokens = (await index.designSystemTokens('stripe'))!;
    const r = await index.recommendDesignSystems({ likeBrands: ['Stripe'] }, 5, { tokens, id: 'stripe' });
    const ids = r.recommendations.map((x) => x.id);
    assert.ok(!ids.includes('stripe'), String(ids));
    assert.ok(r.recommendations.some((x) => x.likeness), JSON.stringify(r.recommendations));
  });

  it('like resolves a system id or an extraction bundle, and refuses anything else', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-like-'));
    const bundle = path.join(root, '.open-design', '.extract', 'acme');
    await fs.mkdir(bundle, { recursive: true });
    await fs.writeFile(path.join(bundle, 'evidence.json'), JSON.stringify({ draft: { tokens: { '--bg': '#ffffff' } } }));
    const byId = await resolveLike(index, root, '.open-design', 'vercel');
    assert.ok(byId.ok && byId.id === 'vercel');
    const byBundle = await resolveLike(index, root, '.open-design', '.open-design/.extract/acme');
    assert.ok(byBundle.ok && !byBundle.id);
    const outside = await resolveLike(index, root, '.open-design', '../etc');
    assert.ok(!outside.ok);
    const traversal = await resolveLike(index, root, '.open-design', '.open-design/.extract/../../x');
    assert.ok(!traversal.ok);
  });
});
