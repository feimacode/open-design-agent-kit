import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { compareRuns, deltaE2000, deltaEHex, normaliseFont, resultMarkdown, scoreColour, scoreFont, scoreSite, summarise } from '../../evals/extraction/score.mjs';

test('CIEDE2000 matches the published test pairs (Sharma, Wu and Dalal 2005)', () => {
  const pairs = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  ];
  for (const [a, b, want] of pairs) assert.ok(Math.abs(deltaE2000(a, b) - want) < 1e-3, `${a} ${b}: ${deltaE2000(a, b)} vs ${want}`);
  assert.equal(deltaEHex('#5e6ad2', '#5e6ad2'), 0);
  assert.equal(deltaEHex('nope', '#fff'), Infinity);
});

test('a colour is a hit within ΔE 10 of any truth, and not scored with no truth', () => {
  assert.equal(scoreColour('#5f6bd3', ['#5e6ad2']).hit, true);
  const miss = scoreColour('#e4f222', ['#5e6ad2']);
  assert.equal(miss.hit, false);
  assert.equal(miss.drafted, '#e4f222');
  assert.deepEqual(miss.truth, ['#5e6ad2']);
  assert.equal(scoreColour('#000000', []), null);
  assert.equal(scoreColour(undefined, ['#5e6ad2']).hit, false);
});

test('fonts match across case, accents, separators and variable suffixes', () => {
  assert.equal(normaliseFont('Söhne'), normaliseFont('sohne-var'));
  assert.equal(normaliseFont('Inter Variable'), 'inter');
  assert.equal(normaliseFont('"Mona Sans VF"'), 'monasans');
  assert.equal(scoreFont('"sohne-var", sans-serif', ['Söhne']).hit, true);
  assert.equal(scoreFont('Arial, sans-serif', ['Söhne']).hit, false);
  assert.equal(scoreFont('Inter', []), null);
});

test('a failed run is a miss wherever truth exists, and summaries count scored sites only', () => {
  const a = scoreSite({ site: 'a.com', accent: ['#5e6ad2'], font: ['Inter'] }, { status: 'ok', tokens: { '--accent': '#5e6ad2', '--font-body': 'Inter, sans-serif' }, ms: 4000 });
  const b = scoreSite({ site: 'b.com', accent: [], font: ['Geist'] }, { status: 'failed', error: 'timed out', ms: 90000 });
  const c = scoreSite({ site: 'c.com', accent: ['#ff0000'], font: [] }, { status: 'blocked', ms: 3000 });
  const s = summarise([a, b, c]);
  assert.deepEqual(s.accent, { hits: 1, scored: 2 });
  assert.deepEqual(s.font, { hits: 1, scored: 2 });
  assert.deepEqual(s.failed, ['b.com']);
  assert.deepEqual(s.blocked, ['c.com']);
  assert.equal(s.medianMs, 4000);
  const md = resultMarkdown({ date: '2026-11-05', kitVersion: '0.4.0', browser: 'Chromium', sets: [{ name: 'main', summary: s, scores: [a, b, c] }] });
  assert.match(md, /\| main \| 3 \| 1\/2 \(50%\) \| 1\/2 \(50%\) \| 1 \| 1 \| 4\.0 s \|/);
  assert.match(md, /\| c\.com \| blocked \| ✗ \|/);
});

test('compareRuns names the hits lost and gained', () => {
  const before = [{ site: 'a', accent: { hit: true }, font: { hit: false } }, { site: 'b', accent: { hit: false }, font: null }];
  const after = [{ site: 'a', accent: { hit: false }, font: { hit: true } }, { site: 'b', accent: { hit: true }, font: null }];
  assert.deepEqual(compareRuns(before, after), { lost: ['a accent'], gained: ['a font', 'b accent'] });
});

test('the site lists credit their source, keep the held-out set apart, and claim colours as hex', () => {
  const main = JSON.parse(readFileSync(new URL('../../evals/extraction/sites.json', import.meta.url), 'utf8'));
  const hold = JSON.parse(readFileSync(new URL('../../evals/extraction/holdout.json', import.meta.url), 'utf8'));
  assert.match(main.credit.from, /design-extract/);
  assert.ok(hold.sites.length >= 15);
  const names = new Set(main.sites.map((s) => s.site));
  assert.ok(hold.sites.every((s) => !names.has(s.site)));
  for (const s of [...main.sites, ...hold.sites]) {
    assert.ok(s.url.startsWith('https://'), s.site);
    assert.ok(s.accent.every((h) => /^#[0-9a-f]{6}$/i.test(h)), s.site);
    assert.ok(Array.isArray(s.font) && Array.isArray(s.sources), s.site);
  }
});
