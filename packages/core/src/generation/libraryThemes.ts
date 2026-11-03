// Maps a design system's resolved tokens onto a component library's theme by
// a fixed table (openspec add-component-library-port, "Theme From Design
// System Tokens"). Pure: the same tokens and library always give the same
// theme, so every agent and model starts its component set from identical
// colours, type and shape instead of each re-deriving them from tokens.css.

import { formatColor, parseColor, relativeLuminance, resolveColorValue } from './colorMix';
import { resolveTokenValue } from './designSystemTokens';

export const COMPONENT_LIBRARIES = ['mui', 'shadcn', 'nativewind'] as const;
export type ComponentLibrary = (typeof COMPONENT_LIBRARIES)[number];

export interface UnmappedToken {
  token: string;
  value: string;
  suggestion: string;
}

export interface MuiThemeOptions {
  palette: Record<string, unknown>;
  typography: Record<string, unknown>;
  shape?: { borderRadius: number };
  spacing?: number;
}

export interface LibraryTheme {
  library: ComponentLibrary;
  /** `light` or `dark`, from `--bg`'s luminance. */
  mode: 'light' | 'dark';
  /** MUI only: the `createTheme` options object. */
  mui?: MuiThemeOptions;
  /** shadcn only: CSS variable → hex (or a length for `--radius`). */
  cssVars?: Record<string, string>;
  /** shadcn only: the same colours as bare HSL triplets, for apps whose globals.css uses `hsl(var(--x))`. */
  cssVarsHsl?: Record<string, string>;
  /** nativewind only: the other colour scheme's HSL triplets, and whether the kit derived them (openspec add-expo-nativewind-target). */
  otherScheme?: { mode: 'light' | 'dark'; cssVarsHsl: Record<string, string>; derived: boolean };
  /** nativewind only: the tailwind.config.js `theme.extend` source. */
  tailwindExtend?: string;
  /** Ready-to-paste source for the theme file. */
  code: string;
  /** Contract tokens the library has no slot for, with where they could go. */
  unmapped: UnmappedToken[];
}

type Tokens = Map<string, string>;

function colorOf(tokens: Tokens, name: string): string | undefined {
  const value = tokens.get(name);
  if (value === undefined) return undefined;
  return resolveColorValue(value, (ref) => tokens.get(`--${ref}`));
}

function firstColor(tokens: Tokens, names: string[]): string | undefined {
  for (const name of names) {
    const c = colorOf(tokens, name);
    if (c) return c;
  }
  return undefined;
}

function plainValue(tokens: Tokens, name: string): string | undefined {
  const v = resolveTokenValue(tokens, name);
  return v && !v.includes('var(') ? v : undefined;
}

