// Design system sources other than a rendered page (openspec
// add-brand-from-screenshot-or-css): CSS, a Tailwind config, a W3C design
// tokens file, page source, and the text of a brand guide. Each gives a
// partial draft whose values say how they were found. Roles come only from
// names (a selector such as `body` or `.btn-primary`, a token such as
// `--primary` or `background`), never from guessing; every other colour is a
// candidate. Pure: no network, no browser.

import * as cheerio from 'cheerio';
import postcss from 'postcss';
import { cssColorToHex } from './evidenceToTokens';

/** How a drafted value was found, most trusted first. */
export type SourceConfidence = 'measured' | 'declared' | 'stated' | 'sampled';
export const CONFIDENCE_ORDER: readonly SourceConfidence[] = ['measured', 'declared', 'stated', 'sampled'];

export interface SourceValue {
  value: string;
  /** Where in the source: a selector, a token name, a guide's label, a screenshot region. */
  where: string;
  /** A crop under the evidence bundle (screenshots). */
  crop?: string;
  /** How the value was derived when not as given ("converted from CMYK 100 80 0 30"). */
  note?: string;
}

export interface SourceDraft {
  /** A label for the source: its file name, "pasted CSS", "page source". */
  source: string;
  confidence: SourceConfidence;
  tokens: Record<string, SourceValue>;
  /** Colours found with no role, as `#rrggbb`, with a label when the source gave one. */
  candidates: Array<{ value: string; label?: string }>;
  notes: string[];
  /** Files written into the evidence bundle (template master images), bundle-relative. */
  marks?: string[];
}

export const emptyDraft = (source: string, confidence: SourceConfidence): SourceDraft => ({ source, confidence, tokens: {}, candidates: [], notes: [] });

