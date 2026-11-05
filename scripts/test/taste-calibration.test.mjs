import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MAX_FALSE_ALARM, calibrate, firedOn, resultMarkdown } from '../../evals/taste-calibration/rates.mjs';

test('template-look needs two different template tells; intent is not a tell', () => {
  assert.deepEqual(firedOn(['slop-glow', 'slop-glow', 'contrast']), ['slop-glow']);
  assert.deepEqual(firedOn(['slop-glow', 'intent']), ['intent', 'slop-glow']);
  assert.deepEqual(firedOn(['card-row', 'uniform-surface']), ['card-row', 'template-look', 'uniform-surface']);
});

test('rates: false alarms over hand-made pages, hits over AI-default pages, failed pages left out', () => {
  const hand = Array.from({ length: 40 }, (_, i) => ({ site: `h${i}`, set: 'handMade', status: 'ok', fired: i < 4 ? ['slop-glow'] : i === 4 ? ['uniform-surface'] : [] }));
  const ai = Array.from({ length: 10 }, (_, i) => ({ site: `a${i}`, set: 'aiDefault', status: 'ok', fired: i < 7 ? ['slop-glow', 'card-row', 'template-look'] : [] }));
  const cal = calibrate([...hand, ...ai, { site: 'x', set: 'handMade', status: 'failed', fired: [] }], '2026-11-05');
  assert.equal(cal.handMade, 40);
  assert.equal(cal.calibratedAt, '2026-11-05');
  assert.equal(cal.rules['slop-glow'].falseAlarmRate, 0.1);
  assert.ok(cal.rules['slop-glow'].falseAlarmRate > MAX_FALSE_ALARM);
  assert.equal(cal.rules['uniform-surface'].falseAlarmRate, 0.025);
  assert.equal(cal.rules['template-look'].hitRate, 0.7);
  const md = resultMarkdown(cal, [...hand, ...ai]);
  assert.match(md, /`slop-glow` \| 4\/40 \(10%\) \| 7\/10 \(70%\) \| note \|/);
  assert.match(md, /`uniform-surface` \| 1\/40 \(2\.5%\) \| 0\/10 \(0%\) \| problem \|/);
});

test('no hand-made page loaded: nothing is calibrated', () => {
  const cal = calibrate([], '2026-11-05');
  assert.equal(cal.calibratedAt, null);
  assert.equal(cal.rules['slop-glow'], null);
});

test('the site lists are well formed and the checked-in calibration has every rule', () => {
  const hand = JSON.parse(readFileSync(new URL('../../evals/taste-calibration/handmade.json', import.meta.url), 'utf8'));
  assert.ok(hand.sites.length >= 35, String(hand.sites.length));
  for (const s of hand.sites) {
    assert.match(s.url, /^https:\/\//, s.site);
    assert.ok(s.why && s.collected, s.site);
  }
  assert.equal(new Set(hand.sites.map((s) => s.site)).size, hand.sites.length);
  const cal = JSON.parse(readFileSync(new URL('../../packages/core/src/export/taste-calibration.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(cal.rules).sort(), ['card-row', 'intent', 'slop-glow', 'template-look', 'uniform-surface']);
  assert.equal(cal.maxFalseAlarm, MAX_FALSE_ALARM);
});