/** A px or rem length as a number of pixels (rem at 16px); undefined for anything else. */
export function lengthToPx(value: string | undefined): number | undefined {
  const m = /^(-?\d*\.?\d+)\s*(px|rem)?$/.exec((value ?? '').trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  return m[2] === 'rem' ? n * 16 : n;
}

function themeMode(tokens: Tokens): 'light' | 'dark' {
  const bg = colorOf(tokens, '--bg');
  const lum = bg ? relativeLuminance(bg) : undefined;
  return lum !== undefined && lum < 0.18 ? 'dark' : 'light';
}

function hslTriplet(color: string): string | undefined {
  const c = parseColor(color);
  if (!c) return undefined;
  const { r, g, b } = c;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const round = (x: number) => Math.round(x * 10) / 10;
  return `${round(h)} ${round(s * 100)}% ${round(l * 100)}%`;
}

const MUI_HEADINGS: ReadonlyArray<[string, string]> = [
  ['h1', '--text-4xl'],
  ['h2', '--text-3xl'],
  ['h3', '--text-2xl'],
  ['h4', '--text-xl'],
  ['h5', '--text-lg'],
  ['h6', '--text-base'],
];

const MUI_BODY: ReadonlyArray<[string, string]> = [
  ['body1', '--text-base'],
  ['body2', '--text-sm'],
  ['caption', '--text-xs'],
];

function unmappedSuggestion(library: ComponentLibrary, token: string): string {
  if (library === 'nativewind') {
    if (token.startsWith('--elev-')) return '`shadow-*` (iOS) and `elevation-*` (Android) utilities in the theme extension';
    if (token.startsWith('--motion-') || token.startsWith('--ease-')) return 'react-native-reanimated durations and easings (NativeWind transitions are limited)';
    if (token === '--focus-ring') return 'a focused border colour on TextInput (no focus rings on touch)';
  }
  if (token.startsWith('--elev-')) return library === 'mui' ? 'MUI `shadows` (e.g. index 1 to 3) or a `boxShadow` in component styleOverrides' : 'Tailwind `boxShadow` in the theme extension';
  if (token.startsWith('--motion-') || token.startsWith('--ease-')) return library === 'mui' ? 'MUI `transitions.duration` / `transitions.easing`' : 'Tailwind `transitionDuration` / `transitionTimingFunction`';
  if (token === '--focus-ring') return library === 'mui' ? 'a `:focus-visible` box-shadow in `MuiButtonBase` styleOverrides' : 'a `focus-visible:shadow-[…]` utility or the `ring` utilities';
  if (token.startsWith('--font-')) return library === 'mui' ? '`typography` (a variant that needs this family)' : 'Tailwind `fontFamily` in the theme extension';
  if (token.startsWith('--text-') || token.startsWith('--leading-') || token.startsWith('--tracking-')) return library === 'mui' ? 'a `typography` variant' : 'Tailwind `fontSize` / `lineHeight` / `letterSpacing`';
  if (token.startsWith('--space-') || token.startsWith('--section-') || token.startsWith('--container-')) return library === 'mui' ? 'multiples of `theme.spacing`, or layout props' : 'Tailwind `spacing` / `maxWidth` in the theme extension';
  if (token.startsWith('--radius-')) return library === 'mui' ? 'a `borderRadius` in the component that needs it' : 'Tailwind `borderRadius` (`calc(var(--radius) ± …)`)';
  return 'a CSS custom property in the global stylesheet, read where needed';
}

function collectUnmapped(tokens: Tokens, used: Set<string>, library: ComponentLibrary): UnmappedToken[] {
  const out: UnmappedToken[] = [];
  for (const name of [...tokens.keys()].sort()) {
    if (used.has(name)) continue;
    const value = colorOf(tokens, name) ?? resolveTokenValue(tokens, name) ?? tokens.get(name) ?? '';
    out.push({ token: name, value, suggestion: unmappedSuggestion(library, name) });
  }
  return out;
}

function muiTheme(tokens: Tokens): LibraryTheme {
  const used = new Set<string>();
  const take = (name: string) => used.add(name);
  const mode = themeMode(tokens);
  const palette: Record<string, unknown> = { mode };

  const accent = colorOf(tokens, '--accent');
  if (accent) {
    take('--accent');
    const primary: Record<string, string> = { main: accent };
    const on = colorOf(tokens, '--accent-on');
    if (on) {
      primary.contrastText = on;
      take('--accent-on');
    }
    const hover = colorOf(tokens, '--accent-hover');
    if (hover) {
      primary.dark = hover;
      take('--accent-hover');
    }
    palette.primary = primary;
  }
  const background: Record<string, string> = {};
  const bg = colorOf(tokens, '--bg');
  if (bg) {
    background.default = bg;
    take('--bg');
  }
  const surface = colorOf(tokens, '--surface');
  if (surface) {
    background.paper = surface;
    take('--surface');
  }
  if (Object.keys(background).length) palette.background = background;

  const text: Record<string, string> = {};
  const fg = colorOf(tokens, '--fg');
  if (fg) {
    text.primary = fg;
    take('--fg');
  }
  const fg2 = colorOf(tokens, '--fg-2');
  const muted = colorOf(tokens, '--muted');
  if (fg2) {
    text.secondary = fg2;
    take('--fg-2');
  }
  else if (muted) text.secondary = muted;
  if (muted) {
    text.disabled = muted;
    take('--muted');
  }
  if (Object.keys(text).length) palette.text = text;

  const border = colorOf(tokens, '--border');
  if (border) {
    palette.divider = border;
    take('--border');
  }
  for (const [key, name] of [['error', '--danger'], ['warning', '--warn'], ['success', '--success']] as const) {
    const c = colorOf(tokens, name);
    if (c) {
      palette[key] = { main: c };
      take(name);
    }
  }

  const typography: Record<string, unknown> = {};
  const body = plainValue(tokens, '--font-body');
  if (body) {
    typography.fontFamily = body;
    take('--font-body');
  }
  const display = plainValue(tokens, '--font-display');
  if (display) take('--font-display');
  const tight = plainValue(tokens, '--leading-tight');
  if (tight) take('--leading-tight');
  const leading = plainValue(tokens, '--leading-body');
  if (leading) take('--leading-body');
  for (const [variant, size] of MUI_HEADINGS) {
    const style: Record<string, unknown> = {};
    if (display) style.fontFamily = display;
    const v = plainValue(tokens, size);
    if (v) {
      style.fontSize = v;
      take(size);
    }
    if (tight) style.lineHeight = tight;
    if (Object.keys(style).length) typography[variant] = style;
  }
  for (const [variant, size] of MUI_BODY) {
    const style: Record<string, unknown> = {};
    const v = plainValue(tokens, size);
    if (v) {
      style.fontSize = v;
      take(size);
    }
    if (leading) style.lineHeight = leading;
    if (Object.keys(style).length) typography[variant] = style;
  }

  const theme: MuiThemeOptions = { palette, typography };
  const radius = lengthToPx(plainValue(tokens, '--radius-md'));
  if (radius !== undefined) {
    theme.shape = { borderRadius: radius };
    take('--radius-md');
  }
  const space = lengthToPx(plainValue(tokens, '--space-1'));
  if (space !== undefined) {
    theme.spacing = space;
    take('--space-1');
  }

  const code = [
    "import { createTheme } from '@mui/material/styles';",
    '',
    '// Generated from the Open Design design system tokens. Material 3 roles:',
    '// primary = --accent, on-primary = --accent-on, surface = --bg, surface-container = --surface,',
    '// on-surface = --fg, on-surface-variant = --fg-2, outline = --border, error = --danger.',
    `export const theme = createTheme(${JSON.stringify(theme, null, 2)});`,
    '',
  ].join('\n');
  return { library: 'mui', mode, mui: theme, code, unmapped: collectUnmapped(tokens, used, 'mui') };
}

// shadcn variable → contract tokens tried in order. shadcn's `--muted`,
// `--secondary` and `--accent` are background tints and `--muted-foreground`
// is the quiet text colour, so the contract's `--muted` (a text colour)
// lands on `--muted-foreground`, not on `--muted`.
const SHADCN_COLORS: ReadonlyArray<[string, string[]]> = [
  ['--background', ['--bg']],
  ['--foreground', ['--fg']],
  ['--card', ['--surface', '--bg']],
  ['--card-foreground', ['--fg']],
  ['--popover', ['--surface', '--bg']],
  ['--popover-foreground', ['--fg']],
  ['--primary', ['--accent']],
  ['--primary-foreground', ['--accent-on']],
  ['--secondary', ['--surface-warm', '--surface']],
  ['--secondary-foreground', ['--fg']],
  ['--muted', ['--surface-warm', '--surface']],
  ['--muted-foreground', ['--muted', '--fg-2']],
  ['--accent', ['--surface-warm', '--surface']],
  ['--accent-foreground', ['--fg']],
  ['--destructive', ['--danger']],
  ['--border', ['--border']],
  ['--input', ['--border']],
  ['--ring', ['--accent']],
];

function shadcnTheme(tokens: Tokens): LibraryTheme {
  const used = new Set<string>();
  const mode = themeMode(tokens);
  const cssVars: Record<string, string> = {};
  const cssVarsHsl: Record<string, string> = {};
  for (const [variable, sources] of SHADCN_COLORS) {
    const source = sources.find((name) => colorOf(tokens, name) !== undefined);
    if (!source) continue;
    const color = colorOf(tokens, source)!;
    used.add(source);
    const opaque = parseColor(color);
    cssVars[variable] = opaque ? formatColor({ ...opaque, a: 1 }) : color;
    const hsl = hslTriplet(color);
    if (hsl) cssVarsHsl[variable] = hsl;
  }
  const radius = plainValue(tokens, '--radius-md');
  if (radius) {
    cssVars['--radius'] = radius;
    cssVarsHsl['--radius'] = radius;
    used.add('--radius-md');
  }
  const block = (vars: Record<string, string>) => Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  const code = [
    '/* Generated from the Open Design design system tokens. Paste into the app\'s global stylesheet,',
    '   replacing the :root block shadcn init wrote. Use the HSL block instead if the app\'s',
    '   tailwind config reads colours as hsl(var(--x)). */',
    ':root {',
    block(cssVars),
    '}',
    '',
    '/* HSL triplet form */',
    ':root {',
    block(cssVarsHsl),
    '}',
    '',
  ].join('\n');
  return { library: 'shadcn', mode, cssVars, cssVarsHsl, code, unmapped: collectUnmapped(tokens, used, 'shadcn') };
}

/** Variables whose lightness flips between schemes; the brand colours keep theirs. */
const NEUTRAL_VARS = new Set(['--background', '--foreground', '--card', '--card-foreground', '--popover', '--popover-foreground', '--secondary', '--secondary-foreground', '--muted', '--muted-foreground', '--accent', '--accent-foreground', '--border', '--input']);

/** The other colour scheme from one HSL set: neutrals mirror their lightness, brand colours stay. Deterministic. */
export function deriveOtherScheme(hsl: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(hsl)) {
    const m = /^([\d.]+) ([\d.]+)% ([\d.]+)%$/.exec(v);
    if (!m || !NEUTRAL_VARS.has(k)) {
      out[k] = v;
      continue;
    }
    const l = Number(m[3]);
    // Mirror, then pull towards the middle a little so dark backgrounds aren't pure black.
    const mirrored = Math.round((100 - l) * 10) / 10;
    const softened = k === '--background' || k === '--card' || k === '--popover' ? Math.max(mirrored, 6) : mirrored;
    out[k] = `${m[1]} ${m[2]}% ${softened}%`;
  }
  return out;
}

