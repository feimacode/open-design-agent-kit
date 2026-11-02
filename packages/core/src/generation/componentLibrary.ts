// prepare_open_design_component_library (openspec add-component-library-port):
// turns one or more reviewed artifacts into staged instructions for a
// reusable component set on a named library (MUI themed to Material 3, or
// shadcn/ui) in the workspace's own React app. Like the port tool it writes
// no app code: core does the data parts (library detection, a repeated-
// element scan of the design, the token-to-theme mapping, the manifest
// record) and the agent writes the components with its own file tools.

import { markedComponents } from './appDesignSystem';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { load } from 'cheerio';
import type { DesignSystemDetail } from '../content/contentIndex';
import { readArtifact, writeArtifactManifest } from '../vendored/artifactCreate';
import type { JsonRecord } from '../vendored/artifactManifest';
import { findCollectionArtifacts } from '../workspace/collectionScan';
import { resolveDesignSystemDetailTokens } from './designSystemPreview';
import { buildLibraryTheme, COMPONENT_LIBRARIES, hasThemeTokens, type ComponentLibrary, type LibraryTheme } from './libraryThemes';
import { extractRootTokens } from './styleTiles';

export const COMPONENT_LIBRARY_TOOL_NAME = 'prepare_open_design_component_library';

const MAX_ENTRIES = 10;
const MAX_CANDIDATES = 40;
const MAX_RECORD_BYTES = 4096;
const MAX_HTML_CHARS = 60_000;

export type ComponentLibraryErrorCode =
  | 'invalid-args'
  | 'not-registered'
  | 'unsupported-library'
  | 'no-app'
  | 'unsupported-framework'
  | 'needs-choice'
  | 'invalid-record';

export type PrepareComponentLibraryResult = { ok: true; text: string } | { ok: false; code: ComponentLibraryErrorCode; text: string };

