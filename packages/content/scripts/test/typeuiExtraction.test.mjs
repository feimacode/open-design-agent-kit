import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  relativeLuminance,
  looksLikeIdentityInkNotAccent,
  classifyCollision,
  classifyCandidates,
  parseTypeuiEntry,
  extractDesignSystemScaffold,
} from '../typeuiExtraction.mjs';

// Matches the REAL two-file shape (verified against riso/claude/neon's
// actual files this session): SKILL.md's frontmatter only carries
// name/description/metadata.author; colors/typography/rounded/spacing
// live in DESIGN.md's frontmatter instead.
function fixtureSkillMd({ name = 'riso', description = 'Test description.' } = {}) {
  return `---
name: "${name}"
description: "${description}"
metadata:
  author: typeui.sh
---

<!-- TYPEUI_SH_MANAGED_START -->
# ${name} Design System Skill (Universal)
<!-- TYPEUI_SH_MANAGED_END -->
`;
}

function fixtureDesignMd({ name = 'Riso', primary = '#F237A1', secondary = '#2C40A7', surface = '#FFFFFF', text = '#111827', bodyFont, displayFont = 'Space Grotesk' } = {}) {
  return `---
name: ${name}
colors:
  primary: "${primary}"
  secondary: "${secondary}"
  success: "#16A34A"
  warning: "#D97706"
  danger: "#DC2626"
  surface: "${surface}"
  text: "${text}"
  neutral: "${surface}"
typography:
  h1:
    fontFamily: "${displayFont}"
    fontSize: 2rem
  body-md:
    fontFamily: "${bodyFont ?? displayFont}"
    fontSize: 1rem
  label-caps:
    fontFamily: "Overpass Mono"
    fontSize: 0.75rem
  sourceScale: "12/14/16/20/24/32"
  weights: "400"
rounded:
  sm: 4px
  md: 8px
spacing:
  sm: 4px
  md: 8px
  sourceScale: "4/8/12/16/24/32"
---

## Overview

Test overview.
`;
}

test('relativeLuminance reads black as 0 and white as 1', () => {
  assert.equal(relativeLuminance('#000000'), 0);
  assert.ok(Math.abs(relativeLuminance('#ffffff') - 1) < 1e-9);
});

test('looksLikeIdentityInkNotAccent flags near-black and near-white, not mid-tones', () => {
  assert.equal(looksLikeIdentityInkNotAccent('#000000'), true);
  assert.equal(looksLikeIdentityInkNotAccent('#222222'), true); // fiction's real primary
  assert.equal(looksLikeIdentityInkNotAccent('#ffffff'), true);
  assert.equal(looksLikeIdentityInkNotAccent('#f237a1'), false); // riso's real primary/accent
  assert.equal(looksLikeIdentityInkNotAccent('#2db58a'), false); // matrix's real primary/accent
});

test('parseTypeuiEntry reads name/description from SKILL.md and colors/typography/rounded/spacing from DESIGN.md', () => {
  const parsed = parseTypeuiEntry(fixtureSkillMd({ name: 'riso', description: 'A risograph aesthetic.' }), fixtureDesignMd());
  assert.equal(parsed.name, 'Riso'); // DESIGN.md's own `name:` field wins when present
  assert.equal(parsed.description, 'A risograph aesthetic.'); // SKILL.md's fuller prose wins
  assert.equal(parsed.colors.primary, '#F237A1');
  assert.equal(parsed.colors.secondary, '#2C40A7');
  assert.equal(parsed.typography.displayFont, 'Space Grotesk');
  assert.equal(parsed.roundedSm, '4px');
  assert.equal(parsed.spacingScale, '4/8/12/16/24/32');
});

test('parseTypeuiEntry falls back to SKILL.md name when DESIGN.md has none', () => {
  const bareDesignMd = '---\ncolors:\n  surface: "#fff"\n  text: "#000"\n---\n';
  const parsed = parseTypeuiEntry(fixtureSkillMd({ name: 'riso' }), bareDesignMd);
  assert.equal(parsed.name, 'riso');
});

test('classifyCollision reports upstream, local, or none', () => {
  const upstream = new Set(['claude', 'neon']);
  const local = new Set(['riso']);
  assert.equal(classifyCollision('claude', upstream, local), 'upstream');
  assert.equal(classifyCollision('riso', upstream, local), 'local');
  assert.equal(classifyCollision('stitch', upstream, local), null);
});