// NativeWind's Tailwind theme: the shadcn variable names (react-native-reusables uses them too), read as hsl(var(--x)).
const NATIVEWIND_COLOR_KEYS: ReadonlyArray<[string, string]> = [
  ['background', '--background'],
  ['foreground', '--foreground'],
  ['card', '--card'],
  ['card-foreground', '--card-foreground'],
  ['popover', '--popover'],
  ['popover-foreground', '--popover-foreground'],
  ['primary', '--primary'],
  ['primary-foreground', '--primary-foreground'],
  ['secondary', '--secondary'],
  ['secondary-foreground', '--secondary-foreground'],
  ['muted', '--muted'],
  ['muted-foreground', '--muted-foreground'],
  ['accent', '--accent'],
  ['accent-foreground', '--accent-foreground'],
  ['destructive', '--destructive'],
  ['border', '--border'],
  ['input', '--input'],
  ['ring', '--ring'],
];

function nativewindTheme(tokens: Tokens, dark?: Tokens): LibraryTheme {
  const base = shadcnTheme(tokens);
  const used = new Set<string>(tokens.keys());
  for (const u of base.unmapped) used.delete(u.token);
  const hsl = { ...base.cssVarsHsl! };
  const radius = hsl['--radius'];
  delete hsl['--radius'];
  const darkHsl = dark && hasThemeTokens(dark) ? Object.fromEntries(Object.entries(shadcnTheme(dark).cssVarsHsl!).filter(([k]) => k !== '--radius')) : undefined;
  const otherMode = base.mode === 'light' ? 'dark' : 'light';
  const other = { mode: otherMode as 'light' | 'dark', cssVarsHsl: darkHsl ?? deriveOtherScheme(hsl), derived: !darkHsl };
  const colors = NATIVEWIND_COLOR_KEYS.filter(([, v]) => hsl[v] !== undefined).map(([k, v]) => `        '${k}': 'hsl(var(${v}))',`);
  const fonts: string[] = [];
  for (const [key, token] of [['sans', '--font-body'], ['display', '--font-display'], ['mono', '--font-mono']] as const) {
    const v = plainValue(tokens, token);
    if (!v) continue;
    // React Native takes one loaded family name, not a CSS stack: the first family.
    const family = v.split(',')[0].trim().replace(/^["']|["']$/g, '');
    fonts.push(`        ${key}: ['${family.replace(/'/g, "\\'")}'],`);
    used.add(token);
  }
  const tailwindExtend = [
    '  theme: {',
    '    extend: {',
    '      colors: {',
    ...colors,
    '      },',
    ...(radius ? ["      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },"] : []),
    ...(fonts.length ? ['      fontFamily: {', ...fonts, '      },'] : []),
    '    },',
    '  },',
  ].join('\n');
  const block = (vars: Record<string, string>) => Object.entries(vars).map(([k, v]) => `    ${k}: ${v};`).join('\n');
  const lightVars = base.mode === 'light' ? hsl : other.cssVarsHsl;
  const darkVars = base.mode === 'dark' ? hsl : other.cssVarsHsl;
  const code = [
    '/* global.css: generated from the Open Design design system tokens (NativeWind reads these variables).',
    other.derived ? `   The ${otherMode} scheme is DERIVED by the kit (neutrals mirrored); replace it with designed values when you have them. */` : '   Both schemes come from the design system. */',
    '@tailwind base;',
    '@tailwind components;',
    '@tailwind utilities;',
    '',
    '@layer base {',
    '  :root {',
    block(lightVars),
    ...(radius ? [`    --radius: ${radius};`] : []),
    '  }',
    '',
    '  .dark:root {',
    block(darkVars),
    '  }',
    '}',
    '',
  ].join('\n');
  return { library: 'nativewind', mode: base.mode, cssVars: base.cssVars, cssVarsHsl: base.cssVarsHsl, otherScheme: other, tailwindExtend, code, unmapped: collectUnmapped(tokens, used, 'nativewind') };
}

/** The library theme for a resolved token set (`--name → value`, as `resolveDesignSystemTokens` returns). `dark` is the design system's dark tokens, when it has them (NativeWind only). */
export function buildLibraryTheme(tokens: Tokens, library: ComponentLibrary, dark?: Tokens): LibraryTheme {
  if (library === 'nativewind') return nativewindTheme(tokens, dark);
  return library === 'mui' ? muiTheme(tokens) : shadcnTheme(tokens);
}

const CONTRACT_COLOR_NAMES = ['--bg', '--fg', '--accent'];

/** Whether a token map (e.g. a page's own `:root`) uses enough of the contract names to theme from. */
export function hasThemeTokens(tokens: Tokens): boolean {
  return CONTRACT_COLOR_NAMES.every((name) => colorOf(tokens, name) !== undefined);
}

/** The dark tokens in a tokens.css (a `.dark`, `[data-mode="dark"]` or `[data-theme="dark"]` block, or a prefers-color-scheme: dark media block) over `base`; undefined when it has none. */
export function darkTokensOf(tokensCss: string | undefined, base: Tokens): Tokens | undefined {
  if (!tokensCss) return undefined;
  const css = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const bodies: string[] = [];
  for (const m of css.matchAll(/@media[^{]*prefers-color-scheme\s*:\s*dark[^{]*\{\s*[^{}]*\{([^{}]*)\}/gi)) bodies.push(m[1]);
  for (const m of css.matchAll(/(?:^|\})\s*([^{}@]*(?:\.dark\b|data-(?:mode|theme|color-scheme)\s*=\s*["']?dark)[^{}]*)\{([^{}]*)\}/gi)) bodies.push(m[2]);
  if (bodies.length === 0) return undefined;
  const out = new Map(base);
  let found = false;
  for (const body of bodies) {
    for (const d of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) {
      out.set(d[1], d[2].trim());
      found = true;
    }
  }
  return found ? out : undefined;
}
