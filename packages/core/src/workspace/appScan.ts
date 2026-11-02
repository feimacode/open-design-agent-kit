// What an existing app already has, for designs that should look like it
// (openspec add-design-from-app): framework and styling, tokens with the file
// and line they come from (Tailwind theme, CSS variables including
// [data-theme] and .dark blocks, MUI createTheme), an inventory of exported
// components with their variant props, and file routes. Deterministic and
// read-only: bounded to 2,000 files and 1 MB of reads, never opens .env*
// files, and never writes. The agent decides what matters.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { parse as babelParse } from '@babel/parser';
import postcss from 'postcss';

export const APP_SCAN_MAX_FILES = 2000;
export const APP_SCAN_MAX_BYTES = 1024 * 1024;
const MAX_FILE_BYTES = 200 * 1024;
const MAX_COMPONENTS = 120;
const MAX_ROUTES = 200;
const MAX_TOKENS = 400;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.expo', '.turbo', '.cache', 'coverage', '.open-design', '.vercel', '.svelte-kit', 'storybook-static', 'android', 'ios', 'Pods']);
const CODE = /\.(?:tsx|jsx|ts|js|mjs|cjs)$/;
const STYLE = /\.(?:css|scss|pcss)$/;

export interface AppToken {
  /** CSS variable (`--brand-600`) or Tailwind/MUI path (`colors.brand.600`). */
  name: string;
  value: string;
  /** Workspace-relative file and 1-based line. */
  source: string;
  /** The theme the value belongs to: "light" (default), "dark" or a [data-theme] name. */
  theme?: string;
  kind: 'color' | 'font' | 'radius' | 'spacing' | 'shadow' | 'other';
}

export interface AppComponent {
  name: string;
  /** Workspace-relative file. */
  file: string;
  /** Union props with their values, e.g. { variant: ['default','outline'], size: ['sm','lg'] }. */
  variants: Record<string, string[]>;
  /** Other props known from the type, by name. */
  props: string[];
  /** Files that import it. */
  imports: number;
  hasStory?: boolean;
}

export interface AppRoute {
  path: string;
  file: string;
  router: 'next-app' | 'next-pages' | 'expo-router' | 'react-router';
}

export interface AppProfile {
  found: boolean;
  root: string;
  frameworks: string[];
  styling: string[];
  tokens: AppToken[];
  themes: string[];
  components: AppComponent[];
  routes: AppRoute[];
  filesSeen: number;
  bytesRead: number;
  /** True when a bound stopped the scan early. */
  truncated: boolean;
  notes: string[];
}

const FRAMEWORKS: Record<string, string> = { next: 'Next.js', react: 'React', 'react-native': 'React Native', expo: 'Expo', vue: 'Vue', nuxt: 'Nuxt', svelte: 'Svelte', '@angular/core': 'Angular', astro: 'Astro', 'solid-js': 'Solid', vite: 'Vite' };
const STYLING: Record<string, string> = { tailwindcss: 'Tailwind', '@mui/material': 'MUI', nativewind: 'NativeWind', 'styled-components': 'styled-components', '@emotion/react': 'Emotion', '@chakra-ui/react': 'Chakra UI', 'class-variance-authority': 'cva', sass: 'Sass', '@vanilla-extract/css': 'vanilla-extract' };