// ─── App detection ──────────────────────────────────────────────────────────

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface AppInfo {
  /** Workspace-relative folder of the app's package.json ('' for the workspace root). */
  appDir: string;
  dependencies: Set<string>;
  packageManager: PackageManager;
  hasComponentsJson: boolean;
  hasStorybook: boolean;
  hasSrcDir: boolean;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function insideWorkspace(workspaceRoot: string, rel: string): string | undefined {
  const abs = path.resolve(workspaceRoot, rel);
  const back = path.relative(workspaceRoot, abs);
  if (back.startsWith('..') || path.isAbsolute(back)) return undefined;
  return abs;
}

/** The nearest package.json from `startDir` (workspace-relative) up to the workspace root. */
export async function detectApp(workspaceRoot: string, startDir = ''): Promise<AppInfo | undefined> {
  let dir = insideWorkspace(workspaceRoot, startDir) ?? workspaceRoot;
  const root = path.resolve(workspaceRoot);
  for (;;) {
    const pkgPath = path.join(dir, 'package.json');
    if (await exists(pkgPath)) {
      let pkg: { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> } = {};
      try {
        pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
      } catch {
        pkg = {};
      }
      const dependencies = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
      return {
        appDir: path.relative(root, dir).split(path.sep).join('/'),
        dependencies,
        packageManager: await packageManagerFor(dir, root),
        hasComponentsJson: await exists(path.join(dir, 'components.json')),
        hasStorybook: (await exists(path.join(dir, '.storybook'))) || [...dependencies].some((d) => d === 'storybook' || d.startsWith('@storybook/')),
        hasSrcDir: await exists(path.join(dir, 'src')),
      };
    }
    if (path.resolve(dir) === root) return undefined;
    dir = path.dirname(dir);
  }
}

async function packageManagerFor(appDir: string, root: string): Promise<PackageManager> {
  // A monorepo keeps its lock file at the root, so look from the app up.
  let dir = appDir;
  for (;;) {
    if (await exists(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
    if (await exists(path.join(dir, 'yarn.lock'))) return 'yarn';
    if ((await exists(path.join(dir, 'bun.lockb'))) || (await exists(path.join(dir, 'bun.lock')))) return 'bun';
    if (await exists(path.join(dir, 'package-lock.json'))) return 'npm';
    if (path.resolve(dir) === root) return 'npm';
    dir = path.dirname(dir);
  }
}

const OTHER_FRAMEWORKS = ['vue', 'nuxt', 'svelte', '@sveltejs/kit', '@angular/core', 'solid-js', 'preact', 'lit', 'astro'];

export type LibraryChoice = { library: ComponentLibrary; installed: boolean } | { error: 'needs-choice' | 'unsupported-framework'; found: string[] };

/** Picks the library for `requested` ('auto' or a named one) from the app's dependencies. */
export function chooseLibrary(app: AppInfo, requested: ComponentLibrary | 'auto'): LibraryChoice {
  const deps = app.dependencies;
  if (!deps.has('react')) return { error: 'unsupported-framework', found: OTHER_FRAMEWORKS.filter((f) => deps.has(f)) };
  const hasMui = deps.has('@mui/material');
  const hasShadcn = app.hasComponentsJson || ([...deps].some((d) => d.startsWith('@radix-ui/')) && deps.has('tailwindcss'));
  if (requested === 'mui') return { library: 'mui', installed: hasMui };
  if (requested === 'shadcn') return { library: 'shadcn', installed: app.hasComponentsJson };
  if (hasMui && !hasShadcn) return { library: 'mui', installed: true };
  if (hasShadcn && !hasMui) return { library: 'shadcn', installed: app.hasComponentsJson };
  return { error: 'needs-choice', found: [hasMui ? '@mui/material' : '', hasShadcn ? 'shadcn' : ''].filter(Boolean) };
}

export function installCommand(library: ComponentLibrary, pm: PackageManager): string {
  if (library === 'mui') {
    const pkgs = '@mui/material @emotion/react @emotion/styled';
    return pm === 'npm' ? `npm install ${pkgs}` : `${pm} add ${pkgs}`;
  }
  if (pm === 'pnpm') return 'pnpm dlx shadcn@latest init';
  if (pm === 'bun') return 'bunx --bun shadcn@latest init';
  return 'npx shadcn@latest init';
}

// ─── Repeated-element scan ──────────────────────────────────────────────────

export interface ComponentCandidate {
  /** Tag plus sorted classes, e.g. `div.plan-card`. */
  selector: string;
  count: number;
  /** Entry paths it appears in, in input order. */
  artifacts: string[];
}

const SKIP_TAGS = new Set(['html', 'head', 'body', 'script', 'style', 'meta', 'link', 'title', 'br', 'template', 'noscript']);
const ALWAYS_TAGS = new Set(['button', 'input', 'select', 'textarea', 'nav', 'header', 'footer']);

function selectorFor(tag: string, classAttr: string | undefined): string {
  const classes = [...new Set((classAttr ?? '').split(/\s+/).filter((c) => /^[A-Za-z_-][\w-]*$/.test(c)))].sort();
  return classes.length ? `${tag}.${classes.join('.')}` : tag;
}

/**
 * Candidate components in the artifacts' HTML: element groups with the same
 * tag and class set seen two or more times, plus every control and landmark
 * (`button`, `a[role=button]`, inputs, `nav`, `header`, `footer`, top-level
 * `section`). Deterministic: ranked by how many artifacts share it, then by
 * count, then by selector.
 */
export function scanComponentCandidates(artifacts: ReadonlyArray<{ entryPath: string; html: string }>): ComponentCandidate[] {
  const byKey = new Map<string, { count: number; always: boolean; artifacts: string[] }>();
  for (const { entryPath, html } of artifacts) {
    const $ = load(html);
    $('body *').each((_, el) => {
      if (el.type !== 'tag') return;
      const tag = el.name.toLowerCase();
      if (SKIP_TAGS.has(tag)) return;
      if ($(el).parents('svg').length > 0) return;
      const role = $(el).attr('role');
      const always =
        ALWAYS_TAGS.has(tag) || (tag === 'a' && role === 'button') || (tag === 'section' && $(el).parents('section').length === 0);
      const hasClass = Boolean(($(el).attr('class') ?? '').trim());
      if (!always && !hasClass) return;
      const key = selectorFor(tag, $(el).attr('class')) + (tag === 'a' && role === 'button' ? '[role=button]' : '');
      const entry = byKey.get(key) ?? { count: 0, always: false, artifacts: [] };
      entry.count++;
      entry.always ||= always;
      if (!entry.artifacts.includes(entryPath)) entry.artifacts.push(entryPath);
      byKey.set(key, entry);
    });
  }
  return [...byKey.entries()]
    .filter(([, v]) => v.always || v.count >= 2)
    .map(([selector, v]) => ({ selector, count: v.count, artifacts: v.artifacts }))
    .sort((a, b) => b.artifacts.length - a.artifacts.length || b.count - a.count || (a.selector < b.selector ? -1 : a.selector > b.selector ? 1 : 0))
    .slice(0, MAX_CANDIDATES);
}

// ─── Record ─────────────────────────────────────────────────────────────────

export interface ComponentLibraryRecordComponent {
  name: string;
  path: string;
  sourceSelectors?: string[];
}

export interface ComponentLibraryRecord {
  library: ComponentLibrary;
  outputDir: string;
  themePath: string;
  components: ComponentLibraryRecordComponent[];
  updatedAt?: string;
}

function isRelativePath(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..');
}

/** Validates a `record` argument; returns the clean record or an error message. */
export function validateComponentLibraryRecord(input: unknown): { record: ComponentLibraryRecord } | { error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: '"record" must be an object.' };
  const r = input as Record<string, unknown>;
  if (!COMPONENT_LIBRARIES.includes(r.library as ComponentLibrary)) return { error: `"record.library" must be one of ${COMPONENT_LIBRARIES.join(', ')}.` };
  if (!isRelativePath(r.outputDir)) return { error: '"record.outputDir" must be a workspace-relative folder.' };
  if (!isRelativePath(r.themePath)) return { error: '"record.themePath" must be a workspace-relative file.' };
  if (!Array.isArray(r.components) || r.components.length === 0 || r.components.length > 60) return { error: '"record.components" must list 1 to 60 components.' };
  const components: ComponentLibraryRecordComponent[] = [];
  for (const [i, c] of r.components.entries()) {
    const comp = c as Record<string, unknown>;
    if (!comp || typeof comp.name !== 'string' || !comp.name.trim() || comp.name.length > 60) return { error: `"record.components[${i}].name" must be a short name.` };
    if (!isRelativePath(comp.path)) return { error: `"record.components[${i}].path" must be a workspace-relative file.` };
    const selectors = comp.sourceSelectors;
    if (selectors !== undefined && (!Array.isArray(selectors) || selectors.some((s) => typeof s !== 'string'))) {
      return { error: `"record.components[${i}].sourceSelectors" must be a list of selectors.` };
    }
    components.push({ name: comp.name.trim(), path: comp.path, ...(selectors ? { sourceSelectors: (selectors as string[]).slice(0, 10) } : {}) });
  }
  const record: ComponentLibraryRecord = { library: r.library as ComponentLibrary, outputDir: r.outputDir, themePath: r.themePath, components };
  if (Buffer.byteLength(JSON.stringify(record), 'utf8') > MAX_RECORD_BYTES) return { error: `The record is over ${MAX_RECORD_BYTES / 1024} KB; shorten the selectors or split the set.` };
  return { record };
}

function recordedLibrary(manifest: JsonRecord | null): ComponentLibraryRecord | undefined {
  const metadata = manifest?.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const rec = (metadata as JsonRecord).componentLibrary;
  const valid = validateComponentLibraryRecord(rec);
  return 'record' in valid ? { ...valid.record, updatedAt: typeof (rec as JsonRecord).updatedAt === 'string' ? ((rec as JsonRecord).updatedAt as string) : undefined } : undefined;
}

// ─── Instructions ───────────────────────────────────────────────────────────

/** The artifact's HTML for the instructions: script bodies and data URIs trimmed, and capped. */
export function trimHtmlForInstructions(html: string): string {
  let out = html
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1/* script trimmed */$2')
    .replace(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+(;[a-z0-9=-]+)*(;base64)?,[A-Za-z0-9+/=%._-]{64,}/gi, 'data:…');
  if (out.length > MAX_HTML_CHARS) out = `${out.slice(0, MAX_HTML_CHARS)}\n<!-- truncated: open the file for the rest -->`;
  return out;
}

function toPascalCase(name: string): string {
  return (
    name
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('') || 'Design'
  );
}

interface SourceArtifact {
  entryPath: string;
  title: string;
  html: string;
  manifest: JsonRecord | null;
}

interface ThemeSource {
  label: string;
  theme?: LibraryTheme;
}

export interface ComposeComponentLibraryInput {
  library: ComponentLibrary;
  installed: boolean;
  app: AppInfo;
  componentsDir: string;
  artifacts: SourceArtifact[];
  candidates: ComponentCandidate[];
  themeSource: ThemeSource;
  existing?: ComponentLibraryRecord;
  otherLibraries: ComponentLibraryRecord[];
}

const LIBRARY_LABEL: Record<ComponentLibrary, string> = {
  mui: 'Material UI (MUI), themed to Material 3',
  shadcn: 'shadcn/ui (Radix + Tailwind)',
};

function themeFilePath(library: ComponentLibrary, componentsDir: string): string {
  return path.posix.join(componentsDir, library === 'mui' ? 'theme.ts' : 'theme.css');
}

/** One line per suggestion: `--space-2` (8px), `--space-3` (12px): where they go. */
function groupUnmapped(unmapped: LibraryTheme['unmapped']): string[] {
  const bySuggestion = new Map<string, string[]>();
  for (const u of unmapped) {
    const list = bySuggestion.get(u.suggestion) ?? [];
    list.push(`\`${u.token}\` (\`${u.value}\`)`);
    bySuggestion.set(u.suggestion, list);
  }
  return [...bySuggestion.entries()].map(([suggestion, tokens]) => `- ${tokens.join(', ')}: ${suggestion}`);
}

export function composeComponentLibraryInstructions(input: ComposeComponentLibraryInput): string {
  const { library, app, componentsDir, artifacts, candidates, themeSource, existing } = input;
  const inventoryPath = path.posix.join(path.posix.dirname(artifacts[0].entryPath), 'components.md');
  const themePath = existing?.themePath ?? themeFilePath(library, componentsDir);
  const parts: string[] = [];

  parts.push(
    `# Build a ${LIBRARY_LABEL[library]} component set from ${artifacts.length === 1 ? 'this design' : `these ${artifacts.length} designs`}\n\n` +
      `You are turning reviewed Open Design artifacts into a reusable component set in this workspace's React app${app.appDir ? ` (\`${app.appDir}\`)` : ''}. ` +
      `Work through the stages in order. Stage 1 ends with a question to the user; do not write any app code before they agree. ` +
      `This tool wrote nothing; you write every file with your own tools.`,
  );

  if (existing) {
    parts.push(
      `\n\n## Update mode\n\nA ${existing.library} set was already built from this design (recorded ${existing.updatedAt ?? 'earlier'}). ` +
        `Read these files first and update them in place; do not create a second set.\n\n` +
        `- Theme: \`${existing.themePath}\`\n` +
        existing.components.map((c) => `- ${c.name}: \`${c.path}\``).join('\n'),
    );
    const present = new Set(candidates.map((c) => c.selector));
    const gone = existing.components.filter((c) => c.sourceSelectors?.length && !c.sourceSelectors.some((s) => present.has(s)));
    if (gone.length) {
      parts.push(
        `\n\nThese recorded components were not found in the design any more. List them for the user and ask what to do; do not delete their files:\n\n` +
          gone.map((c) => `- ${c.name} (\`${c.path}\`, from ${c.sourceSelectors!.map((s) => `\`${s}\``).join(', ')})`).join('\n'),
      );
    }
  }
  for (const other of input.otherLibraries) {
    parts.push(`\n\nNote: a ${other.library} set was also built from this design, in \`${other.outputDir}\`. Leave it as it is; this set goes in \`${componentsDir}\`.`);
  }

  if (!input.installed) {
    parts.push(
      `\n\n## Before you start: install ${library === 'mui' ? 'MUI' : 'shadcn/ui'}\n\nThe app doesn't have it yet. Ask the user before running:\n\n\`\`\`sh\n${app.appDir ? `cd ${app.appDir}\n` : ''}${installCommand(library, app.packageManager)}\n\`\`\`` +
        (library === 'shadcn' ? `\n\nThen add the primitives the inventory needs with \`shadcn add <name>\` (for example \`button card input\`).` : ''),
    );
  }

  parts.push(`\n\n## The design${artifacts.length === 1 ? '' : 's'}`);
  for (const a of artifacts) parts.push(`\n\n### ${a.title}\n\nEntry file: \`${a.entryPath}\`\n\n\`\`\`html\n${trimHtmlForInstructions(a.html).trim()}\n\`\`\``);

  const marked = artifacts.map((a) => markedComponents(a.html));
  const reused = [...new Set(marked.flatMap((m) => m.reused))];
  const proposed = [...new Set(marked.flatMap((m) => m.proposed))];
  if (reused.length > 0) {
    parts.push(
      `\n\n## The app's own components\n\nThe design marks parts with \`data-od-component\` as components the app already has: ${reused.map((n) => `\`${n}\``).join(', ')}. Don't create components for them; the set imports the app's own. Build components only for parts marked \`new:\`${proposed.length ? ` (${proposed.join(', ')})` : ''} and unmarked parts.`,
    );
  }

  parts.push(
    `\n\n## Stage 1 — inventory, then stop\n\nThese repeated elements and controls were found in the design (selector, count, where). They are a starting point: merge, split, rename or drop them.\n\n` +
      (candidates.length
        ? candidates.map((c) => `- \`${c.selector}\` ×${c.count}${artifacts.length > 1 ? ` — ${c.artifacts.length} of ${artifacts.length} designs` : ''}`).join('\n')
        : '- (nothing repeated was found; read the HTML for the parts)') +
      `\n\nWrite \`${inventoryPath}\` with one section per component: its name (PascalCase), the source selectors it comes from, its variants, its props, and its states. ` +
      `Every interactive component lists default, hover, focus-visible, active and disabled; buttons also list loading, inputs also list error, lists and tables also list empty. ` +
      `Prefer the library's own components (${library === 'mui' ? 'Button, Card, TextField, AppBar, Chip, …' : 'button, card, input, navigation-menu, badge, …'}) and say which one each component wraps.\n\n` +
      `Then show the user the list in a few lines and ask whether to go ahead. Stop here until they answer.`,
  );

  if (themeSource.theme) {
    const t = themeSource.theme;
    parts.push(
      `\n\n## Stage 2 — the theme\n\nGenerated from ${themeSource.label} (a ${t.mode} theme). Write it to \`${themePath}\` as is, then ` +
        (library === 'mui'
          ? 'wrap the app (or the gallery) in `<ThemeProvider theme={theme}>` with `<CssBaseline />`.'
          : "import it from the app's global stylesheet in place of the `:root` block shadcn init wrote (keep any `.dark` block the app has, or derive one only if the user asks).") +
        `\n\n\`\`\`${library === 'mui' ? 'ts' : 'css'}\n${t.code.trim()}\n\`\`\``,
    );
    if (t.unmapped.length) {
      parts.push(
        `\n\nThese tokens have no slot in the ${library} theme. Use them where a component needs them, in the place suggested, and never as literal values in a component:\n\n` +
          groupUnmapped(t.unmapped).join('\n'),
      );
    }
  } else {
    parts.push(
      `\n\n## Stage 2 — the theme\n\nThere is no theme source: the design has no design system and its \`:root\` doesn't use the token names (\`--bg\`, \`--fg\`, \`--accent\`, …). ` +
        `Tell the user, and either have them pick a design system (\`set_active_design_system\`, then register the design again with its \`designSystemId\`) or extract one from the design's site with \`extract_open_design_design_system\`, then call \`${COMPONENT_LIBRARY_TOOL_NAME}\` again.`,
    );
  }

  parts.push(
    `\n\n## Stage 3 — the components\n\nWrite each component from the inventory in \`${componentsDir}\`, one file each, in TypeScript if the app uses it.\n\n` +
      (library === 'mui'
        ? '- Build on the MUI component it names (`@mui/material`), and express variants with MUI props (`variant`, `color`, `size`) or a `variants` entry in the theme\'s `components` section, not with new CSS.\n'
        : '- Build on the generated `components/ui/*` file it names and add variants with `cva` in your component, not by editing the generated file.\n') +
      '- Take content (text, images, links, items) through typed props; the design\'s copy can be the story or gallery data.\n' +
      `- Read every colour, radius, font, size and spacing from the theme (${library === 'mui' ? '`theme.palette`, `theme.spacing()`, `sx` theme keys' : 'Tailwind classes bound to the theme variables'}). No hex, rgb or px literals for these in component files.\n` +
      '- Loading is not disabled: keep full strength and show a spinner. A destructive action uses the danger colour (' +
      (library === 'mui' ? '`color="error"`' : '`variant="destructive"`') +
      ').\n- Keep the app\'s own conventions for imports, file names and exports; read one existing component first if there is one.',
  );

  parts.push(
    `\n\n## Stage 4 — the gallery\n\n` +
      (app.hasStorybook
        ? 'The app has Storybook: write one `<Name>.stories.tsx` per component next to it, with a story for every variant and every state in the inventory.'
        : `Write \`${path.posix.join(componentsDir, 'ComponentGallery.tsx')}\`: one component that renders every component in every variant and state from the inventory, with a label for each.`) +
      ' Do not add it to routes or navigation; tell the user how to view it.',
  );

  parts.push(
    `\n\n## Stage 5 — check and record\n\nRun the app's own type check or build (from its package.json scripts) and fix what it reports. Then record the set by calling \`${COMPONENT_LIBRARY_TOOL_NAME}\` again with the same ${artifacts.length === 1 ? '`entryPaths`' : '`entryPaths` or `collectionId`'} and:\n\n` +
      '```json\n' +
      JSON.stringify(
        {
          record: {
            library,
            outputDir: componentsDir,
            themePath,
            components: [{ name: '<Name>', path: `${componentsDir}/<Name>.tsx`, sourceSelectors: ['<selector from the inventory>'] }],
          },
        },
        null,
        2,
      ) +
      '\n```\n\nA later run reads this record and updates the set instead of starting over. Finally tell the user what was made, where, and how to view the gallery.',
  );

  return parts.join('');
}

