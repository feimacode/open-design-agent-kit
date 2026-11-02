// An app's profile as a design system (openspec add-design-from-app): DESIGN.md
// and tokens.css that agree with the app's tokens, components.json with its
// component vocabulary and the scanned tokens (so a later scan can say what
// changed), the vocabulary section of a brief, and the token findings. Pure:
// the agent writes the files.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Finding } from '../poster/preflight';
import type { AppComponent, AppProfile, AppToken } from '../workspace/appScan';

export const MAX_VOCABULARY = 60;
export const APP_COMPONENTS_FILE = 'components.json';

export interface AppComponentsFile {
  source: 'app';
  root: string;
  scannedAt: string;
  frameworks: string[];
  styling: string[];
  components: Array<Pick<AppComponent, 'name' | 'file' | 'variants' | 'props' | 'imports'>>;
  tokens: AppToken[];
}

/** The CSS custom property a token is written as in tokens.css. */
export function tokenVariable(token: Pick<AppToken, 'name'>): string {
  if (token.name.startsWith('--')) return token.name;
  return `--${token.name.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()}`;
}

function cssValue(t: AppToken): string {
  // shadcn stores colours as bare HSL channels ("222 47% 11%").
  if (t.kind === 'color' && /^\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%$/.test(t.value)) return `hsl(${t.value})`;
  return t.value;
}

export function appTokensCss(profile: Pick<AppProfile, 'tokens'>): string {
  const byTheme = new Map<string, Map<string, AppToken>>();
  for (const t of profile.tokens) {
    if (t.value.includes('var(') && !t.name.startsWith('--')) continue;
    const theme = t.theme ?? 'light';
    const m = byTheme.get(theme) ?? new Map<string, AppToken>();
    if (!m.has(tokenVariable(t))) m.set(tokenVariable(t), t);
    byTheme.set(theme, m);
  }
  const block = (selector: string, tokens: Map<string, AppToken>) =>
    `${selector} {\n${[...tokens].map(([v, t]) => `  ${v}: ${t.name.startsWith('--') ? t.value : cssValue(t)}; /* ${t.source} */`).join('\n')}\n}`;
  const parts = ['/* Tokens from the app, with the file and line each comes from. Regenerate with scan_open_design_app. */'];
  const light = byTheme.get('light');
  if (light) parts.push(block(':root', light));
  for (const [theme, tokens] of byTheme) if (theme !== 'light') parts.push(block(`[data-theme="${theme}"]${theme === 'dark' ? ', .dark' : ''}`, tokens));
  return `${parts.join('\n\n')}\n`;
}

const variantText = (c: Pick<AppComponent, 'variants' | 'props'>) =>
  [...Object.entries(c.variants).map(([k, v]) => `${k}: ${v.join(' | ')}`), ...(c.props.length ? [`props: ${c.props.slice(0, 8).join(', ')}`] : [])].join('; ');