export function tokenKind(name: string, value: string): AppToken['kind'] {
  const n = name.toLowerCase();
  if (/colou?r|bg|background|foreground|border|ring|primary|secondary|accent|muted|destructive|brand|palette|surface|text-/.test(n) || /^#|^rgb|^hsl|^oklch|^oklab|^color\(/i.test(value) || /^\d+(?:\.\d+)?%?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%$/.test(value)) return 'color';
  if (/font|family|typeface/.test(n)) return 'font';
  if (/radius|rounded/.test(n)) return 'radius';
  if (/shadow|elevation/.test(n)) return 'shadow';
  if (/space|spacing|gap|size|width|height/.test(n)) return 'spacing';
  return 'other';
}

interface Budget {
  bytes: number;
  truncated: boolean;
  cache: Map<string, string>;
}

async function readBounded(abs: string, budget: Budget): Promise<string | undefined> {
  if (/(^|[\\/])\.env(\.|$)/.test(abs)) return undefined;
  const cached = budget.cache.get(abs);
  if (cached !== undefined) return cached;
  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return undefined;
    if (budget.bytes + stat.size > APP_SCAN_MAX_BYTES) {
      budget.truncated = true;
      return undefined;
    }
    budget.bytes += stat.size;
    const text = await fs.readFile(abs, 'utf8');
    budget.cache.set(abs, text);
    return text;
  } catch {
    return undefined;
  }
}

async function listFiles(root: string): Promise<{ files: string[]; truncated: boolean }> {
  const files: string[] = [];
  let truncated = false;
  const walk = async (dir: string): Promise<void> => {
    if (files.length >= APP_SCAN_MAX_FILES) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (e.name.startsWith('.env')) continue;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || (e.name.startsWith('.') && e.name !== '.storybook')) continue;
        await walk(path.join(dir, e.name));
      } else if (e.isFile() && (CODE.test(e.name) || STYLE.test(e.name) || e.name === 'package.json' || e.name === 'components.json')) {
        if (files.length >= APP_SCAN_MAX_FILES) {
          truncated = true;
          return;
        }
        files.push(path.join(dir, e.name));
      }
    }
  };
  await walk(root);
  return { files, truncated };
}

const rel = (workspaceRoot: string, abs: string) => path.relative(workspaceRoot, abs).split(path.sep).join('/');

