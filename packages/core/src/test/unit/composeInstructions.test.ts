import * as assert from 'node:assert';
import { composeInstructions, selectCraftSections } from '../../generation/composeInstructions';

describe('composeInstructions', () => {
  it('includes the skill body, brief, and suggested entry path', () => {
    const text = composeInstructions({
      skillName: 'Landing Page',
      skillBody: 'Write a single-page hero + features + CTA layout.',
      brief: 'A landing page for a coffee subscription.',
      suggestedEntryPath: '.open-design/coffee-subscription/coffee-subscription.html',
    });
    assert.match(text, /Landing Page/);
    assert.match(text, /coffee subscription/);
    assert.match(text, /\.open-design\/coffee-subscription\/coffee-subscription\.html/);
    assert.match(text, /register_open_design_artifact/);
  });

  it('includes the design system body only when provided', () => {
    const withoutDs = composeInstructions({
      skillName: 'Landing Page',
      skillBody: 'body',
      brief: 'brief',
      suggestedEntryPath: 'x.html',
    });
    assert.doesNotMatch(withoutDs, /Active design system/);

    const withDs = composeInstructions({
      skillName: 'Landing Page',
      skillBody: 'body',
      designSystemTitle: 'Starbucks',
      designSystemBody: '# Design System Inspired by Starbucks',
      brief: 'brief',
      suggestedEntryPath: 'x.html',
    });
    assert.match(withDs, /Active design system — Starbucks/);
  });

  it('includes craft sections only when provided', () => {
    const text = composeInstructions({
      skillName: 'Landing Page',
      skillBody: 'body',
      brief: 'brief',
      suggestedEntryPath: 'x.html',
      craftSections: [{ id: 'typography', body: 'Use a clear type scale.' }],
    });
    assert.match(text, /Universal craft rules/);
    assert.match(text, /typography/);
  });

  it('nudges toward the existing app only when frameworks were detected', () => {
    const withoutFrameworks = composeInstructions({
      skillName: 'Landing Page',
      skillBody: 'body',
      brief: 'brief',
      suggestedEntryPath: 'x.html',
    });
    assert.doesNotMatch(withoutFrameworks, /already contains an application/);

    const withEmptyFrameworks = composeInstructions({
      skillName: 'Landing Page',
      skillBody: 'body',
      brief: 'brief',
      suggestedEntryPath: 'x.html',
      existingAppFrameworks: [],
    });
    assert.doesNotMatch(withEmptyFrameworks, /already contains an application/);

    const withFrameworks = composeInstructions({
      skillName: 'Landing Page',
      skillBody: 'body',
      brief: 'brief',
      suggestedEntryPath: 'x.html',
      existingAppFrameworks: ['React', 'Next.js'],
    });
    assert.match(withFrameworks, /already contains an application/);
    assert.match(withFrameworks, /Detected: React, Next\.js/);
    assert.match(withFrameworks, /does NOT change where or how you write the artifact/);
  });
});

describe('selectCraftSections', () => {
  const all = [
    { id: 'typography', body: 'a' },
    { id: 'color', body: 'b' },
    { id: 'accessibility-baseline', body: 'c' },
  ];

  it('returns all sections when no suggestion list is given', () => {
    assert.strictEqual(selectCraftSections(all, undefined).length, 3);
  });

  it('returns all sections when the suggestion list is empty (legacy design system)', () => {
    assert.strictEqual(selectCraftSections(all, []).length, 3);
  });

  it('narrows to only the suggested ids when a non-empty list is given', () => {
    const result = selectCraftSections(all, ['color', 'accessibility-baseline']);
    assert.deepStrictEqual(
      result.map((s) => s.id),
      ['color', 'accessibility-baseline'],
    );
  });
});
