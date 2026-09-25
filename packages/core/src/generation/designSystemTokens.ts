// Resolves one design system's tokens into the single token set every
// preview renderer consumes, so built-in and custom design systems differ
// only in where their tokens.css came from, never in how they render.
//
// Per-token precedence (see openspec design-system-preview, "Design System
// Token Resolution"):
//   1. overrideCss — the content overlay's additive tokens.override.css (built-in only)
//   2. tokensCss   — the design system's own tokens.css (upstream's canonical source)
//   3. DESIGN.md   — heuristic, A1-identity colours + fonts only, and only as a
//                    gap filler: measured against all 152 bundled systems these
//                    heuristics match the curated tokens.css only ~⅓ of the time
//   4. the token contract's A2 fallbacks
//   5. the token contract's B-slot aliases (`var(--sibling)`)

import { TOKEN_SCHEMA } from '../vendored/designTokenSchema';
import { renderDesignSystemShowcase } from '../vendored/designSystemShowcase';

export interface ResolveDesignSystemTokensInput {
  designMd: string;
  tokensCss?: string;
  overrideCss?: string;
}

export interface ResolvedDesignSystemTokens {
  /** Final `--name → CSS value` map; values may still contain `var(--…)` references (see resolveTokenValue). */
  tokens: Map<string, string>;
  /** True when the design system has no tokens.css, so identity tokens were guessed from DESIGN.md. */
  approximated: boolean;
  /** Names whose value came from DESIGN.md heuristics. */
  fromDesignMd: string[];
  /** Names whose value came from a contract A2 fallback or B-slot alias. */
  fromDefaults: string[];
  /** Contract names still without a value (A1 tokens have no contract default). */
  missing: string[];
}

const TOKEN_NAME = /^--[a-zA-Z0-9_-]+$/;

/**
 * Whether a CSS value is safe to interpolate into a `<style>` block (and a
 * `style=""` attribute). tokens.css is user-authored for custom systems, so
 * anything that could close the declaration, the rule, or the element is
 * rejected rather than escaped — a token value never legitimately needs it.
 * So is anything that could make the (offline) preview fetch a resource.
 */
export function isSafeCssValue(value: string): boolean {
  if (value.length === 0 || value.length > 500 || /url\(|@import|expression\(/i.test(value)) return false;
  return !/[<>{};"\\]|\/\*|\*\//.test(value.replace(/"[^"<>{};\\]*"/g, ''));
}

/**
 * The declarations of every top-level plain `:root { … }` block, in order,
 * later declarations winning. Declarations nested in other selectors or
 * at-rules (dark-mode `[data-mode="dark"]`, `:root[lang="zh"]`, `@media`)
 * are deliberately ignored: they are variants, not the base token set. A
 * file with no top-level `:root` block falls back to every declaration.
 */
export function parseTokensCss(css: string): Map<string, string> {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rootBodies: string[] = [];
  let depth = 0;
  let selectorStart = 0;
  let bodyStart = -1;
  let selector = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) {
        selector = text.slice(selectorStart, i).trim();
        bodyStart = i + 1;
      }
      depth++;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        if (selector === ':root' && bodyStart >= 0) rootBodies.push(text.slice(bodyStart, i));
        selectorStart = i + 1;
        bodyStart = -1;
      }
    }
  }
  const source = rootBodies.length > 0 ? rootBodies.join('\n') : text;
  const out = new Map<string, string>();
  for (const match of source.matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;{}]+);/g)) {
    const value = match[2].trim().replace(/\s+/g, ' ');
    if (TOKEN_NAME.test(match[1]) && isSafeCssValue(value)) out.set(match[1], value);
  }
  return out;
}

// DESIGN.md heuristics: reuse upstream's own tuned palette/font picks
// verbatim by rendering its showcase once and reading back the `:root`
// custom properties it chose, rather than restructuring vendored code to
// export them. Showcase variable → contract token.
const SHOWCASE_TO_CONTRACT: ReadonlyArray<[string, string]> = [
  ['--bg', '--bg'],
  ['--surface', '--surface'],
  ['--fg', '--fg'],
  ['--muted', '--muted'],
  ['--border', '--border'],
  ['--accent', '--accent'],
  ['--display', '--font-display'],
  ['--body', '--font-body'],
  ['--mono', '--font-mono'],
];

function designMdIdentityTokens(designMd: string): Map<string, string> {
  const html = renderDesignSystemShowcase('design-system', designMd);
  const rootBlock = /:root\s*\{([^}]*)\}/.exec(html)?.[1] ?? '';
  const picked = new Map<string, string>();
  for (const match of rootBlock.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) picked.set(match[1], match[2].trim());
  const out = new Map<string, string>();
  for (const [from, to] of SHOWCASE_TO_CONTRACT) {
    const value = picked.get(from);
    if (value && isSafeCssValue(value)) out.set(to, value);
  }
  return out;
}

export function resolveDesignSystemTokens(input: ResolveDesignSystemTokensInput): ResolvedDesignSystemTokens {
  const tokens = new Map<string, string>(input.tokensCss ? parseTokensCss(input.tokensCss) : []);
  if (input.overrideCss) for (const [name, value] of parseTokensCss(input.overrideCss)) tokens.set(name, value);

  const fromDesignMd: string[] = [];
  const identityNames = new Set(TOKEN_SCHEMA.filter((t) => t.layer === 'A1-identity').map((t) => t.name));
  identityNames.add('--font-mono');
  if ([...identityNames].some((name) => !tokens.has(name))) {
    for (const [name, value] of designMdIdentityTokens(input.designMd)) {
      if (identityNames.has(name) && !tokens.has(name)) {
        tokens.set(name, value);
        fromDesignMd.push(name);
      }
    }
  }

  const fromDefaults: string[] = [];
  for (const spec of TOKEN_SCHEMA) {
    if (spec.layer === 'A2' && spec.fallback && !tokens.has(spec.name)) {
      tokens.set(spec.name, spec.fallback);
      fromDefaults.push(spec.name);
    }
  }
  for (const spec of TOKEN_SCHEMA) {
    if (spec.layer === 'B-slot' && spec.aliasTo && !tokens.has(spec.name)) {
      tokens.set(spec.name, spec.aliasTo);
      fromDefaults.push(spec.name);
    }
  }

  return {
    tokens,
    approximated: input.tokensCss === undefined,
    fromDesignMd,
    fromDefaults,
    missing: TOKEN_SCHEMA.filter((t) => !tokens.has(t.name)).map((t) => t.name),
  };
}

/**
 * A token's value with `var(--x)` / `var(--x, fallback)` references
 * substituted from the same token set (depth-limited, cycle-safe), for
 * renderers that emit it into a document that doesn't declare the rest of
 * the set. Unresolvable references keep their fallback, else stay as-is.
 */
export function resolveTokenValue(tokens: Map<string, string>, name: string, depth = 0): string | undefined {
  const value = tokens.get(name);
  if (value === undefined || depth > 8) return value;
  return value.replace(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^()]*))?\)/g, (whole, ref: string, fallback?: string) => {
    if (ref === name) return fallback?.trim() ?? whole;
    return resolveTokenValue(tokens, ref, depth + 1) ?? fallback?.trim() ?? whole;
  });
}