export function appDesignMd(name: string, profile: AppProfile): string {
  const byKind = (k: AppToken['kind']) => profile.tokens.filter((t) => t.kind === k && !t.theme);
  const list = (tokens: AppToken[]) => tokens.slice(0, 40).map((t) => `- \`${tokenVariable(t)}\`: ${t.value} (${t.source})`).join('\n') || '- (none found)';
  const components = profile.components.slice(0, MAX_VOCABULARY);
  return `# ${name}

> The design system of the app at \`${profile.root}\` (${[...profile.frameworks, ...profile.styling].join(', ') || 'no framework detected'}), taken from its own tokens and components. Designs built on it should look like they belong in the app.

## Rules

- Use only the tokens in tokens.css, by variable name. Never paste a raw value that a token already has.
- Build every part from a component listed below and mark it \`data-od-component="<Name>"\`; mark a part with no match \`data-od-component="new:<Name>"\`.
- Themes: ${profile.themes.join(', ')}. Dark values apply under \`[data-theme="dark"]\` and \`.dark\`.

## Colour

${list(byKind('color'))}

## Typography

${list(byKind('font'))}

## Radius, spacing and shadow

${list([...byKind('radius'), ...byKind('spacing'), ...byKind('shadow')])}

## Components

${components.map((c) => `- **${c.name}** (\`${c.file}\`)${variantText(c) ? `: ${variantText(c)}` : ''}`).join('\n') || '- (none found)'}
`;
}

export function appComponentsFile(profile: AppProfile, scannedAt = new Date().toISOString()): AppComponentsFile {
  return {
    source: 'app',
    root: profile.root,
    scannedAt,
    frameworks: profile.frameworks,
    styling: profile.styling,
    components: profile.components.map(({ name, file, variants, props, imports }) => ({ name, file, variants, props, imports })),
    tokens: profile.tokens,
  };
}

export function parseAppComponentsFile(raw: string | undefined): AppComponentsFile | undefined {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw) as AppComponentsFile;
    return v && v.source === 'app' && Array.isArray(v.components) && Array.isArray(v.tokens) ? v : undefined;
  } catch {
    return undefined;
  }
}

export interface AppProfileDiff {
  tokensAdded: AppToken[];
  tokensRemoved: AppToken[];
  tokensChanged: Array<{ name: string; theme?: string; from: string; to: string; source: string }>;
  componentsAdded: string[];
  componentsRemoved: string[];
  componentsChanged: string[];
}

/** What changed in the app since its design system was saved. */
export function diffAppProfile(saved: AppComponentsFile, now: AppProfile): AppProfileDiff {
  const key = (t: AppToken) => `${t.theme ?? 'light'}|${tokenVariable(t)}`;
  const before = new Map(saved.tokens.map((t) => [key(t), t]));
  const after = new Map(now.tokens.map((t) => [key(t), t]));
  const diff: AppProfileDiff = { tokensAdded: [], tokensRemoved: [], tokensChanged: [], componentsAdded: [], componentsRemoved: [], componentsChanged: [] };
  for (const [k, t] of after) {
    const old = before.get(k);
    if (!old) diff.tokensAdded.push(t);
    else if (old.value !== t.value) diff.tokensChanged.push({ name: tokenVariable(t), theme: t.theme, from: old.value, to: t.value, source: t.source });
  }
  for (const [k, t] of before) if (!after.has(k)) diff.tokensRemoved.push(t);
  const cBefore = new Map(saved.components.map((c) => [c.name, c]));
  const cAfter = new Map(now.components.map((c) => [c.name, c]));
  for (const [n, c] of cAfter) {
    const old = cBefore.get(n);
    if (!old) diff.componentsAdded.push(n);
    else if (JSON.stringify(old.variants) !== JSON.stringify(c.variants)) diff.componentsChanged.push(n);
  }
  for (const n of cBefore.keys()) if (!cAfter.has(n)) diff.componentsRemoved.push(n);
  return diff;
}

export function formatAppProfileDiff(diff: AppProfileDiff): string {
  const lines: string[] = [];
  for (const c of diff.tokensChanged) lines.push(`- changed \`${c.name}\`${c.theme ? ` (${c.theme})` : ''}: ${c.from} → ${c.to} (${c.source})`);
  for (const t of diff.tokensAdded.slice(0, 20)) lines.push(`- added \`${tokenVariable(t)}\`: ${t.value} (${t.source})`);
  for (const t of diff.tokensRemoved.slice(0, 20)) lines.push(`- removed \`${tokenVariable(t)}\` (was ${t.value})`);
  if (diff.componentsAdded.length) lines.push(`- new components: ${diff.componentsAdded.join(', ')}`);
  if (diff.componentsRemoved.length) lines.push(`- removed components: ${diff.componentsRemoved.join(', ')}`);
  if (diff.componentsChanged.length) lines.push(`- components with changed variants: ${diff.componentsChanged.join(', ')}`);
  return lines.length ? lines.join('\n') : 'No changes since the design system was saved.';
}

/** The "Build from the app's components" section of a brief. */
export function composeComponentVocabularySection(file: AppComponentsFile): string | undefined {
  const components = [...file.components].sort((a, b) => b.imports - a.imports).slice(0, MAX_VOCABULARY);
  if (components.length === 0) return undefined;
  const rows = components.map((c) => `- **${c.name}**${variantText(c) ? ` — ${variantText(c)}` : ''}`).join('\n');
  return `## Build from the app's components

This design system comes from a real app (\`${file.root}\`), so the design will be promoted into that app's code. Build each part from one of these components (most used first), imitating it in plain HTML and CSS with the design system's tokens, and mark its root element \`data-od-component="<Name>"\`, e.g. \`<button class="btn" data-od-component="Button" data-variant="outline">\`. Use only the variants listed.

${rows}

When no listed component fits a part, build it anyway and mark it \`data-od-component="new:<Name>"\` (e.g. \`new:Stepper\`). In your reply, list every \`new:\` component as a proposed addition to the app.`;
}