/** CSS custom properties in :root, html, @theme, .dark and [data-theme] blocks. */
export function cssTokens(css: string, file: string): AppToken[] {
  const out: AppToken[] = [];
  let root;
  try {
    root = postcss.parse(css);
  } catch {
    return out;
  }
  root.walkDecls((decl) => {
    if (!decl.prop.startsWith('--')) return;
    const parent = decl.parent as { type?: string; selector?: string; name?: string; params?: string } | undefined;
    let theme: string | undefined;
    if (parent?.type === 'rule') {
      const sel = parent.selector ?? '';
      const named = /\[data-theme\s*=\s*["']?([\w-]+)["']?\]/.exec(sel)?.[1];
      if (named) theme = named;
      else if (/(^|[\s,.])\.dark\b|\[data-mode=["']?dark/.test(sel)) theme = 'dark';
      else if (!/^(?::root|html|:host|body)\b/.test(sel.trim()) && !/:root/.test(sel)) return;
    } else if (parent?.type === 'atrule') {
      if (parent.name !== 'theme') return;
    } else return;
    const value = decl.value.trim();
    out.push({ name: decl.prop, value, source: `${file}:${decl.source?.start?.line ?? 1}`, ...(theme ? { theme } : {}), kind: tokenKind(decl.prop, value) });
  });
  return out;
}

type Node = { type: string; [k: string]: any };

function parseCode(code: string, file: string): Node | undefined {
  try {
    return babelParse(code, {
      sourceType: 'unambiguous',
      plugins: [/\.tsx?$/.test(file) ? 'typescript' : 'flow', 'jsx', 'decorators-legacy', 'classProperties'] as any,
      errorRecovery: true,
    }) as unknown as Node;
  } catch {
    return undefined;
  }
}

function walkAst(node: unknown, visit: (n: Node) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const c of node) walkAst(c, visit);
    return;
  }
  const n = node as Node;
  if (typeof n.type === 'string') visit(n);
  for (const key of Object.keys(n)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' || key === 'trailingComments') continue;
    walkAst(n[key], visit);
  }
}

const keyName = (k: Node): string | undefined => (k?.type === 'Identifier' ? k.name : k?.type === 'StringLiteral' || k?.type === 'NumericLiteral' ? String(k.value) : undefined);

/** Flattens an object literal's string and number leaves into dotted names, with lines. */
function flattenObject(obj: Node, prefix: string, file: string, out: AppToken[]): void {
  for (const p of obj.properties ?? []) {
    if (p.type !== 'ObjectProperty') continue;
    const k = keyName(p.key);
    if (k === undefined) continue;
    const name = k === 'DEFAULT' ? prefix : prefix ? `${prefix}.${k}` : k;
    const v = p.value;
    if (v.type === 'ObjectExpression') flattenObject(v, name, file, out);
    else if (v.type === 'StringLiteral' || v.type === 'NumericLiteral') out.push({ name, value: String(v.value), source: `${file}:${p.loc?.start.line ?? 1}`, kind: tokenKind(name, String(v.value)) });
    else if (v.type === 'ArrayExpression' && v.elements.every((e: Node) => e?.type === 'StringLiteral')) out.push({ name, value: v.elements.map((e: Node) => e.value).join(', '), source: `${file}:${p.loc?.start.line ?? 1}`, kind: tokenKind(name, '') });
    else if (v.type === 'TemplateLiteral' && v.expressions.length === 0) out.push({ name, value: v.quasis[0].value.cooked, source: `${file}:${p.loc?.start.line ?? 1}`, kind: tokenKind(name, v.quasis[0].value.cooked) });
  }
}

/** theme / theme.extend in a Tailwind config. */
export function tailwindTokens(code: string, file: string): AppToken[] {
  const ast = parseCode(code, file);
  const out: AppToken[] = [];
  if (!ast) return out;
  walkAst(ast, (n) => {
    if (n.type !== 'ObjectProperty' || keyName(n.key) !== 'theme' || n.value.type !== 'ObjectExpression') return;
    for (const p of n.value.properties) {
      if (p.type !== 'ObjectProperty' || p.value.type !== 'ObjectExpression') continue;
      const k = keyName(p.key);
      if (k === 'extend') flattenObject(p.value, '', file, out);
      else if (k) flattenObject(p.value, k, file, out);
    }
  });
  return out;
}

/** palette, typography and shape from MUI createTheme / extendTheme calls. */
export function muiTokens(code: string, file: string): AppToken[] {
  if (!/createTheme|extendTheme/.test(code)) return [];
  const ast = parseCode(code, file);
  const out: AppToken[] = [];
  if (!ast) return out;
  walkAst(ast, (n) => {
    if (n.type !== 'CallExpression') return;
    const callee = n.callee?.type === 'Identifier' ? n.callee.name : n.callee?.property?.name;
    if (!/^(?:createTheme|extendTheme|experimental_extendTheme)$/.test(callee ?? '')) return;
    const arg = n.arguments?.[0];
    if (arg?.type === 'ObjectExpression') flattenObject(arg, '', file, out);
  });
  return out;
}

function unionValues(t: Node | undefined): string[] | undefined {
  if (!t) return undefined;
  if (t.type === 'TSUnionType') {
    const vals = t.types.map((x: Node) => (x.type === 'TSLiteralType' && x.literal.type === 'StringLiteral' ? x.literal.value : undefined));
    return vals.every((v: unknown) => typeof v === 'string') ? vals : undefined;
  }
  return undefined;
}

/** Exported components, their union props, and cva variants, from one file. */
export function componentsOf(code: string, file: string): Array<Omit<AppComponent, 'imports'>> {
  const ast = parseCode(code, file);
  if (!ast) return [];
  const types = new Map<string, Node>();
  const cvas = new Map<string, Record<string, string[]>>();
  const exported = new Set<string>();
  const declared = new Set<string>();
  const propsType = new Map<string, string>();
  walkAst(ast, (n) => {
    if (n.type === 'TSInterfaceDeclaration') types.set(n.id.name, n.body);
    if (n.type === 'TSTypeAliasDeclaration') types.set(n.id.name, n.typeAnnotation);
    if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier') {
      const init = n.init;
      if (init?.type === 'CallExpression' && init.callee?.name === 'cva') {
        const opts = init.arguments?.[1];
        const variants: Record<string, string[]> = {};
        const vprop = opts?.properties?.find((p: Node) => keyName(p.key) === 'variants');
        for (const v of vprop?.value?.properties ?? []) {
          const k = keyName(v.key);
          if (k && v.value?.type === 'ObjectExpression') variants[k] = v.value.properties.map((x: Node) => keyName(x.key)).filter(Boolean);
        }
        cvas.set(n.id.name, variants);
      }
      if (/^[A-Z]/.test(n.id.name) && (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression' || init?.type === 'CallExpression')) {
        declared.add(n.id.name);
        const param = init.type === 'CallExpression' ? init.arguments?.[0]?.params?.[0] : init.params?.[0];
        const ann = param?.typeAnnotation?.typeAnnotation;
        if (ann?.type === 'TSTypeReference' && ann.typeName?.name) propsType.set(n.id.name, ann.typeName.name);
        const generic = init.typeParameters?.params ?? init.typeArguments?.params;
        if (init.type === 'CallExpression' && generic?.[1]?.typeName?.name) propsType.set(n.id.name, generic[1].typeName.name);
      }
    }
    if (n.type === 'FunctionDeclaration' && n.id && /^[A-Z]/.test(n.id.name)) {
      declared.add(n.id.name);
      const ann = n.params?.[0]?.typeAnnotation?.typeAnnotation;
      if (ann?.type === 'TSTypeReference' && ann.typeName?.name) propsType.set(n.id.name, ann.typeName.name);
    }
    if (n.type === 'ExportNamedDeclaration') {
      const d = n.declaration;
      if (d?.type === 'FunctionDeclaration' && d.id) exported.add(d.id.name);
      if (d?.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id?.name) exported.add(v.id.name);
      for (const s of n.specifiers ?? []) if (s.local?.name) exported.add(s.local.name);
    }
    if (n.type === 'ExportDefaultDeclaration') {
      const d = n.declaration;
      if (d?.id?.name) exported.add(d.id.name);
      else if (d?.type === 'Identifier') exported.add(d.name);
    }
  });
  const out: Array<Omit<AppComponent, 'imports'>> = [];
  const cvaVariants = [...cvas.values()].reduce<Record<string, string[]>>((acc, v) => ({ ...acc, ...v }), {});
  for (const name of exported) {
    if (!declared.has(name) || !/^[A-Z][A-Za-z0-9]*$/.test(name)) continue;
    const variants: Record<string, string[]> = {};
    const props: string[] = [];
    const typeName = propsType.get(name) ?? (types.has(`${name}Props`) ? `${name}Props` : undefined);
    const body = typeName ? types.get(typeName) : undefined;
    const members: Node[] = body?.type === 'TSInterfaceBody' ? body.body : body?.type === 'TSTypeLiteral' ? body.members : body?.type === 'TSIntersectionType' ? body.types.flatMap((t: Node) => (t.type === 'TSTypeLiteral' ? t.members : [])) : [];
    for (const m of members) {
      const k = m.type === 'TSPropertySignature' ? keyName(m.key) : undefined;
      if (!k) continue;
      const vals = unionValues(m.typeAnnotation?.typeAnnotation);
      if (vals) variants[k] = vals;
      else props.push(k);
    }
    // A cva component (shadcn style) takes its variants from the cva call.
    if (Object.keys(variants).length === 0 && Object.keys(cvaVariants).length > 0 && /VariantProps/.test(code)) Object.assign(variants, cvaVariants);
    out.push({ name, file, variants, props: props.slice(0, 20) });
  }
  return out;
}

/** The route a file stands for under a file-routing convention, or undefined. */
export function routeOf(relFile: string, frameworks: string[]): AppRoute | undefined {
  const f = relFile.replace(/^src\//, '');
  const clean = (segments: string[]) => '/' + segments.filter((s) => !/^\(.*\)$/.test(s) && s !== 'index').join('/');
  let m = /^app\/(.*?)\/?page\.(?:tsx|jsx|ts|js|mdx)$/.exec(f) ?? /^app\/page\.(?:tsx|jsx|ts|js)$/.exec(f);
  if (m && frameworks.includes('Next.js')) return { path: clean((m[1] ?? '').split('/').filter(Boolean)), file: relFile, router: 'next-app' };
  m = /^pages\/(.+)\.(?:tsx|jsx|ts|js)$/.exec(f);
  if (m && frameworks.includes('Next.js') && !/^(?:_app|_document|_error|api\/)/.test(m[1])) return { path: clean(m[1].split('/')), file: relFile, router: 'next-pages' };
  m = /^app\/(.+)\.(?:tsx|jsx|ts|js)$/.exec(f);
  if (m && frameworks.includes('Expo') && !/(?:^|\/)_layout$|(?:^|\/)\+/.test(m[1])) return { path: clean(m[1].split('/')), file: relFile, router: 'expo-router' };
  return undefined;
}

function reactRouterRoutes(code: string, file: string): AppRoute[] {
  if (!/react-router/.test(code)) return [];
  const out: AppRoute[] = [];
  for (const m of code.matchAll(/<Route\b[^>]*\bpath\s*=\s*["']([^"']+)["']|\bpath\s*:\s*["']([^"']+)["']/g)) out.push({ path: m[1] ?? m[2], file, router: 'react-router' });
  return out;
}

async function readPackage(root: string, budget: Budget): Promise<{ deps: Set<string> } | undefined> {
  const raw = await readBounded(path.join(root, 'package.json'), budget);
  if (!raw) return undefined;
  try {
    const pkg = JSON.parse(raw) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown>; peerDependencies?: Record<string, unknown> };
    return { deps: new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})]) };
  } catch {
    return undefined;
  }
}