/** A colour value as `#rrggbb` (hex, rgb(), hsl()); undefined otherwise. */
export function colorToHex(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  const direct = cssColorToHex(v);
  if (direct) return direct.slice(0, 7);
  const hsl = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(v) ?? /^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/.exec(v);
  if (!hsl) return undefined;
  const [h, s, l] = [Number(hsl[1]) / 360, Number(hsl[2]) / 100, Number(hsl[3]) / 100];
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `#${[f(0), f(8), f(4)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

// ── Role names ──

/** Normalised token name → contract token. Only names that say what they are. */
const ROLE_NAMES: Record<string, string> = {
  primary: '--accent',
  brand: '--accent',
  accent: '--accent',
  'brand-primary': '--accent',
  'primary-500': '--accent',
  'primary-default': '--accent',
  'primary-foreground': '--accent-on',
  'on-primary': '--accent-on',
  'primary-contrast': '--accent-on',
  'primary-text': '--accent-on',
  'primary-hover': '--accent-hover',
  'brand-hover': '--accent-hover',
  'primary-active': '--accent-active',
  background: '--bg',
  bg: '--bg',
  'background-primary': '--bg',
  'base-100': '--bg',
  canvas: '--bg',
  foreground: '--fg',
  fg: '--fg',
  text: '--fg',
  'text-primary': '--fg',
  'text-default': '--fg',
  'base-content': '--fg',
  'text-secondary': '--fg-2',
  'foreground-secondary': '--fg-2',
  'muted-foreground': '--muted',
  'text-muted': '--muted',
  'text-tertiary': '--muted',
  'muted-text': '--muted',
  surface: '--surface',
  card: '--surface',
  'background-secondary': '--surface',
  'base-200': '--surface',
  border: '--border',
  divider: '--border',
  'border-default': '--border',
  success: '--success',
  positive: '--success',
  danger: '--danger',
  error: '--danger',
  destructive: '--danger',
  negative: '--danger',
  warning: '--warn',
  warn: '--warn',
  caution: '--warn',
};
const FONT_NAMES: Record<string, string> = {
  sans: '--font-body',
  body: '--font-body',
  'font-body': '--font-body',
  'font-sans': '--font-body',
  base: '--font-body',
  text: '--font-body',
  display: '--font-display',
  heading: '--font-display',
  headings: '--font-display',
  'font-display': '--font-display',
  'font-heading': '--font-display',
  title: '--font-display',
  headline: '--font-display',
  mono: '--font-mono',
  code: '--font-mono',
  'font-mono': '--font-mono',
};

/** A token name without its prefixes (`--color-`, `colors.`, `$`), lower case, dash-separated. */
export function normaliseName(name: string): string {
  return name
    .replace(/^(--|\$|@)/, '')
    .toLowerCase()
    .replace(/[._/\s]+/g, '-')
    .replace(/^(colou?rs?|clr|theme|tw|ds|sys|semantic|brand-colou?r)-/, '')
    .replace(/-(default|base|main|value|DEFAULT)$/i, '');
}

/** The contract token a name says it is, or undefined. Names that are already contract names map to themselves. */
export function roleForName(name: string, kind: 'color' | 'font' = 'color'): string | undefined {
  if (/^--(bg|fg|fg-2|surface|muted|meta|border|border-soft|accent|accent-on|accent-hover|accent-active|success|warn|danger|font-body|font-display|font-mono)$/.test(name)) return name;
  const n = normaliseName(name);
  if (kind === 'font') return FONT_NAMES[n.replace(/^font-family-/, '').replace(/^font-/, 'font-')] ?? FONT_NAMES[n.replace(/^(font|font-family|typography)-/, '')];
  return ROLE_NAMES[n];
}

const GENERIC = /^(serif|sans-serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|cursive)$/i;
/** `"Family", fallback` with a generic family at the end. */
export function fontStackFrom(families: string[] | string): string {
  const list = (Array.isArray(families) ? families : families.split(','))
    .map((f) => f.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
  if (list.length === 0) return '';
  const quoted = list.map((f) => (GENERIC.test(f) || /^-?[a-z-]+$/.test(f) ? f : `"${f}"`));
  if (!list.some((f) => GENERIC.test(f))) quoted.push(/mono|code/i.test(list[0]) ? 'monospace' : /serif|garamond|georgia|times/i.test(list[0]) && !/sans/i.test(list[0]) ? 'serif' : 'sans-serif');
  return quoted.join(', ');
}

// ── CSS ──

/** Custom properties, with var() resolved against each other. */
function resolveVars(props: Map<string, string>, value: string, depth = 0): string {
  if (depth > 6) return value;
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_m, name: string, fallback?: string) => {
    const v = props.get(name);
    return v !== undefined ? resolveVars(props, v, depth + 1) : (fallback ?? '');
  });
}

/** A Tailwind/shadcn-style HSL triple (`222 47% 11%`) or a colour. */
function colorOf(value: string): string | undefined {
  return colorToHex(value) ?? colorToHex(value.replace(/^hsl\(|\)$/g, ''));
}

const PRIMARY_BUTTON = /(^|[\s,])(button|\.btn-primary|\.button-primary|\.btn--primary|\.button--primary|\.cta|\.btn\.primary|\[type="?submit"?\])(?=$|[\s,:.[])/;

/** CSS text: custom properties by name, and `body`, `a`, `h1`/`h2` and primary-button rules. */
export function parseCssSource(css: string, source: string): SourceDraft {
  const draft = emptyDraft(source, 'declared');
  let root: postcss.Root;
  try {
    root = postcss.parse(css);
  } catch (err) {
    draft.notes.push(`${source} couldn't be parsed as CSS (${err instanceof Error ? err.message.split('\n')[0] : String(err)}).`);
    return draft;
  }
  const props = new Map<string, string>();
  const darkProps = new Map<string, string>();
  root.walkDecls(/^--/, (d) => {
    const rule = d.parent?.type === 'rule' ? (d.parent as postcss.Rule).selector : '';
    const atRule = d.parent?.parent?.type === 'atrule' ? (d.parent.parent as postcss.AtRule).params : '';
    const dark = /dark/.test(rule) || /prefers-color-scheme:\s*dark/.test(atRule);
    const target = dark ? darkProps : props;
    if (!target.has(d.prop)) target.set(d.prop, d.value.trim());
  });
  const set = (token: string, value: string | undefined, where: string) => {
    if (!value || draft.tokens[token]) return;
    draft.tokens[token] = { value, where };
  };
  const named = new Set<string>();
  for (const [name, raw] of props) {
    const value = resolveVars(props, raw);
    const fontRole = /font|family|typeface/.test(name) || /^--(sans|serif|display|heading|mono|body)$/.test(name) ? roleForName(name, 'font') : undefined;
    if (fontRole && !colorOf(value)) {
      set(fontRole, fontStackFrom(value), name);
      named.add(name);
      continue;
    }
    const role = roleForName(name);
    const hex = colorOf(value);
    if (role && hex) {
      set(role, hex, name);
      named.add(name);
    }
  }
  // Rules whose selectors name the role.
  root.walkRules((rule) => {
    const sel = rule.selector.trim();
    const decl = (prop: RegExp): string | undefined => {
      let v: string | undefined;
      rule.walkDecls(prop, (d) => {
        v = resolveVars(props, d.value);
      });
      return v;
    };
    if (/(^|,\s*)(body|html|:root)\s*($|,)/.test(sel)) {
      set('--bg', colorOf(decl(/^background(-color)?$/)?.split(/\s+/).find((p) => colorOf(p)) ?? ''), `${sel} background`);
      set('--fg', colorOf(decl(/^color$/) ?? ''), `${sel} color`);
      const ff = decl(/^font-family$/);
      if (ff) set('--font-body', fontStackFrom(ff), `${sel} font-family`);
      const fs = decl(/^font-size$/);
      if (fs && /^\d+(\.\d+)?px$/.test(fs)) set('--text-base', fs, `${sel} font-size`);
    }
    if (/(^|,\s*)(h1|h2|\.h1|\.display|\.heading)\s*($|,)/.test(sel)) {
      const ff = decl(/^font-family$/);
      if (ff) set('--font-display', fontStackFrom(ff), `${sel} font-family`);
    }
    if (PRIMARY_BUTTON.test(sel) && !/:(hover|focus|active|disabled)/.test(sel)) {
      const bg = decl(/^background(-color)?$/);
      const hex = bg ? colorOf(bg.split(/\s+/).find((p) => colorOf(p)) ?? bg) : undefined;
      if (hex) {
        set('--accent', hex, `${sel} background`);
        set('--accent-on', colorOf(decl(/^color$/) ?? ''), `${sel} color`);
        const radius = decl(/^border-radius$/);
        if (radius && /^\d+(\.\d+)?px$/.test(radius)) set('--radius-sm', Number.parseFloat(radius) >= 999 ? 'var(--radius-pill)' : radius, `${sel} border-radius`);
      }
    }
    if (/(^|,\s*)a\s*($|,)/.test(sel)) set('--accent', colorOf(decl(/^color$/) ?? ''), `${sel} color (links)`);
  });
  // Dark theme roles by the same names.
  for (const [name, raw] of darkProps) {
    const role = roleForName(name);
    const hex = colorOf(resolveVars(new Map([...props, ...darkProps]), raw));
    if (role && hex) draft.notes.push(`dark theme: ${role} ${hex} (${name})`);
  }
  // Everything else coloured is a candidate.
  const seen = new Set(Object.values(draft.tokens).map((t) => t.value));
  for (const [name, raw] of props) {
    if (named.has(name)) continue;
    const hex = colorOf(resolveVars(props, raw));
    if (hex && !seen.has(hex)) {
      seen.add(hex);
      draft.candidates.push({ value: hex, label: name });
    }
  }
  root.walkDecls(/color|background|fill|border/, (d) => {
    for (const m of d.value.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi)) {
      const hex = colorOf(m[0]);
      if (hex && !seen.has(hex) && draft.candidates.length < 24) {
        seen.add(hex);
        draft.candidates.push({ value: hex });
      }
    }
  });
  draft.candidates = draft.candidates.slice(0, 24);
  return draft;
}