// ─── Entry point ────────────────────────────────────────────────────────────

export interface PrepareComponentLibraryOptions {
  workspaceRoot: string;
  /** The designs folder (`.open-design` by default), for collection lookups. */
  outputDir: string;
  entryPaths?: string[];
  collectionId?: string;
  library?: string;
  /** Where the components go (workspace-relative); the tool argument `outputDir`. */
  componentsDir?: string;
  record?: unknown;
  getDesignSystem: (id: string) => Promise<DesignSystemDetail | undefined>;
  now?: () => Date;
}

async function loadSources(options: PrepareComponentLibraryOptions): Promise<{ artifacts: SourceArtifact[] } | PrepareComponentLibraryResult> {
  let entryPaths = options.entryPaths;
  if (entryPaths !== undefined && (!Array.isArray(entryPaths) || entryPaths.some((p) => typeof p !== 'string' || !p.trim()))) {
    return { ok: false, code: 'invalid-args', text: '"entryPaths" must be a list of artifact entry paths.' };
  }
  if (!entryPaths?.length) {
    if (!options.collectionId) return { ok: false, code: 'invalid-args', text: 'Pass "entryPaths" (1 to 10 registered artifacts) or a "collectionId".' };
    const screens = await findCollectionArtifacts(options.workspaceRoot, options.outputDir, options.collectionId);
    if (!screens.length) return { ok: false, code: 'not-registered', text: `No registered screens in collection "${options.collectionId}".` };
    entryPaths = screens.map((s) => s.entryPath);
  }
  if (entryPaths.length > MAX_ENTRIES) return { ok: false, code: 'invalid-args', text: `At most ${MAX_ENTRIES} artifacts at once; pass fewer "entryPaths".` };
  const artifacts: SourceArtifact[] = [];
  for (const entryPath of [...new Set(entryPaths)]) {
    let read;
    try {
      read = await readArtifact({ workspaceRoot: options.workspaceRoot, entryPath });
    } catch (err) {
      return { ok: false, code: 'invalid-args', text: err instanceof Error ? err.message : String(err) };
    }
    if (!read || !read.manifest) {
      return { ok: false, code: 'not-registered', text: `${entryPath} is not a registered artifact. Register it with register_open_design_artifact first.` };
    }
    const title = typeof read.manifest.title === 'string' ? read.manifest.title : path.posix.basename(entryPath, path.posix.extname(entryPath));
    artifacts.push({ entryPath, title, html: read.entryContent, manifest: read.manifest });
  }
  return { artifacts };
}

