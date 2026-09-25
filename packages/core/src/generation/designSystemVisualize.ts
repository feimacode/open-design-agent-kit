// The preview's Visualize tab: one standalone, script-free HTML document
// showing what a design system *is* — identity, typography, palette, voice,
// imagery & layout, and its component kit — built from the resolved tokens
// (see designSystemTokens.ts) plus DESIGN.md prose. A re-implementation of
// upstream's React DesignKitView module stack (apps/web/src/components/
// DesignKitView.tsx) for DESIGN.md + tokens.css systems: no brand.json, logo,
// image-sample, asset, or upload modules, and empty modules are omitted
// rather than shown as upload placeholders.
//
// Everything interpolated is either HTML-escaped (DESIGN.md-derived text,
// attribute values) or a token value that already passed isSafeCssValue().

import { TOKEN_SCHEMA } from '../vendored/designTokenSchema';
import { parseDesignMd, type ParsedDesignMd, type ParsedFont } from '../vendored/designMdParse';
import { escapeHtml, renderKitHtml } from '../vendored/designSystemKit';
import { resolveTokenValue, type ResolvedDesignSystemTokens } from './designSystemTokens';

export interface DesignSystemVisualizeInput {
  name: string;
  category?: string;
  summary?: string;
  designMd: string;
  resolved: ResolvedDesignSystemTokens;
}

const PALETTE_TOKENS = [
  '--bg',
  '--surface',
  '--surface-warm',
  '--fg',
  '--fg-2',
  '--muted',
  '--meta',
  '--border',
  '--border-soft',
  '--accent',
  '--accent-on',
  '--success',
  '--warn',
  '--danger',
];
const TYPE_SCALE_TOKENS = ['--text-4xl', '--text-3xl', '--text-2xl', '--text-xl', '--text-lg', '--text-base', '--text-sm', '--text-xs'];
const RADIUS_TOKENS = ['--radius-sm', '--radius-md', '--radius-lg', '--radius-pill'];
const SPACE_TOKENS = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-8', '--space-12'];
const EXTRA_DESIGN_MD_COLORS = 12;

const DESCRIPTIONS = new Map(TOKEN_SCHEMA.map((t) => [t.name, t.description]));