// ── Tailwind config and token files ──

/** A Tailwind config's `colors` and `fontFamily` keys by name (read as text, never run). */
export function parseTailwindSource(text: string, source: string): SourceDraft {
  const draft = emptyDraft(source, 'declared');
  // key: 'value' pairs, tracking the nearest enclosing key so `primary: { DEFAULT: '#…' }` resolves.
  const stack: string[] = [];
  const re = /(['"]?)([\w-]+)\1\s*:\s*(\{|\[|'[^']*'|"[^"]*"|`[^`]*`)|(\}|\])/g;
  let m: RegExpExecArray | null;
  let inFonts = false;
  while ((m = re.exec(text))) {
    if (m[4]) {
      stack.pop();
      continue;
    }
    const key = m[2];
    const val = m[3];
    if (val === '{' || val === '[') {
      if (val === '[' && stack.includes('fontFamily')) {
        const end = text.indexOf(']', re.lastIndex);
        const families = [...text.slice(re.lastIndex, end).matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]);
        const role = roleForName(key, 'font');
        if (role && families.length && !draft.tokens[role]) draft.tokens[role] = { value: fontStackFrom(families), where: `fontFamily.${key}` };
        re.lastIndex = end + 1;
        continue;
      }
      stack.push(key);
      inFonts = stack.includes('fontFamily');
      continue;
    }
    const value = val.slice(1, -1);
    if (inFonts) continue;
    const hex = colorOf(value);
    if (!hex) continue;
    const parent = stack[stack.length - 1];
    const name = /^(DEFAULT|default|500|600)$/.test(key) && parent && parent !== 'colors' && parent !== 'extend' ? parent : `${parent && parent !== 'colors' && parent !== 'extend' ? `${parent}-` : ''}${key}`;
    const role = roleForName(name);
    if (role && !draft.tokens[role]) draft.tokens[role] = { value: hex, where: `colors.${name}` };
    else if (!draft.candidates.some((c) => c.value === hex)) draft.candidates.push({ value: hex, label: `colors.${name}` });
  }
  draft.candidates = draft.candidates.slice(0, 24);
  return draft;
}

/** A W3C design tokens file (`$value`/`$type`), or a plain nested JSON of tokens. */
export function parseTokensJsonSource(json: unknown, source: string): SourceDraft {
  const draft = emptyDraft(source, 'declared');
  const flat = new Map<string, { value: unknown; type?: string }>();
  const walk = (node: unknown, pathParts: string[], inheritedType?: string) => {
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    const type = typeof o.$type === 'string' ? o.$type : typeof o.type === 'string' ? o.type : inheritedType;
    if ('$value' in o || ('value' in o && typeof o.value !== 'object')) {
      flat.set(pathParts.join('.'), { value: o.$value ?? o.value, type });
      return;
    }
    for (const [k, v] of Object.entries(o)) if (!k.startsWith('$')) walk(v, [...pathParts, k], type);
  };
  walk(json, []);
  const resolve = (v: unknown, depth = 0): unknown => {
    if (typeof v === 'string' && /^\{[^}]+\}$/.test(v) && depth < 6) return resolve(flat.get(v.slice(1, -1))?.value, depth + 1);
    return v;
  };
  for (const [name, { value, type }] of flat) {
    const v = resolve(value);
    const leaf = name.split('.').slice(-2).join('-');
    const last = name.split('.').pop() ?? name;
    if (type === 'fontFamily' || /font-?family|typeface/i.test(name)) {
      const role = roleForName(last, 'font') ?? roleForName(leaf, 'font');
      const families = Array.isArray(v) ? (v as string[]) : typeof v === 'string' ? v : undefined;
      if (role && families && !draft.tokens[role]) draft.tokens[role] = { value: fontStackFrom(families), where: name };
      continue;
    }
    if (typeof v !== 'string') continue;
    const hex = colorOf(v);
    if (!hex) continue;
    const role = roleForName(leaf) ?? roleForName(last) ?? roleForName(name.split('.').slice(-3).join('-'));
    if (role && !draft.tokens[role]) draft.tokens[role] = { value: hex, where: name };
    else if (!draft.candidates.some((c) => c.value === hex)) draft.candidates.push({ value: hex, label: name });
  }
  draft.candidates = draft.candidates.slice(0, 24);
  return draft;
}