const HEX = /#[0-9a-f]{3,8}\b/gi;
const LENGTH = /\b\d+(?:\.\d+)?(?:px|rem)\b/g;

function normalizeColor(v: string): string | undefined {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return undefined;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return `#${h.toLowerCase()}`;
}

/**
 * token-undefined (a var() used but defined nowhere) and token-hardcoded (a
 * raw value equal to a token's) for a design on an app design system. Reads
 * the page's own <style> and style="" text.
 */
export function tokenFindings(html: string, tokens: AppToken[], designSystemCss = ''): Finding[] {
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') + '\n' + [...html.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join(';\n');
  const defined = new Set<string>([...(css + designSystemCss).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const t of tokens) defined.add(tokenVariable(t));
  const findings: Finding[] = [];
  const undefinedVars = new Set<string>();
  for (const m of css.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) if (!defined.has(m[1]) && !m[2]) undefinedVars.add(m[1]);
  for (const v of [...undefinedVars].slice(0, 10)) findings.push({ check: 'token-undefined', severity: 'warning', message: `var(${v}) is used but defined nowhere in the page or the design system, so it falls back to nothing. Use one of the app's tokens.` });

  const byColor = new Map<string, AppToken>();
  const byLength = new Map<string, AppToken>();
  for (const t of tokens) {
    if (t.theme) continue;
    const c = normalizeColor(t.value);
    if (c && !byColor.has(c)) byColor.set(c, t);
    if ((t.kind === 'radius' || t.kind === 'spacing') && /^\d+(?:\.\d+)?(?:px|rem)$/.test(t.value) && !['0px', '0rem'].includes(t.value) && !byLength.has(t.value)) byLength.set(t.value, t);
  }
  // Values inside custom-property definitions are the tokens themselves, not uses.
  const uses = css.replace(/--[\w-]+\s*:[^;}]*/g, '');
  const reported = new Set<string>();
  for (const m of uses.matchAll(HEX)) {
    const c = normalizeColor(m[0]);
    const t = c ? byColor.get(c) : undefined;
    if (t && !reported.has(c!)) {
      reported.add(c!);
      findings.push({ check: 'token-hardcoded', severity: 'warning', message: `${m[0]} is hard-coded; the app has it as var(${tokenVariable(t)}) (${t.source}). Use the token.` });
    }
  }
  for (const m of uses.matchAll(LENGTH)) {
    const t = byLength.get(m[0]);
    if (t && !reported.has(m[0]) && reported.size < 20) {
      reported.add(m[0]);
      findings.push({ check: 'token-hardcoded', severity: 'info', message: `${m[0]} matches the app's ${t.kind} token var(${tokenVariable(t)}) (${t.source}). Use the token if that's what it means.` });
    }
  }
  return findings;
}

/** Components a design marks, split into the app's own and proposed new ones. */
export function markedComponents(html: string): { reused: string[]; proposed: string[] } {
  const names = [...html.matchAll(/data-od-component\s*=\s*["']([^"']+)["']/g)].map((m) => m[1].trim());
  const reused = [...new Set(names.filter((n) => !n.startsWith('new:')))];
  const proposed = [...new Set(names.filter((n) => n.startsWith('new:')).map((n) => n.slice(4)))];
  return { reused, proposed };
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'app';
}

/**
 * scan_open_design_app's result: the profile in brief, the diff against a
 * design system saved from this app, and, with `name`, the three files to
 * write for a new (or refreshed) app design system. Writes nothing.
 */