async function writeRecord(options: PrepareComponentLibraryOptions, artifacts: SourceArtifact[]): Promise<PrepareComponentLibraryResult> {
  const valid = validateComponentLibraryRecord(options.record);
  if ('error' in valid) return { ok: false, code: 'invalid-record', text: `${valid.error} Nothing was recorded.` };
  const record = { ...valid.record, updatedAt: (options.now ?? (() => new Date()))().toISOString() };
  for (const a of artifacts) {
    const manifest = a.manifest ?? {};
    const metadata = manifest.metadata && typeof manifest.metadata === 'object' && !Array.isArray(manifest.metadata) ? (manifest.metadata as JsonRecord) : {};
    await writeArtifactManifest({
      workspaceRoot: options.workspaceRoot,
      entryPath: a.entryPath,
      artifactManifest: { ...manifest, metadata: { ...metadata, componentLibrary: record } },
    });
  }
  return {
    ok: true,
    text:
      `Recorded the ${record.library} component set (${record.components.length} component${record.components.length === 1 ? '' : 's'} in \`${record.outputDir}\`, theme \`${record.themePath}\`) ` +
      `on ${artifacts.map((a) => `\`${a.entryPath}\``).join(', ')}. A later \`${COMPONENT_LIBRARY_TOOL_NAME}\` call on ${artifacts.length === 1 ? 'it' : 'them'} updates this set.`,
  };
}