/** CSS, a Tailwind config or a token file, told apart by content. */
export function parseStyleSource(text: string, source: string): SourceDraft {
  const t = text.trim();
  if (/^[{[]/.test(t)) {
    try {
      return parseTokensJsonSource(JSON.parse(t), source);
    } catch {
      // Not JSON: fall through to CSS.
    }
  }
  if (/module\.exports|export\s+default|satisfies\s+Config|theme\s*:\s*\{/.test(t) && !/^[^{]*\{[^}]*:[^}]*;/.test(t.slice(0, 200))) return parseTailwindSource(t, source);
  return parseCssSource(t, source);
}

// ── HTML ──

/** Page source: its `<style>` blocks and inline styles as CSS, and the Google Fonts it links. */
export function parseHtmlSource(html: string, source: string): SourceDraft & { stylesheets: string[] } {
  const $ = cheerio.load(html);
  const css = [
    ...$('style')
      .toArray()
      .map((el) => $(el).text()),
    ...$('[style]')
      .toArray()
      .slice(0, 400)
      .map((el) => `${el.tagName === 'body' ? 'body' : el.tagName === 'button' ? 'button' : `.x-${el.tagName}`} { ${$(el).attr('style')} }`),
  ].join('\n');
  const draft = parseCssSource(css, source);
  const stylesheets = $('link[rel~="stylesheet"]')
    .toArray()
    .map((el) => $(el).attr('href') ?? '')
    .filter(Boolean);
  const google = stylesheets.filter((h) => /fonts\.googleapis\.com/.test(h));
  const families = google.flatMap((h) => [...decodeURIComponent(h).matchAll(/family=([^:&]+)/g)].map((m) => m[1].replace(/\+/g, ' ')));
  if (families.length > 0) {
    draft.notes.push(`Google Fonts linked: ${families.join(', ')}.`);
    if (!draft.tokens['--font-body']) draft.tokens['--font-body'] = { value: fontStackFrom(families[families.length > 1 ? 1 : 0]), where: 'Google Fonts link' };
    if (!draft.tokens['--font-display'] && families.length > 1) draft.tokens['--font-display'] = { value: fontStackFrom(families[0]), where: 'Google Fonts link' };
  }
  const theme = $('meta[name="theme-color"]').attr('content');
  const hex = theme ? colorOf(theme) : undefined;
  if (hex && !draft.candidates.some((c) => c.value === hex) && !Object.values(draft.tokens).some((t) => t.value === hex)) draft.candidates.unshift({ value: hex, label: 'theme-color' });
  return { ...draft, stylesheets: stylesheets.filter((h) => !/fonts\.googleapis\.com/.test(h)) };
}

// ── Brand guide ──

/** CMYK (0–100) to sRGB, the uncalibrated formula: approximate, and labelled as converted. */
export function cmykToHex(c: number, m: number, y: number, k: number): string {
  const ch = (x: number) => Math.round(255 * (1 - x / 100) * (1 - k / 100));
  return `#${[ch(c), ch(m), ch(y)].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('')}`;
}

const LABEL_ROLES: Array<[RegExp, string]> = [
  [/\bprimary\b|\bbrand colou?r\b|\bmain colou?r\b/i, '--accent'],
  [/\bbackground\b|\bpaper\b|\bcanvas\b/i, '--bg'],
  [/\b(body )?text\b|\bink\b|\bforeground\b/i, '--fg'],
  [/\bsuccess\b/i, '--success'],
  [/\b(error|danger|alert)\b/i, '--danger'],
  [/\bwarning\b/i, '--warn'],
];

/**
 * A brand guide's text (from read_open_design_source): colour codes with the
 * label near them, and font names. Primary, Background and Text labels map to
 * roles; Secondary and the rest are candidates.
 */
export function parseBrandGuideText(text: string, source: string): SourceDraft {
  const draft = emptyDraft(source, 'stated');
  // Markdown punctuation out, but a # before a colour code stays.
  const lines = text.split('\n').map((l) => l.replace(/^#+\s/, ' ').replace(/[*_`|>]|#(?![0-9a-f]{3}\b|[0-9a-f]{6}\b)/gi, ' ').replace(/\s+/g, ' ').trim());
  let label = '';
  let labelAge = 99;
  const found: Array<{ label: string; hex: string; note?: string; pantone?: string }> = [];
  for (const line of lines) {
    if (!line) continue;
    const hex = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(line)?.[0];
    const rgb = /\bRGB\b\s*:?\s*(\d{1,3})[\s,/]+(\d{1,3})[\s,/]+(\d{1,3})/i.exec(line) ?? /\bR\s*(\d{1,3})\s*G\s*(\d{1,3})\s*B\s*(\d{1,3})\b/.exec(line);
    const cmyk = /\bCMYK\b\s*:?\s*(\d{1,3})[\s,/%]+(\d{1,3})[\s,/%]+(\d{1,3})[\s,/%]+(\d{1,3})/i.exec(line) ?? /\bC\s*(\d{1,3})\s*M\s*(\d{1,3})\s*Y\s*(\d{1,3})\s*K\s*(\d{1,3})\b/.exec(line);
    const pantone = /\b(?:Pantone|PMS)\s*([0-9]{2,4}\s?[A-Z]{0,2}|[A-Z][a-z]+(?: [A-Z][a-z]+)?\s?C?)\b/.exec(line)?.[0];
    const before = line.split(/#[0-9a-f]{3,6}|\bRGB\b|\bCMYK\b|\bPantone\b|\bPMS\b|\bHEX\b|\bR\s*\d/i)[0].replace(/[:\-–—]+\s*$/, '').trim();
    if (!hex && !rgb && !cmyk && !pantone) {
      if (line.length <= 48 && !/[.!?]$/.test(line)) {
        label = line;
        labelAge = 0;
      } else labelAge++;
      continue;
    }
    const lab = before.length >= 2 ? before : labelAge <= 3 ? label : '';
    labelAge++;
    let value: string | undefined;
    let note: string | undefined;
    if (hex) value = colorToHex(hex);
    else if (rgb) value = colorToHex(`rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})`);
    else if (cmyk) {
      value = cmykToHex(Number(cmyk[1]), Number(cmyk[2]), Number(cmyk[3]), Number(cmyk[4]));
      note = `converted from CMYK ${cmyk[1]} ${cmyk[2]} ${cmyk[3]} ${cmyk[4]}`;
    }
    if (!value) {
      if (pantone) draft.notes.push(`${lab || 'A colour'} is given only as ${pantone}: Pantone values aren't converted. Ask for its hex or RGB value.`);
      continue;
    }
    const existing = found.find((f) => f.label === lab && lab);
    if (existing) {
      // A hex code beats a converted CMYK value for the same label.
      if (existing.note && !note) Object.assign(existing, { hex: value, note: undefined });
      continue;
    }
    found.push({ label: lab, hex: value, note, pantone });
  }
  for (const f of found) {
    const role = f.label && !/\bsecondary\b|\btertiary\b/i.test(f.label) ? LABEL_ROLES.find(([re]) => re.test(f.label))?.[1] : undefined;
    const where = f.label ? `"${f.label}"${f.pantone ? ` (${f.pantone})` : ''}` : 'unlabelled colour';
    if (role && !draft.tokens[role]) draft.tokens[role] = { value: f.hex, where, ...(f.note ? { note: f.note } : {}) };
    else draft.candidates.push({ value: f.hex, label: f.label || undefined });
  }
  // Fonts: "Primary typeface: X", "Headings: X", "Body copy — X".
  for (const line of lines) {
    const k = /\b(primary typeface|secondary typeface|typeface|font|headings?|headlines?|display|body(?: copy| text)?)\b[^:–—-]{0,20}[:–—-]\s*/i.exec(line);
    const f = k ? /^([A-Z][A-Za-z0-9]+(?: [A-Z][A-Za-z0-9]+){0,3})/.exec(line.slice(k.index + k[0].length)) : null;
    if (!k || !f) continue;
    const m = [k[0], k[1], f[1]];
    const family = m[2].replace(/\s+(Regular|Bold|Light|Medium|Semibold|Black|Italic)$/i, '').trim();
    if (/^(The|This|Our|Use|Always|Never)$/.test(family.split(' ')[0])) continue;
    const role = /head|display|primary typeface/i.test(m[1]) ? '--font-display' : /body|secondary typeface/i.test(m[1]) ? '--font-body' : undefined;
    if (role && !draft.tokens[role]) draft.tokens[role] = { value: fontStackFrom(family), where: `"${m[1]}"` };
    else if (!role && !draft.tokens['--font-body']) draft.tokens['--font-body'] = { value: fontStackFrom(family), where: `"${m[1]}"` };
  }
  if (draft.tokens['--font-display'] && !draft.tokens['--font-body']) draft.tokens['--font-body'] = { ...draft.tokens['--font-display'], note: 'the guide names one typeface' };
  draft.candidates = draft.candidates.slice(0, 24);
  return draft;
}
