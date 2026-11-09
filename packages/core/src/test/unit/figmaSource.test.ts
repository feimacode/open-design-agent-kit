import * as assert from 'node:assert';
import { composeFigmaReadInstructions, parseFigmaSource, parseFigmaStyles, validateFigmaSource } from '../../generation/figmaSource';
import { parseFigmaUrl } from '../../generation/figmaPull';

// Shapes follow Figma's MCP replies: get_variable_defs is a flat resolved
// name → value map (values arrive as strings or numbers; aliases resolved),
// and search_design_system names variables with their collection and scopes.
const variableDefs = {
  'color/bg/default': '#FFFFFF',
  'color/text/primary': '#111111',
  'color/text/secondary': '#555555',
  'brand/500': '#5B3DF5',
  'font/body': 'Inter',
  'font/display': 'Söhne',
  'radius/md': 12,
  '12:345': '#000000',
};

const designSystem = [
  { name: 'color/bg/default', collection: 'Theme', scopes: ['FRAME_FILL', 'SHAPE_FILL'], description: 'Page background' },
  { name: 'brand/500', collection: 'Brand', scopes: ['ALL_FILLS'], description: 'Brand primary' },
  { name: 'Theme', collection: 'Theme', modes: ['Light', 'Dark'] },
];

// A recorded /styles + /nodes reply: styles name the paints, nodes carry them.
const stylesReply = {
  styles: [
    { key: 'S:1', name: 'Primary/500', style_type: 'FILL', node_id: '10:1' },
    { key: 'S:2', name: 'Text/Body', style_type: 'TEXT', node_id: '10:2' },
    { key: 'S:3', name: 'Shadow/High', style_type: 'EFFECT', node_id: '10:3' },
  ],
  nodes: {
    '10:1': { id: '10:1', name: 'Primary/500', type: 'RECTANGLE', fills: [{ type: 'SOLID', color: { r: 91 / 255, g: 61 / 255, b: 245 / 255 } }] },
    '10:2': { id: '10:2', name: 'Text/Body', type: 'TEXT', style: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeightPx: 24 } },
  },
};

describe('validateFigmaSource', () => {
  it('accepts a flat source with a file link and frames', () => {
    const checked = validateFigmaSource({
      kind: 'figma',
      file: 'https://www.figma.com/design/AbC123/Brand',
      frames: [{ nodeId: '12:345', name: 'Foundations', variables: variableDefs }],
      designSystem,
    });
    assert.ok(checked.ok);
    assert.strictEqual(checked.source.fileKey, 'AbC123');
    assert.strictEqual(checked.source.frames?.length, 1);
  });

  it('accepts the payload on data, as JSON or an object', () => {
    const asJson = validateFigmaSource({ kind: 'figma', data: JSON.stringify({ file: 'https://www.figma.com/design/AbC123/Brand', frames: [{ nodeId: '1:2', variables: {} }] }) });
    assert.ok(asJson.ok);
    const asObject = validateFigmaSource({ kind: 'figma', data: { file: 'AbC123', frames: [{ nodeId: '1:2', variables: {} }] } });
    assert.ok(asObject.ok);
    assert.strictEqual(asObject.source.fileKey, 'AbC123');
  });

  it('accepts a styles-only source', () => {
    const checked = validateFigmaSource({ kind: 'figma', file: 'https://www.figma.com/design/AbC123/Brand', styles: true });
    assert.ok(checked.ok);
    assert.strictEqual(checked.source.styles, true);
  });

  it('rejects a missing file or frames', () => {
    assert.strictEqual(validateFigmaSource({ kind: 'figma', frames: [] }).ok, false);
    assert.strictEqual(validateFigmaSource({ kind: 'figma', file: 'https://www.figma.com/design/x/Y' }).ok, false);
  });

  it('accepts logos as files, workspace paths or role-only listings, and fonts', () => {
    const checked = validateFigmaSource({
      kind: 'figma',
      file: 'AbC123',
      frames: [{ nodeId: '1:2', variables: {} }],
      logos: [
        { role: 'logo', name: 'acme-logo.svg', data: Buffer.from('<svg/>').toString('base64'), width: 120, height: 32, seenOn: '#FFFFFF' },
        { role: 'logo-dark', path: 'exports/acme-dark.png' },
        { role: 'icon', name: 'acme-icon.svg' },
      ],
      fonts: [{ family: 'Inter', weights: ['400', '600'], source: 'google' }, { family: 'Söhne' }],
    });
    assert.ok(checked.ok);
    assert.deepStrictEqual(checked.source.logos?.map((l) => l.role), ['logo', 'logo-dark', 'icon']);
    assert.strictEqual(checked.source.logos?.[0].seenOn, '#ffffff');
    assert.strictEqual(checked.source.logos?.[2].data, undefined);
    assert.strictEqual(checked.source.fonts?.[0].source, 'google');
    assert.strictEqual(checked.source.fonts?.[1].family, 'Söhne');
  });

  it('rejects a bad logo role, too many logos, both data and path, and unsafe names or paths', () => {
    const frame = [{ nodeId: '1:2', variables: {} }];
    const error = (logos: unknown) => (validateFigmaSource({ kind: 'figma', file: 'AbC123', frames: frame, logos }) as { error: string }).error;
    assert.match(error([{ role: 'banner' }]), /role must be one of/);
    assert.match(error(Array.from({ length: 9 }, (_, i) => ({ role: `logo`, name: `l${i}.svg` }))), /at most 8/);
    assert.match(error([{ role: 'logo', data: 'AAAA', path: 'a.svg' }]), /not both/);
    assert.match(error([{ role: 'logo', path: '/etc/passwd' }]), /inside the workspace/);
    assert.match(error([{ role: 'logo', path: 'a/../../b.svg' }]), /inside the workspace/);
    assert.match(error([{ role: 'logo', name: '../logo.svg' }]), /bare file name/);
    assert.match(error([{ role: 'logo', data: 'not base64!' }]), /must be base64/);
    assert.match(error([{ role: 'logo', data: Buffer.alloc(1024 * 1024 + 1).toString('base64') }]), /over 1 MB/);
  });

  it('rejects a font with no family or an unknown source', () => {
    const frame = [{ nodeId: '1:2', variables: {} }];
    const error = (fonts: unknown) => (validateFigmaSource({ kind: 'figma', file: 'AbC123', frames: frame, fonts }) as { error: string }).error;
    assert.match(error([{ weights: ['400'] }]), /needs "family"/);
    assert.match(error([{ family: 'Inter', source: 'local' }]), /source must be one of/);
  });
});