/** Scans the app at `root` (workspace-relative, default the workspace root). Never writes. */
export async function scanApp(workspaceRoot: string, root = '.'): Promise<AppProfile> {
  const absWorkspace = path.resolve(workspaceRoot);
  const absRoot = path.resolve(absWorkspace, root);
  const within = path.relative(absWorkspace, absRoot);
  const relRoot = within.split(path.sep).join('/') || '.';
  const empty = (note: string): AppProfile => ({ found: false, root: relRoot, frameworks: [], styling: [], tokens: [], themes: [], components: [], routes: [], filesSeen: 0, bytesRead: 0, truncated: false, notes: [note] });
  if (within.startsWith('..') || path.isAbsolute(within)) return empty(`${root} is outside the workspace.`);

  const budget: Budget = { bytes: 0, truncated: false, cache: new Map() };
  const pkg = await readPackage(absRoot, budget);
  const deps = pkg?.deps ?? new Set<string>();
  const frameworks = Object.entries(FRAMEWORKS).filter(([d]) => deps.has(d)).map(([, n]) => n);
  const styling = Object.entries(STYLING).filter(([d]) => deps.has(d)).map(([, n]) => n);
  const { files, truncated: tooMany } = await listFiles(absRoot);
  if (files.some((f) => path.basename(f) === 'components.json')) styling.push('shadcn/ui');

  const relFiles = files.map((f) => rel(absWorkspace, f));
  const styleFiles = files.filter((f) => STYLE.test(f));
  const configFiles = files.filter((f) => /(?:^|[\\/])tailwind\.config\.(?:js|ts|cjs|mjs)$/.test(f));
  const themeFiles = files.filter((f) => CODE.test(f) && /theme/i.test(path.basename(f)));
  const componentFiles = files.filter((f) => /\.(?:tsx|jsx)$/.test(f) && /(?:^|[\\/])(?:components|ui)[\\/]/.test(f) && !/\.(?:test|spec|stories)\.[jt]sx$/.test(f));
  const storyFiles = new Set(files.filter((f) => /\.stories\.[jt]sx?$/.test(f)).map((f) => path.basename(f).replace(/\.stories\.[jt]sx?$/, '').toLowerCase()));
  const otherCode = files.filter((f) => CODE.test(f) && !componentFiles.includes(f) && !configFiles.includes(f));

  if (!pkg && styleFiles.length === 0) return { ...empty('No app found: no package.json and no style files here. Pass root to point at the app folder.'), filesSeen: files.length };

  const tokens: AppToken[] = [];
  for (const f of configFiles) {
    const code = await readBounded(f, budget);
    if (code) tokens.push(...tailwindTokens(code, rel(absWorkspace, f)));
  }
  for (const f of styleFiles) {
    const css = await readBounded(f, budget);
    if (css && /--[\w-]+\s*:/.test(css)) tokens.push(...cssTokens(css, rel(absWorkspace, f)));
  }
  for (const f of themeFiles) {
    const code = await readBounded(f, budget);
    if (code) tokens.push(...muiTokens(code, rel(absWorkspace, f)));
  }

  const components: Array<Omit<AppComponent, 'imports'>> = [];
  for (const f of componentFiles) {
    const code = await readBounded(f, budget);
    if (code) components.push(...componentsOf(code, rel(absWorkspace, f)));
  }

  // Import counts rank the components; routes come from file names and router config.
  const importCount = new Map<string, number>();
  const routes: AppRoute[] = [];
  for (const relFile of relFiles) {
    const r = routeOf(relFile, frameworks);
    if (r) routes.push(r);
  }
  for (const f of [...componentFiles, ...otherCode]) {
    const code = await readBounded(f, budget);
    if (!code) continue;
    if (!routes.some((r) => r.router !== 'react-router')) routes.push(...reactRouterRoutes(code, rel(absWorkspace, f)));
    for (const m of code.matchAll(/import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*["'][^"']+["']/g)) {
      const names = [m[1], ...(m[2] ?? '').split(',').map((s) => s.trim().split(/\s+as\s+/)[0])].filter((s): s is string => Boolean(s) && /^[A-Z]/.test(s));
      for (const n of names) importCount.set(n, (importCount.get(n) ?? 0) + 1);
    }
  }

  const seen = new Set<string>();
  const ranked: AppComponent[] = components
    .filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)))
    .map((c) => ({ ...c, imports: importCount.get(c.name) ?? 0, ...(storyFiles.has(path.posix.basename(c.file).replace(/\.[jt]sx$/, '').toLowerCase()) ? { hasStory: true } : {}) }))
    .sort((a, b) => b.imports - a.imports || a.name.localeCompare(b.name))
    .slice(0, MAX_COMPONENTS);

  const themes = [...new Set(['light', ...tokens.map((t) => t.theme).filter((t): t is string => Boolean(t))])];
  const notes: string[] = [];
  if (tooMany) notes.push(`Stopped listing at ${APP_SCAN_MAX_FILES} files; pass root to scan one app folder.`);
  if (budget.truncated) notes.push(`Stopped reading at ${APP_SCAN_MAX_BYTES / 1024 / 1024} MB; some files were not read. Pass root to narrow the scan.`);
  if (tokens.length === 0) notes.push('No tokens found (no Tailwind theme, CSS variables or MUI theme).');
  return {
    found: true,
    root: relRoot,
    frameworks,
    styling: [...new Set(styling)],
    tokens: tokens.slice(0, MAX_TOKENS),
    themes,
    components: ranked,
    routes: routes.slice(0, MAX_ROUTES),
    filesSeen: files.length,
    bytesRead: budget.bytes,
    truncated: tooMany || budget.truncated,
    notes,
  };
}