export function formatAppScanResult(profile: AppProfile, options: { outputDir: string; name?: string; saved?: { id: string; file: AppComponentsFile } }): string {
  if (!profile.found) return `${profile.notes.join(' ')}`;
  const lines: string[] = [];
  lines.push(`App at \`${profile.root}\`: ${[...profile.frameworks, ...profile.styling].join(', ') || 'no framework detected'}. Read ${profile.filesSeen} file(s) listed, ${(profile.bytesRead / 1024).toFixed(0)} KB.${profile.truncated ? ' The scan stopped at a bound; some files were not read.' : ''}`);
  lines.push(`Themes: ${profile.themes.join(', ')}.`);
  const byKind = new Map<string, AppToken[]>();
  for (const t of profile.tokens) byKind.set(t.kind, [...(byKind.get(t.kind) ?? []), t]);
  lines.push(`\nTokens (${profile.tokens.length}):`);
  for (const [kind, tokens] of byKind) {
    lines.push(`- ${kind}: ${tokens.slice(0, 12).map((t) => `${tokenVariable(t)}${t.theme ? ` [${t.theme}]` : ''} = ${t.value} (${t.source})`).join('; ')}${tokens.length > 12 ? `; and ${tokens.length - 12} more` : ''}`);
  }
  lines.push(`\nComponents (${profile.components.length}, most imported first):`);
  for (const c of profile.components.slice(0, 30)) lines.push(`- ${c.name} (${c.file}, ${c.imports} import(s))${variantText(c) ? `: ${variantText(c)}` : ''}`);
  if (profile.routes.length > 0) lines.push(`\nScreens (${profile.routes.length}): ${profile.routes.slice(0, 40).map((r) => `${r.path} (${r.file})`).join(', ')}`);
  if (profile.notes.length > 0) lines.push(`\nNotes: ${profile.notes.join(' ')}`);
  if (options.saved) {
    lines.push(`\nSince ${options.saved.id} was saved (${options.saved.file.scannedAt}):\n${formatAppProfileDiff(diffAppProfile(options.saved.file, profile))}`);
  }
  if (options.name) {
    const dir = options.saved ? `${options.outputDir}/design-systems/${options.saved.id.replace(/^user:/, '')}` : `${options.outputDir}/design-systems/${slug(options.name)}`;
    lines.push(
      `\n## Save as a design system\n\nWrite these three files exactly (with your file tools), then call set_active_design_system with id \`user:${dir.split('/').pop()}\`. Briefs on it then list the app's components and the check reports token-undefined and token-hardcoded.\n\n### ${dir}/DESIGN.md\n\n\`\`\`markdown\n${appDesignMd(options.name, profile)}\`\`\`\n\n### ${dir}/tokens.css\n\n\`\`\`css\n${appTokensCss(profile)}\`\`\`\n\n### ${dir}/${APP_COMPONENTS_FILE}\n\n\`\`\`json\n${JSON.stringify(appComponentsFile(profile), null, 2)}\n\`\`\``,
    );
  } else {
    lines.push(`\nTo build designs from this app, show the user what was found and, if they agree (a request to make a design match the app already counts), call scan_open_design_app again with name (e.g. "${profile.root === '.' ? 'Our app' : profile.root}") to get the design system files to save.`);
  }
  return lines.join('\n');
}

const MAX_STALE_FILES = 200;

/**
 * app-design-system-stale: the app files a saved app design system was read
 * from (token sources and component files) changed or went away after the
 * scan, so its tokens and vocabulary may be out of date. Reconcile has
 * nothing to do for it (DESIGN.md and tokens.css come from one scan); drift
 * from the code is what goes wrong (openspec add-design-from-app).
 */
export async function appDesignSystemStaleness(workspaceRoot: string, designSystemId: string, file: AppComponentsFile): Promise<Finding[]> {
  const scannedAt = Date.parse(file.scannedAt);
  if (Number.isNaN(scannedAt)) return [];
  const sources = new Set([...file.tokens.map((t) => t.source.replace(/:\d+$/, '')), ...file.components.map((c) => c.file)]);
  const absRoot = path.resolve(workspaceRoot, file.root);
  const changed: string[] = [];
  const removed: string[] = [];
  for (const rel of [...sources].slice(0, MAX_STALE_FILES)) {
    try {
      // A second of slack: the scan's timestamp is taken after it reads the files.
      if ((await fs.stat(path.join(absRoot, rel))).mtimeMs > scannedAt + 1000) changed.push(rel);
    } catch {
      removed.push(rel);
    }
  }
  if (changed.length === 0 && removed.length === 0) return [];
  const show = (list: string[]) => list.slice(0, 5).join(', ') + (list.length > 5 ? ` and ${list.length - 5} more` : '');
  const what = [changed.length ? `changed: ${show(changed)}` : '', removed.length ? `gone: ${show(removed)}` : ''].filter(Boolean).join('; ');
  const root = file.root === '.' ? '' : ` with root "${file.root}"`;
  return [
    {
      check: 'app-design-system-stale',
      severity: 'info',
      message: `The app's code moved on since ${designSystemId} was saved (${file.scannedAt}); ${what}. Its tokens and components may be out of date. Tell the user, and offer to run scan_open_design_app${root} to see what changed before saving it again.`,
    },
  ];
}