describe('composeFigmaReadInstructions', () => {
  const link = 'https://www.figma.com/design/AbC123/Brand?node-id=12-345';
  const ref = parseFigmaUrl(link)!;

  it('asks for logo bytes on the local server', () => {
    const text = composeFigmaReadInstructions({ link, ref, tokenConfigured: true });
    assert.match(text, /Pass each file's bytes as base64 `data`/);
    assert.match(text, /"data": "<base64>"/);
    assert.match(text, /published fill and text styles/);
  });

  it('lists logos as needed on the hosted gateway, and has no styles fallback', () => {
    const text = composeFigmaReadInstructions({ link, ref, hosted: true });
    assert.match(text, /pass each logo's `role` and a `name` only/);
    assert.match(text, /person attaches the files once it is saved/);
    assert.doesNotMatch(text, /"data": "<base64>"/);
    assert.match(text, /don't call Figma's variables REST API/);
    assert.ok(!/styles": true/.test(text));
  });

  it('names the fonts as a list either way', () => {
    for (const hosted of [false, true]) {
      const text = composeFigmaReadInstructions({ link, ref, hosted });
      assert.match(text, /pass each family under `fonts` with its `weights`/);
      assert.match(text, /Font files are always listed as needed/);
    }
  });
});

describe('parseFigmaStyles', () => {
  it('takes published fills as candidates named from the style', () => {
    const draft = parseFigmaStyles(stylesReply);
    assert.strictEqual(draft.confidence, 'declared');
    assert.deepStrictEqual(draft.candidates[0], { value: '#5b3df5', label: 'Primary/500' });
  });

  it('lists text styles and unmapped effects, and says variables were not read', () => {
    const draft = parseFigmaStyles(stylesReply);
    assert.ok(draft.notes.some((n) => /Text style "Text\/Body": Inter, 16px, weight 400, 24px line height\./.test(n)));
    assert.ok(draft.notes.some((n) => /Effect styles are not mapped: Shadow\/High\./.test(n)));
    assert.ok(draft.notes.some((n) => /Published styles only: variables, scopes and modes were not read/.test(n)));
  });

  it('skips a fill style with no solid colour', () => {
    const draft = parseFigmaStyles({
      styles: [{ key: 'S:4', name: 'Gradient/Brand', style_type: 'FILL', node_id: '10:4' }],
      nodes: { '10:4': { id: '10:4', name: 'Gradient/Brand', type: 'RECTANGLE', fills: [{ type: 'GRADIENT_LINEAR' }] } },
    });
    assert.strictEqual(draft.candidates.length, 0);
    assert.ok(draft.notes.some((n) => /has no solid colour/.test(n)));
  });
});

describe('parseFigmaSource', () => {
  it('turns px line heights into ratios of their font size, and leaves them out when there is none', () => {
    const withSize = parseFigmaSource({
      kind: 'figma',
      file: 'AbC123',
      frames: [{ nodeId: '1:1', name: 'Type', variables: { 'font-size/base': '16', 'line-height/body': '24', 'font-size/3xl': '40', 'line-height/heading': '44' } }],
    });
    assert.strictEqual(withSize.tokens['--text-base']?.value, '16px');
    assert.strictEqual(withSize.tokens['--leading-body']?.value, '1.5');
    assert.strictEqual(withSize.tokens['--leading-tight']?.value, '1.1');

    const unitless = parseFigmaSource({ kind: 'figma', file: 'AbC123', frames: [{ nodeId: '1:1', variables: { 'line-height/body': '1.5' } }] });
    assert.strictEqual(unitless.tokens['--leading-body']?.value, '1.5');

    const alone = parseFigmaSource({ kind: 'figma', file: 'AbC123', frames: [{ nodeId: '1:1', variables: { 'line-height/body': '24' } }] });
    assert.strictEqual(alone.tokens['--leading-body'], undefined);
    assert.ok(alone.notes.some((n) => /--leading-body is 24px[\s\S]*left out/.test(n)));
  });

  it('maps variable names to roles and keeps the Figma name', () => {
    const checked = validateFigmaSource({
      kind: 'figma',
      file: 'https://www.figma.com/design/AbC123/Brand',
      frames: [{ nodeId: '12:345', name: 'Foundations', variables: variableDefs }],
    });
    assert.ok(checked.ok);
    const draft = parseFigmaSource(checked.source);
    assert.strictEqual(draft.confidence, 'declared');
    assert.strictEqual(draft.tokens['--bg']?.value, '#ffffff');
    assert.strictEqual(draft.tokens['--bg']?.where, 'color/bg/default');
    assert.strictEqual(draft.tokens['--fg']?.value, '#111111');
    assert.strictEqual(draft.tokens['--fg-2']?.value, '#555555');
  });

  it('maps font variables to the font roles', () => {
    const checked = validateFigmaSource({ kind: 'figma', file: 'AbC123', frames: [{ nodeId: '1:2', variables: variableDefs }] });
    assert.ok(checked.ok);
    const draft = parseFigmaSource(checked.source);
    assert.match(draft.tokens['--font-body']?.value ?? '', /^"?Inter"?, sans-serif$/);
    assert.match(draft.tokens['--font-display']?.value ?? '', /^"Söhne", sans-serif$/);
  });

  it('keeps unnameable colours as candidates with the Figma name', () => {
    const checked = validateFigmaSource({ kind: 'figma', file: 'AbC123', frames: [{ nodeId: '1:2', variables: variableDefs }] });
    assert.ok(checked.ok);
    const draft = parseFigmaSource(checked.source);
    assert.ok(draft.candidates.some((c) => c.value === '#5b3df5' && c.label === 'brand/500'));
  });

  it('skips keys that are ids and lists them', () => {
    const checked = validateFigmaSource({ kind: 'figma', file: 'AbC123', frames: [{ nodeId: '1:2', variables: variableDefs }] });
    assert.ok(checked.ok);
    const draft = parseFigmaSource(checked.source);
    assert.ok(!Object.values(draft.tokens).some((t) => t.value === '#000000'));
    assert.ok(draft.notes.some((n) => /Skipped/.test(n) && /12:345/.test(n)));
  });

  it('uses Figma scopes when the name alone does not say', () => {
    const checked = validateFigmaSource({
      kind: 'figma',
      file: 'AbC123',
      frames: [{ nodeId: '1:2', variables: { 'core/900': '#0B0B0B', 'core/200': '#E5E5E5', 'hairline/soft': '#EDEDED' } }],
      designSystem: [
        { name: 'core/900', collection: 'Core', scopes: ['TEXT_FILL'] },
        { name: 'core/200', collection: 'Core', scopes: ['STROKE_COLOR'] },
        { name: 'hairline/soft', collection: 'Core', scopes: ['STROKE_COLOR'] },
      ],
    });
    assert.ok(checked.ok);
    const draft = parseFigmaSource(checked.source);
    assert.strictEqual(draft.tokens['--fg']?.value, '#0b0b0b');
    assert.strictEqual(draft.tokens['--border']?.value, '#e5e5e5');
    assert.strictEqual(draft.tokens['--border-soft']?.value, '#ededed');
  });

  it('maps numbers to the type scale, spacing and radius', () => {
    const checked = validateFigmaSource({
      kind: 'figma',
      file: 'AbC123',
      frames: [{ nodeId: '1:2', variables: { 'type/heading-1': 32, 'type/body': 16, 'type/caption': 12, 'space/4': 16, 'radius/md': 12 } }],
      designSystem: [
        { name: 'type/heading-1', collection: 'Type', scopes: ['FONT_SIZE'] },
        { name: 'type/body', collection: 'Type', scopes: ['FONT_SIZE'] },
        { name: 'type/caption', collection: 'Type', scopes: ['FONT_SIZE'] },
        { name: 'space/4', collection: 'Space', scopes: ['GAP'] },
      ],
    });
    assert.ok(checked.ok);
    const draft = parseFigmaSource(checked.source);
    assert.strictEqual(draft.tokens['--text-2xl']?.value, '32px');
    assert.strictEqual(draft.tokens['--text-base']?.value, '16px');
    assert.strictEqual(draft.tokens['--text-xs']?.value, '12px');
    assert.strictEqual(draft.tokens['--space-4']?.value, '16px');
    assert.strictEqual(draft.tokens['--radius-md']?.value, '12px');
  });

  it("takes the accent from the primary button when no variable is named primary", () => {
    const checked = validateFigmaSource({
      kind: 'figma',
      file: 'AbC123',
      frames: [{
        nodeId: '1:2',
        name: 'Components / Button / Primary',
        variables: { 'brand/500': '#5B3DF5', 'color/text/on-primary': '#FFFFFF' },
      }],
    });
    assert.ok(checked.ok);
    const draft = parseFigmaSource(checked.source);
    assert.strictEqual(draft.tokens['--accent']?.value, '#5b3df5');
    assert.strictEqual(draft.tokens['--accent-on']?.value, '#ffffff');
    assert.ok(draft.notes.some((n) => /accent came from the "Components \/ Button \/ Primary"'s fill \("brand\/500"\)/.test(n)));
    assert.ok(!draft.candidates.some((c) => c.label === 'brand/500'));
  });

  it('reports one mode and lists the other collections and modes as not read', () => {
    const checked = validateFigmaSource({
      kind: 'figma',
      file: 'AbC123',
      frames: [{ nodeId: '1:2', variables: { 'color/bg/default': '#FFFFFF' } }],
      designSystem: [
        { name: 'Theme', collection: 'Theme', modes: ['Light', 'Dark'] },
        { name: 'Marketing', collection: 'Marketing', scopes: ['ALL_FILLS'] },
      ],
    });
    assert.ok(checked.ok);
    const draft = parseFigmaSource(checked.source);
    assert.ok(draft.notes.some((n) => /Read one mode per collection: Theme Light\. Not read: Dark\./.test(n)));
    assert.ok(draft.notes.some((n) => /Other collections not read: Marketing/.test(n)));
  });

  it('notes that aliases arrive resolved', () => {
    const checked = validateFigmaSource({ kind: 'figma', file: 'AbC123', frames: [{ nodeId: '1:2', variables: { card: 'var(--surface/1)', 'surface/1': '#F5F5F5' } }] });
    assert.ok(checked.ok);
    const draft = parseFigmaSource(checked.source);
    assert.ok(draft.notes.some((n) => /Aliases arrive from Figma as resolved values/.test(n)));
  });

  it('resolves var() aliases against the same map', () => {
    const checked = validateFigmaSource({
      kind: 'figma',
      file: 'AbC123',
      frames: [{ nodeId: '1:2', variables: { 'color/surface/1': '#F5F5F5', card: 'var(--color/surface/1)' } }],
    });
    assert.ok(checked.ok);
    const draft = parseFigmaSource(checked.source);
    assert.strictEqual(draft.tokens['--surface']?.value, '#f5f5f5');
  });
});