async function themeSourceFor(options: PrepareComponentLibraryOptions, artifacts: SourceArtifact[], library: ComponentLibrary): Promise<ThemeSource> {
  const ids = [...new Set(artifacts.map((a) => a.manifest?.designSystemId).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  for (const id of ids) {
    const detail = await options.getDesignSystem(id);
    if (!detail) continue;
    const resolved = resolveDesignSystemDetailTokens(detail);
    const note = ids.length > 1 ? ` (the designs use ${ids.length} design systems: ${ids.join(', ')}; this one is first)` : '';
    return { label: `the \`${detail.id}\` design system${note}`, theme: buildLibraryTheme(resolved.tokens, library) };
  }
  for (const a of artifacts) {
    const tokens = extractRootTokens(a.html);
    if (hasThemeTokens(tokens)) return { label: `the \`:root\` tokens in \`${a.entryPath}\``, theme: buildLibraryTheme(tokens, library) };
  }
  return { label: 'nothing' };
}

function defaultComponentsDir(app: AppInfo, artifacts: SourceArtifact[], collectionName: string | undefined): string {
  const name = toPascalCase(collectionName ?? artifacts[0].title);
  const base = app.hasSrcDir ? 'src/components' : 'components';
  return path.posix.join(app.appDir, base, name);
}

export async function prepareComponentLibrary(options: PrepareComponentLibraryOptions): Promise<PrepareComponentLibraryResult> {
  const requested = options.library ?? 'auto';
  if (requested !== 'auto' && !COMPONENT_LIBRARIES.includes(requested as ComponentLibrary)) {
    return {
      ok: false,
      code: 'unsupported-library',
      text: `"${requested}" isn't supported yet. Supported libraries: ${COMPONENT_LIBRARIES.join(', ')} (or "auto" to pick from the app's dependencies).`,
    };
  }
  if (options.componentsDir !== undefined && !isRelativePath(options.componentsDir)) {
    return { ok: false, code: 'invalid-args', text: '"outputDir" must be a workspace-relative folder.' };
  }

  const loaded = await loadSources(options);
  if ('ok' in loaded) return loaded;
  const { artifacts } = loaded;

  if (options.record !== undefined) return writeRecord(options, artifacts);

  const app = await detectApp(options.workspaceRoot, options.componentsDir ?? '');
  if (!app) {
    return {
      ok: false,
      code: 'no-app',
      text: "There's no app here to add components to: no package.json was found in this workspace. A component set needs a React app; open the app's folder, or pass outputDir inside it.",
    };
  }
  const choice = chooseLibrary(app, requested as ComponentLibrary | 'auto');
  if ('error' in choice) {
    if (choice.error === 'unsupported-framework') {
      return {
        ok: false,
        code: 'unsupported-framework',
        text: `Component sets are built for React apps, and ${app.appDir ? `\`${app.appDir}\`` : 'this app'} doesn't depend on react${choice.found.length ? ` (found ${choice.found.join(', ')})` : ''}. Other frameworks are a later change; port_open_design_artifact_to_app can still port a page into this app.`,
      };
    }
    return {
      ok: false,
      code: 'needs-choice',
      text: `${choice.found.length ? `The app has ${choice.found.join(' and ')}` : "The app has neither MUI nor shadcn/ui"}, so the library can't be picked automatically. Ask the user once: "mui" (Material UI themed to Material 3) or "shadcn" (shadcn/ui), then call ${COMPONENT_LIBRARY_TOOL_NAME} again with that library.`,
    };
  }

  const records = artifacts.map((a) => recordedLibrary(a.manifest)).filter((r): r is ComponentLibraryRecord => r !== undefined);
  const existing = records.find((r) => r.library === choice.library);
  const otherLibraries = records.filter((r) => r.library !== choice.library).filter((r, i, all) => all.findIndex((x) => x.outputDir === r.outputDir) === i);
  const collectionName = options.collectionId ? (artifacts[0].manifest?.collectionName as string | undefined) ?? options.collectionId : undefined;
  const componentsDir = options.componentsDir?.replace(/\/+$/, '') ?? existing?.outputDir ?? defaultComponentsDir(app, artifacts, collectionName);

  const text = composeComponentLibraryInstructions({
    library: choice.library,
    installed: choice.installed,
    app,
    componentsDir,
    artifacts,
    candidates: scanComponentCandidates(artifacts.map((a) => ({ entryPath: a.entryPath, html: a.html }))),
    themeSource: await themeSourceFor(options, artifacts, choice.library),
    existing,
    otherLibraries,
  });
  return { ok: true, text };
}