/** First family of a font stack, unquoted — the label shown on a specimen card. */
export function primaryFontFamily(stack: string): string {
  return (stack.split(',')[0] ?? stack).trim().replace(/^["']|["']$/g, '');
}

function attr(value: string): string {
  return escapeHtml(value);
}

function moduleSection(label: string, body: string): string {
  return `<section class="module"><h2 class="module-label">${escapeHtml(label)}</h2>${body}</section>`;
}

function identityModule(input: DesignSystemVisualizeInput, parsed: ParsedDesignMd): string {
  const category = input.category || parsed.category;
  const tagline = parsed.tagline.trim();
  const description = (input.summary || parsed.description).trim();
  if (!category && !tagline && !description) return '';
  return moduleSection(
    'Identity',
    [
      category ? `<p class="eyebrow">${escapeHtml(category)}</p>` : '',
      tagline ? `<p class="tagline">${escapeHtml(tagline)}</p>` : '',
      description ? `<p class="prose">${escapeHtml(description)}</p>` : '',
    ].join(''),
  );
}

function typographyModule(input: DesignSystemVisualizeInput, parsed: ParsedDesignMd): string {
  const tokens = input.resolved.tokens;
  const roles: Array<[string, string, ParsedFont | undefined]> = [
    ['Display', '--font-display', parsed.typography.display],
    ['Body', '--font-body', parsed.typography.body],
    ['Mono', '--font-mono', parsed.typography.mono],
  ];
  const cards = roles
    .map(([label, name, parsedFont]) => {
      const stack = resolveTokenValue(tokens, name);
      if (!stack) return '';
      const weights = parsedFont?.weights.length ? parsedFont.weights.join(' / ') : '';
      return `<figure class="type-card">
  <div class="type-specimen" style="font-family: ${attr(stack)}">Ag</div>
  <figcaption><strong>${escapeHtml(primaryFontFamily(stack))}</strong><span>${escapeHtml(label)}</span>${weights ? `<small>${escapeHtml(weights)}</small>` : ''}</figcaption>
</figure>`;
    })
    .filter(Boolean);
  const display = resolveTokenValue(tokens, '--font-display');
  const body = resolveTokenValue(tokens, '--font-body') ?? display;
  const scale = TYPE_SCALE_TOKENS.filter((name) => tokens.has(name))
    .map((name, i) => {
      const size = resolveTokenValue(tokens, name)!;
      const family = i < 3 ? display : body;
      return `<div class="scale-row"><code>${escapeHtml(name)} · ${escapeHtml(size)}</code><span style="font-size: ${attr(size)};${family ? ` font-family: ${attr(family)}` : ''}">The quick brown fox</span></div>`;
    })
    .join('');
  if (cards.length === 0 && !scale) return '';
  return moduleSection('Typography', `${cards.length ? `<div class="type-grid">${cards.join('')}</div>` : ''}${scale ? `<div class="scale">${scale}</div>` : ''}`);
}

function paletteModule(input: DesignSystemVisualizeInput, parsed: ParsedDesignMd): string {
  const tokens = input.resolved.tokens;
  const shown = new Set<string>();
  const swatches = PALETTE_TOKENS.filter((name) => tokens.has(name)).map((name) => {
    const declared = tokens.get(name)!;
    const concrete = resolveTokenValue(tokens, name) ?? declared;
    shown.add(concrete.toLowerCase());
    return `<figure class="swatch">
  <div class="chip" style="background: ${attr(concrete)}"></div>
  <figcaption><strong>${escapeHtml(name)}</strong><code>${escapeHtml(declared)}</code><span>${escapeHtml(DESCRIPTIONS.get(name) ?? '')}</span></figcaption>
</figure>`;
  });
  const extraColors: ParsedDesignMd['colors'] = [];
  for (const c of parsed.colors) {
    const hex = c.hex.toLowerCase();
    if (shown.has(hex) || extraColors.length >= EXTRA_DESIGN_MD_COLORS) continue;
    shown.add(hex);
    extraColors.push(c);
  }
  const extras = extraColors.map(
      (c) => `<figure class="swatch">
  <div class="chip" style="background: ${attr(c.hex)}"></div>
  <figcaption><strong>${escapeHtml(c.name.replace(/:$/, '') || c.role)}</strong><code>${escapeHtml(c.hex)}</code><span>${escapeHtml(truncate(c.usage, 110))}</span></figcaption>
</figure>`,
    );
  if (swatches.length === 0 && extras.length === 0) return '';
  return moduleSection(
    'Palette',
    `${swatches.length ? `<div class="swatch-grid">${swatches.join('')}</div>` : ''}${
      extras.length ? `<h3 class="sub-label">Also named in DESIGN.md</h3><div class="swatch-grid">${extras.join('')}</div>` : ''
    }`,
  );
}

function voiceModule(parsed: ParsedDesignMd): string {
  const { adjectives, tone, messagingPillars, vocabulary } = parsed.voice;
  const parts = [
    adjectives.length ? `<div class="chips">${adjectives.map((a) => `<span class="pill">${escapeHtml(a)}</span>`).join('')}</div>` : '',
    tone ? `<p class="prose">${escapeHtml(tone)}</p>` : '',
    list('Messaging pillars', messagingPillars),
    list('Use', vocabulary.use),
    list('Avoid', vocabulary.avoid),
  ].join('');
  return parts ? moduleSection('Voice', parts) : '';
}

function imageryLayoutModule(input: DesignSystemVisualizeInput, parsed: ParsedDesignMd): string {
  const tokens = input.resolved.tokens;
  const { style, subjects, treatment, avoid } = parsed.imagery;
  const imagery = [
    style ? `<p class="prose">${escapeHtml(style)}</p>` : '',
    treatment ? `<p class="prose">${escapeHtml(treatment)}</p>` : '',
    list('Subjects', subjects),
    list('Avoid', avoid),
  ].join('');

  const radii = RADIUS_TOKENS.filter((name) => tokens.has(name))
    .map((name) => `<figure class="radius"><div style="border-radius: ${attr(resolveTokenValue(tokens, name)!)}"></div><figcaption>${escapeHtml(name)}<code>${escapeHtml(tokens.get(name)!)}</code></figcaption></figure>`)
    .join('');
  const spaces = SPACE_TOKENS.filter((name) => tokens.has(name))
    .map((name) => `<div class="space-row"><code>${escapeHtml(name)} · ${escapeHtml(tokens.get(name)!)}</code><span class="bar" style="width: ${attr(resolveTokenValue(tokens, name)!)}"></span></div>`)
    .join('');
  const raised = resolveTokenValue(tokens, '--elev-raised');
  const layoutProse = [parsed.layout.spacing ? `<p class="prose">${escapeHtml(parsed.layout.spacing)}</p>` : '', list('Layout rules', parsed.layout.postureRules)].join('');

  const body = [
    imagery ? `<h3 class="sub-label">Imagery</h3>${imagery}` : '',
    radii ? `<h3 class="sub-label">Radius</h3><div class="radius-grid">${radii}</div>` : '',
    spaces ? `<h3 class="sub-label">Spacing</h3><div class="spaces">${spaces}</div>` : '',
    raised ? `<h3 class="sub-label">Elevation</h3><div class="elev" style="box-shadow: ${attr(raised)}"><code>--elev-raised</code></div>` : '',
    layoutProse ? `<h3 class="sub-label">Layout</h3>${layoutProse}` : '',
  ].join('');
  return body ? moduleSection('Imagery & layout', body) : '';
}

function kitModule(input: DesignSystemVisualizeInput): string {
  const identity = { name: input.name, category: input.category || 'Custom', description: input.summary || undefined };
  const light = renderKitHtml(identity, input.resolved.tokens, 'light');
  const dark = renderKitHtml(identity, input.resolved.tokens, 'dark');
  // CSS-only Light/Dark toggle: this document runs in a script-less sandbox,
  // so the two pre-rendered variants are swapped with :checked selectors.
  return moduleSection(
    'Component kit',
    `<div class="kit">
  <input type="radio" name="kit-mode" id="kit-light" checked><label for="kit-light">Light</label>
  <input type="radio" name="kit-mode" id="kit-dark"><label for="kit-dark">Dark</label>
  <iframe class="kit-frame kit-light" sandbox="" title="Component kit, light" srcdoc="${attr(light)}"></iframe>
  <iframe class="kit-frame kit-dark" sandbox="" title="Component kit, dark" srcdoc="${attr(dark)}"></iframe>
</div>`,
  );
}

function list(label: string, items: string[]): string {
  const clean = items.map((i) => i.trim()).filter(Boolean);
  if (clean.length === 0) return '';
  return `<p class="list-label">${escapeHtml(label)}</p><ul>${clean.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function renderDesignSystemVisualize(input: DesignSystemVisualizeInput): string {
  const parsed = parseDesignMd(input.designMd);
  const modules = [
    identityModule(input, parsed),
    typographyModule(input, parsed),
    paletteModule(input, parsed),
    voiceModule(parsed),
    imageryLayoutModule(input, parsed),
    kitModule(input),
  ].join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(input.name)} — visualize</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #ededed; color: #1f1f1f; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 980px; margin: 0 auto; padding: 32px 28px 64px; display: grid; gap: 18px; }
  h1 { margin: 0 0 4px; font-size: 20px; font-weight: 650; }
  .module { background: #f5f5f5; border: 1px solid #dedede; border-radius: 16px; padding: 20px 22px; }
  .module-label { margin: 0 0 14px; font-size: 12px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: #666; }
  .sub-label { margin: 18px 0 10px; font-size: 12px; font-weight: 600; color: #777; }
  .eyebrow { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: #777; }
  .tagline { margin: 0 0 6px; font-size: 17px; font-weight: 600; }
  .prose { margin: 0 0 8px; color: #333; }
  .list-label { margin: 10px 0 4px; font-weight: 600; color: #555; }
  ul { margin: 0; padding-left: 20px; color: #333; }
  code { font: 12px/1.4 ui-monospace, "SF Mono", Menlo, monospace; color: #555; }
  .type-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .type-card { margin: 0; background: #fff; border: 1px solid #e2e2e2; border-radius: 12px; overflow: hidden; }
  .type-specimen { height: 104px; display: grid; place-items: center; font-size: 56px; color: #111; }
  .type-card figcaption { padding: 10px 12px; background: #fafafa; border-top: 1px solid #eee; display: grid; }
  .type-card figcaption span { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #999; }
  .type-card figcaption small { color: #888; }
  .scale { margin-top: 14px; display: grid; gap: 6px; }
  .scale-row { display: grid; grid-template-columns: 170px 1fr; align-items: baseline; gap: 12px; overflow: hidden; white-space: nowrap; }
  .swatch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .swatch { margin: 0; background: #fff; border: 1px solid #e2e2e2; border-radius: 12px; overflow: hidden; }
  .chip { height: 64px; border-bottom: 1px solid #eee; }
  .swatch figcaption { padding: 8px 10px; display: grid; gap: 2px; }
  .swatch figcaption span { font-size: 12px; color: #777; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .pill { border: 1px solid #d6d6d6; border-radius: 999px; padding: 2px 10px; background: #fff; }
  .radius-grid { display: flex; flex-wrap: wrap; gap: 14px; }
  .radius { margin: 0; display: grid; gap: 6px; font-size: 12px; }
  .radius div { width: 72px; height: 52px; background: #fff; border: 2px solid #9a9a9a; }
  .radius code { display: block; }
  .spaces { display: grid; gap: 6px; }
  .space-row { display: grid; grid-template-columns: 170px 1fr; align-items: center; gap: 12px; }
  .bar { display: block; height: 10px; background: #8f8f8f; border-radius: 2px; max-width: 100%; }
  .elev { width: 220px; height: 90px; background: #fff; border-radius: 12px; display: grid; place-items: center; }
  .kit > input { position: absolute; opacity: 0; pointer-events: none; }
  .kit > label { display: inline-block; margin: 0 6px 12px 0; padding: 4px 14px; border: 1px solid #d0d0d0; border-radius: 999px; background: #fff; cursor: pointer; font-size: 12px; }
  #kit-light:checked + label, #kit-dark:checked + label { background: #1f1f1f; border-color: #1f1f1f; color: #fff; }
  .kit-frame { display: none; width: 100%; height: 760px; border: 1px solid #dedede; border-radius: 12px; background: #fff; }
  #kit-light:checked ~ .kit-light, #kit-dark:checked ~ .kit-dark { display: block; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(input.name)}</h1>
${modules}
</main>
</body>
</html>
`;
}