test('classifyCandidates buckets every slug into exactly one group', () => {
  const result = classifyCandidates(['claude', 'riso', 'stitch'], new Set(['claude']), new Set(['riso']));
  assert.deepEqual(result, { redundant: ['claude'], ported: ['riso'], candidate: ['stitch'] });
});

test('extractDesignSystemScaffold maps safe fields directly for a chromatic primary', () => {
  const scaffold = extractDesignSystemScaffold('riso', fixtureSkillMd(), fixtureDesignMd(), new Set(), new Set(), ['Editorial & Print']);
  assert.equal(scaffold.collision, null);
  assert.match(scaffold.tokensCss, /--accent: #F237A1;/);
  assert.match(scaffold.tokensCss, /--success: #16A34A;/);
  assert.match(scaffold.tokensCss, /--radius-sm: 4px;/);
  assert.match(scaffold.tokensCss, /--font-display: "Space Grotesk", sans-serif;/);
  assert.equal(scaffold.manifest.id, 'riso');
  assert.equal(scaffold.manifest.category, '__TODO__');
});

test('extractDesignSystemScaffold flags a near-black primary as identity ink, not an accent', () => {
  const scaffold = extractDesignSystemScaffold(
    'codex',
    fixtureSkillMd({ name: 'codex' }),
    fixtureDesignMd({ name: 'Codex', primary: '#000000' }),
    new Set(),
    new Set(),
    [],
  );
  assert.match(scaffold.tokensCss, /--accent: #ff00ff;.*identity ink/);
  assert.ok(scaffold.notes.some((n) => n.includes('identity ink')));
});

test('extractDesignSystemScaffold flags a colliding upstream id and skips it without --force (enforced by the CLI, not this function)', () => {
  const scaffold = extractDesignSystemScaffold(
    'claude',
    fixtureSkillMd({ name: 'claude' }),
    fixtureDesignMd({ name: 'Claude' }),
    new Set(['claude']),
    new Set(),
    [],
  );
  assert.equal(scaffold.collision, 'upstream');
  assert.match(scaffold.notes[0], /COLLISION.*upstream/);
});

test('extractDesignSystemScaffold picks the dark-canvas baseline when surface reads dark', () => {
  const scaffold = extractDesignSystemScaffold(
    'matrix',
    fixtureSkillMd({ name: 'matrix' }),
    fixtureDesignMd({ name: 'Matrix', primary: '#2DB58A', surface: '#0B0C14', text: '#E8ECEF' }),
    new Set(),
    new Set(),
    [],
  );
  assert.match(scaffold.tokensCss, /--text-xl: 26px;/); // dark baseline value, not light's 24px
  assert.ok(scaffold.notes.some((n) => n.includes('dark-canvas baseline')));
});

test('extractDesignSystemScaffold derives a distinct --surface via color-mix when typeui gives only one canvas shade', () => {
  const scaffold = extractDesignSystemScaffold('riso', fixtureSkillMd(), fixtureDesignMd(), new Set(), new Set(), []);
  assert.match(scaffold.tokensCss, /--surface: color-mix\(in oklab, var\(--bg\), var\(--fg\) 4%\);/);
  assert.ok(scaffold.notes.some((n) => n.includes('one shade for canvas')));
});

test('extractDesignSystemScaffold trusts a genuinely distinct colors.background/colors.surface pair as-is', () => {
  const designMd = `---
name: Pulse
colors:
  primary: "#EA580B"
  secondary: "#F59E0B"
  background: "#FFEDD5"
  surface: "#FDBA74"
  text: "#EA580C"
---
`;
  const scaffold = extractDesignSystemScaffold('pulse', fixtureSkillMd({ name: 'pulse' }), designMd, new Set(), new Set(), []);
  assert.match(scaffold.tokensCss, /--bg: #FFEDD5;/);
  assert.match(scaffold.tokensCss, /--surface: #FDBA74;/);
  assert.ok(!scaffold.notes.some((n) => n.includes('one shade for canvas')));
});

test('extractDesignSystemScaffold flags a same-family body font for review', () => {
  const scaffold = extractDesignSystemScaffold(
    'sketch',
    fixtureSkillMd({ name: 'sketch' }),
    fixtureDesignMd({ name: 'Sketch', displayFont: 'Delicious Handrawn' }),
    new Set(),
    new Set(),
    [],
  );
  assert.ok(scaffold.notes.some((n) => n.includes('body-md.fontFamily is the same as h1')));
});
