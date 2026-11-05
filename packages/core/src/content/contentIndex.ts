import { BRAND_FILE, parseBrandRecord, type BrandRecord } from '../generation/brandKit';
import { promises as fs } from 'node:fs';
import { APP_COMPONENTS_FILE, parseAppComponentsFile, type AppComponentsFile } from '../generation/appDesignSystem';
import * as path from 'node:path';
import matter from 'gray-matter';
import { loadIntegrationRegistry, type IntegrationRegistry } from '../integrations/registry';
import { loadPrintHouses, type PrintHouse } from '../poster/printHouses';
import { DESIGN_SECTIONS_FILE, applyDesignSections } from './designSections';
import { loadGallerySite, type GallerySite } from './gallerySite';
import { MIN_FEATURES, distinctiveFeatures, featureCount, styleVector, vectorDistance, vectorScale, type StyleVector, type VectorScale } from './styleVector';
import { computeDesignSystemFacets, designSystemTokenMap, loadDesignSystemDescriptors, matchesAllWords, rankDesignSystems, type DesignProfile, type DesignSystemDescriptor, type DesignSystemFacets, type MatchCandidate, type RecommendationResult } from './designSystemMatching';

export type SkillSource = 'skill' | 'design-template' | 'example' | 'community';
// Priority order used both to decide which source keeps the plain public id
// when two entries collide on bare dirId (see mergeSkillPools) and as the
// tie-break `getSkill` applies to an ambiguous bare-id/legacy lookup: the
// entry describing the task/style wins over one that merely happens to
// share its name (typically its own rendered example). 'community' is last
// (lowest priority) deliberately: it's unreviewed, runtime-fetched content
// (see loadedSkills()) and must never shadow an official skill/template/
// example on a colliding dirId — it only ever gets the `:community`-suffixed
// id in that case.
const SKILL_SOURCES: readonly SkillSource[] = ['skill', 'design-template', 'example', 'community'];

// od.mode covers 271/277 vendored skills+design-templates (98%) with a
// small, clean vocabulary — far better coverage than od.category (62%,
// ~34 values) or the sparse top-level category/scenario fields (~9% each).
// Used as the primary organizing facet, baked directly into each entry's
// public id (`od:<mode>:<dirId>`) rather than a separate field the model
// has to remember to read. 'design-system' here means "a skill that helps
// AUTHOR a design system deliverable" — unrelated to the separate
// `design-systems/` catalog of prebuilt brand token packs used as
// designSystemId; see the disambiguating note in package.json's
// modelDescription.
export const SKILL_MODES = [
  'prototype',
  'deck',
  'design-system',
  'image',
  'video',
  'template',
  'utility',
  'audio',
] as const;
export type SkillMode = (typeof SKILL_MODES)[number] | 'other';

const SKILL_MODE_SET: ReadonlySet<string> = new Set(SKILL_MODES);

function normalizeMode(value: unknown): SkillMode {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SKILL_MODE_SET.has(raw) ? (raw as SkillMode) : 'other';
}

export function toPublicSkillId(mode: SkillMode, dirId: string): string {
  return `od:${mode}:${dirId}`;
}

// Accepts either the public `od:<mode>:<dirId>` form (with or without the
// `:<source>` collision-disambiguation suffix `mergeSkillPools` appends —
// see its own comment) or a bare dirId, and returns the plain dirId. Used
// only as a fallback when an exact public-id lookup misses; the returned
// dirId narrows the candidate set, it doesn't uniquely resolve one entry by
// itself when a collision suffix was stripped off.
export function parseSkillId(input: string): string {
  const match = /^od:[^:]+:(.+)$/.exec(input.trim());
  let rest = match ? match[1] : input.trim();
  for (const suffix of SKILL_SOURCES) {
    if (rest.endsWith(`:${suffix}`)) {
      rest = rest.slice(0, -(suffix.length + 1));
      break;
    }
  }
  return rest;
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  category?: string;
  mode: SkillMode;
  source: SkillSource;
  examplePrompt?: string;
  featured: boolean;
  /** Vendored-relative path to a rendered example.html, when this entry is remixable. */
  exampleArtifactPath?: string;
  /** A catalog stub: its SKILL.md only advertises an upstream skill and the entry ships nothing else. */
  stub?: boolean;
}

export interface SkillDetail extends SkillSummary {
  body: string;
  /** Upstream's free-form canvas-size hint, e.g. "1600×900 (16:9)" — see parseAspectHint. */
  aspectHint?: string;
  /** `od.craft.requires`: the craft docs this skill asks for (upstream semantics; see resolveCraftSections). */
  craftRequires: string[];
}

export type DesignSystemSource = 'built-in' | 'user';

export interface DesignSystemSummary {
  id: string;
  name: string;
  summary: string;
  category?: string;
  /** 'built-in' = bundled with the extension (read-only); 'user' = written into the workspace via create_open_design_design_system. */
  source: DesignSystemSource;
  /** Whether the design system ships a `tokens.css` (upstream's canonical token source). Custom systems may not yet. */
  hasTokens: boolean;
}

export interface DesignSystemDetail extends DesignSystemSummary {
  body: string;
  /** manifest.json `craft.suggested`: metadata only; upstream never injects it into a brief. */
  craftSuggested: string[];
  /** manifest.json `craft.applies`: craft docs added to every brief made with this system. */
  craftApplies: string[];
  /** manifest.json `craft.exemptions`: craft docs removed from every brief made with this system. */
  craftExemptions: string[];
  /** The design system's `tokens.css`, when it has one. */
  tokensCss?: string;
  /** User systems saved from an app: its component vocabulary and scanned tokens (openspec add-design-from-app). */
  appComponents?: AppComponentsFile;
  /** User systems with a brand.json: own brand or reference, descriptor, marks and the brand kit (openspec connect-brand-design-systems). */
  brand?: BrandRecord;
  /** Built-in only: the extension's additive local override (content overlay `tokens.override.css`), applied on top of `tokensCss`. */
  tokensOverrideCss?: string;
}

async function readOptional(p: string): Promise<string | undefined> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return undefined;
  }
}

export interface CraftSection {
  id: string;
  body: string;
}

interface LoadedContent {
  skills: Map<string, SkillDetail>;
  designSystems: Map<string, DesignSystemDetail>;
  craft: CraftSection[];
  surfaces: Surface[];
  goals: Goal[];
  descriptors: Map<string, DesignSystemDescriptor>;
}

/** A kind of thing to make (openspec add-surface-picker): the extension-owned surfaces.json at the assets root. */
export interface Surface {
  id: string;
  label: string;
  description: string;
  icon?: string;
  status: 'ready' | 'planned';
  /** A host prompt that owns this surface's flow, e.g. "open-design-poster". */
  prompt?: string;
  /** Catalog directory ids; each expands to every non-stub entry with that id. */
  entries: string[];
  questions: SurfaceQuestion[];
}

/**
 * One clarifying question a surface asks (openspec add-brief-questions). A
 * plain-string question in older or community content loads with an id
 * slugged from its text and no options.
 */
export interface SurfaceQuestion {
  id: string;
  text: string;
  /** Two to four short answers to offer. */
  options?: string[];
  /** The option used when the user says "you pick". */
  default?: string;
  /** What the answer changes in the design, e.g. "size, bleed and file type". */
  changes?: string;
}

function questionSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'question';
}

export function normalizeSurfaceQuestions(value: unknown): SurfaceQuestion[] {
  if (!Array.isArray(value)) return [];
  const out: SurfaceQuestion[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      if (item.trim()) out.push({ id: questionSlug(item), text: item });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const q = item as Record<string, unknown>;
    if (typeof q.text !== 'string' || !q.text.trim()) continue;
    const options = normalizeStringArray(q.options);
    out.push({
      id: typeof q.id === 'string' && q.id ? q.id : questionSlug(q.text),
      text: q.text,
      ...(options.length > 0 ? { options } : {}),
      ...(typeof q.default === 'string' && options.includes(q.default) ? { default: q.default } : {}),
      ...(typeof q.changes === 'string' && q.changes ? { changes: q.changes } : {}),
    });
  }
  return out;
}

/** A plain-language aim that routes to ready surfaces, in order (openspec desktop-first-run-welcome). */
export interface Goal {
  id: string;
  label: string;
  description: string;
  icon?: string;
  /** Surface ids, the first being the default. */
  surfaces: string[];
}

/** Mirrors packages/content/scripts/surfaces.mjs (the build guard): keep the two in step. */
const STUB_MARKER = 'This catalogue entry advertises';
const STUB_IGNORED_FILES = new Set(['SKILL.md', '.od-local-overlay']);

async function isStubDir(dir: string, body: string): Promise<boolean> {
  if (!body.includes(STUB_MARKER)) return false;
  const others = (await fs.readdir(dir)).filter((n) => !STUB_IGNORED_FILES.has(n));
  return others.length === 0;
}

async function loadSurfaces(assetsRoot: string): Promise<Surface[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path.join(assetsRoot, 'surfaces.json'), 'utf8'));
  } catch {
    return [];
  }
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { surfaces?: unknown }).surfaces) ? ((raw as { surfaces: unknown[] }).surfaces) : [];
  const out: Surface[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    if (typeof s.id !== 'string' || typeof s.label !== 'string' || typeof s.description !== 'string') continue;
    out.push({
      id: s.id,
      label: s.label,
      description: s.description,
      icon: typeof s.icon === 'string' ? s.icon : undefined,
      status: s.status === 'ready' ? 'ready' : 'planned',
      prompt: typeof s.prompt === 'string' ? s.prompt : undefined,
      entries: normalizeStringArray(s.entries),
      questions: normalizeSurfaceQuestions(s.questions),
    });
  }
  return out;
}

async function loadGoals(assetsRoot: string): Promise<Goal[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path.join(assetsRoot, 'surfaces.json'), 'utf8'));
  } catch {
    return [];
  }
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { goals?: unknown }).goals) ? ((raw as { goals: unknown[] }).goals) : [];
  const out: Goal[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const g = item as Record<string, unknown>;
    if (typeof g.id !== 'string' || typeof g.label !== 'string' || typeof g.description !== 'string') continue;
    out.push({ id: g.id, label: g.label, description: g.description, icon: typeof g.icon === 'string' ? g.icon : undefined, surfaces: normalizeStringArray(g.surfaces) });
  }
  return out;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function normalizeDescription(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return '';
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function isFeatured(data: Record<string, unknown>, od: Record<string, unknown> | undefined): boolean {
  // Upstream curation signals are inconsistent (see openspec design notes):
  // a top-level `featured`/`recommended` rank on most skills, and a rarer
  // `od.default_for` marking a template as the default for an artifact kind
  // (e.g. the one entry with `od.default_for: deck`). Presence of any of
  // these — not their specific value — is what we treat as "curated".
  if (data.featured !== undefined) return true;
  if (data.recommended !== undefined) return true;
  if (od?.default_for !== undefined) return true;
  return false;
}

async function loadSkillLikeDir(assetsRoot: string, subdir: string, source: SkillSource): Promise<Map<string, SkillDetail>> {
  const dir = path.join(assetsRoot, subdir);
  const result = new Map<string, SkillDetail>();
  if (!(await pathExists(dir))) return result;

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMdPath = path.join(dir, entry.name, 'SKILL.md');
    if (!(await pathExists(skillMdPath))) continue;
    const raw = await fs.readFile(skillMdPath, 'utf8');
    const { data, content } = matter(raw);
    const od = (data as Record<string, unknown>).od as Record<string, unknown> | undefined;
    const displayName =
      (typeof data.en_name === 'string' && data.en_name.trim()) ||
      (typeof data.name === 'string' && data.name.trim()) ||
      entry.name;
    result.set(entry.name, {
      id: entry.name,
      name: displayName,
      description: normalizeDescription(data.en_description ?? data.description),
      triggers: [...normalizeStringArray(data.triggers), ...normalizeStringArray(data.tags)],
      category: typeof od?.category === 'string' ? od.category : typeof data.category === 'string' ? data.category : undefined,
      mode: normalizeMode(od?.mode),
      source,
      examplePrompt: typeof od?.example_prompt === 'string' ? od.example_prompt : undefined,
      featured: isFeatured(data as Record<string, unknown>, od),
      body: content.trim(),
      aspectHint: typeof data.aspect_hint === 'string' ? data.aspect_hint : undefined,
      craftRequires: craftRequiresOf(od),
      stub: (await isStubDir(path.join(dir, entry.name), content)) || undefined,
    });
  }
  return result;
}

// Examples (vendored from plugins/_official/examples/*, or synced at runtime
// from the community content repo — see loadedSkills()) share the SKILL.md
// shape but carry their example prompt in a sibling open-design.json
// manifest (`od.useCase.query.en`), not in SKILL.md's own `od.example_prompt`
// — and, uniquely among the skill-like pools, ship an actual rendered
// example.html, which is the remix source. Only entries with a vendored
// example.html are loaded here; the sync script already filters to those.
// `source` defaults to 'example' (the built-in pool); the community pool
// passes 'community' explicitly so entries are tagged and prioritized
// correctly without any other change to this loader.
async function loadExamples(assetsRoot: string, source: SkillSource = 'example'): Promise<Map<string, SkillDetail>> {
  const dir = path.join(assetsRoot, 'examples');
  const result = new Map<string, SkillDetail>();
  if (!(await pathExists(dir))) return result;

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMdPath = path.join(dir, entry.name, 'SKILL.md');
    const exampleHtmlPath = path.join(dir, entry.name, 'example.html');
    if (!(await pathExists(skillMdPath)) || !(await pathExists(exampleHtmlPath))) continue;

    const raw = await fs.readFile(skillMdPath, 'utf8');
    const { data, content } = matter(raw);
    const od = (data as Record<string, unknown>).od as Record<string, unknown> | undefined;
    const displayName =
      (typeof data.en_name === 'string' && data.en_name.trim()) ||
      (typeof data.name === 'string' && data.name.trim()) ||
      entry.name;

    let examplePrompt: string | undefined;
    const manifestPath = path.join(dir, entry.name, 'open-design.json');
    if (await pathExists(manifestPath)) {
      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        const query = manifest?.od?.useCase?.query;
        if (typeof query?.en === 'string' && query.en.trim()) examplePrompt = query.en.trim();
      } catch {
        // Malformed manifest: examplePrompt stays undefined, entry still usable.
      }
    }

    result.set(entry.name, {
      id: entry.name,
      name: displayName,
      description: normalizeDescription(data.en_description ?? data.description),
      triggers: [...normalizeStringArray(data.triggers), ...normalizeStringArray(data.tags)],
      category: typeof od?.category === 'string' ? od.category : typeof data.category === 'string' ? data.category : undefined,
      mode: normalizeMode(od?.mode),
      source,
      examplePrompt,
      featured: false,
      exampleArtifactPath: path.posix.join('examples', entry.name, 'example.html'),
      body: content.trim(),
      aspectHint: typeof data.aspect_hint === 'string' ? data.aspect_hint : undefined,
      craftRequires: craftRequiresOf(od),
    });
  }
  return result;
}

/** `od.craft.requires` from a skill's frontmatter. */
function craftRequiresOf(od: Record<string, unknown> | undefined): string[] {
  const craft = od?.craft as Record<string, unknown> | undefined;
  return normalizeStringArray(craft?.requires);
}

// Fallback for the small number of legacy design-system folders that ship
// DESIGN.md only, with no manifest.json (see design-systems/README.md
// upstream) — parses the leading `# Heading` + blockquote convention.
function parseDesignSystemMarkdown(id: string, raw: string): { name: string; summary: string } {
  const lines = raw.split(/\r?\n/);
  let name = id;
  const summaryLines: string[] = [];
  let i = 0;
  while (i < lines.length && !lines[i].trim().startsWith('#')) i++;
  if (i < lines.length) {
    name = lines[i].replace(/^#+\s*/, '').trim() || id;
    i++;
  }
  while (i < lines.length && lines[i].trim() === '') i++;
  while (i < lines.length && lines[i].trim().startsWith('>')) {
    summaryLines.push(lines[i].replace(/^\s*>\s?/, ''));
    i++;
  }
  return { name, summary: summaryLines.join(' ').trim() };
}

interface DesignSystemManifest {
  id?: string;
  name?: string;
  category?: string;
  description?: string;
  craft?: { suggested?: unknown; applies?: unknown; exemptions?: unknown };
}

/**
 * The content overlay's DESIGN.sections.md, when present, replaces the
 * sections of DESIGN.md that disagree with tokens.css. The overlay step
 * already rejects unknown headings, so a failure here means a hand-copied
 * assets tree; the vendored text is used rather than failing the whole index.
 */
function withDesignSections(id: string, designMd: string, sectionsMd: string | undefined): string {
  if (sectionsMd === undefined) return designMd;
  try {
    return applyDesignSections(designMd, sectionsMd, id);
  } catch {
    return designMd;
  }
}

async function loadDesignSystems(assetsRoot: string): Promise<Map<string, DesignSystemDetail>> {
  const dsDir = path.join(assetsRoot, 'design-systems');
  const result = new Map<string, DesignSystemDetail>();
  if (!(await pathExists(dsDir))) return result;

  const entries = await fs.readdir(dsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const designMdPath = path.join(dsDir, entry.name, 'DESIGN.md');
    if (!(await pathExists(designMdPath))) continue;
    const vendoredMd = await fs.readFile(designMdPath, 'utf8');
    const raw = withDesignSections(entry.name, vendoredMd, await readOptional(path.join(dsDir, entry.name, DESIGN_SECTIONS_FILE)));
    const tokensCss = await readOptional(path.join(dsDir, entry.name, 'tokens.css'));
    const tokensOverrideCss = await readOptional(path.join(dsDir, entry.name, 'tokens.override.css'));
    const tokens = { hasTokens: tokensCss !== undefined, tokensCss, tokensOverrideCss };

    const manifestPath = path.join(dsDir, entry.name, 'manifest.json');
    let manifest: DesignSystemManifest | undefined;
    if (await pathExists(manifestPath)) {
      try {
        manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      } catch {
        manifest = undefined;
      }
    }

    if (manifest?.name && manifest?.description !== undefined) {
      result.set(entry.name, {
        id: entry.name,
        name: manifest.name,
        summary: normalizeDescription(manifest.description),
        category: manifest.category,
        craftSuggested: normalizeStringArray(manifest.craft?.suggested),
        craftApplies: normalizeStringArray(manifest.craft?.applies),
        craftExemptions: normalizeStringArray(manifest.craft?.exemptions),
        source: 'built-in',
        body: raw.trim(),
        ...tokens,
      });
    } else {
      const fallback = parseDesignSystemMarkdown(entry.name, raw);
      result.set(entry.name, {
        id: entry.name,
        name: fallback.name,
        summary: fallback.summary,
        category: undefined,
        craftSuggested: [],
        craftApplies: [],
        craftExemptions: [],
        source: 'built-in',
        body: raw.trim(),
        ...tokens,
      });
    }
  }
  return result;
}

// User-created design systems (via create_open_design_design_system) live
// as a plain `DESIGN.md` under the workspace's Open Design output directory
// — no manifest.json support for these in v1, so they always go through
// the same blockquote-convention fallback parser as legacy built-ins with
// no manifest. Deliberately NOT part of ensureLoaded()'s cached Promise:
// this is re-scanned on every call (see ContentIndex.loadedDesignSystems),
// since it's a handful of small workspace-local files that must reflect a
// system the model just wrote in the same session, with no extension
// reload — unlike the ~152 bundled built-ins, which are legitimately
// cacheable (immutable for the life of the extension host).
/** A user system's recommender descriptor from its brand.json, when it has one. */
function brandDescriptor(detail: DesignSystemDetail): DesignSystemDescriptor | undefined {
  const brand = detail.brand;
  if (!brand) return undefined;
  const d = brand.descriptor ?? {};
  return { kind: 'brand', moods: d.moods ?? [], industries: d.industries ?? [], surfaces: d.surfaces?.length ? d.surfaces : ['web', 'mobile', 'print', 'slides'] };
}

async function loadUserDesignSystems(dir: string | undefined): Promise<Map<string, DesignSystemDetail>> {
  const result = new Map<string, DesignSystemDetail>();
  if (!dir || !(await pathExists(dir))) return result;

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const designMdPath = path.join(dir, entry.name, 'DESIGN.md');
    if (!(await pathExists(designMdPath))) continue;
    const raw = await fs.readFile(designMdPath, 'utf8');
    // Prefixed so a user-created id can never collide with a bundled one
    // (both are otherwise plain directory names), and so it reads
    // unambiguously wherever an id surfaces (tool output, QuickPick).
    const id = `user:${entry.name}`;
    const fallback = parseDesignSystemMarkdown(id, raw);
    // Never an override for custom systems: the user owns tokens.css directly.
    const tokensCss = await readOptional(path.join(dir, entry.name, 'tokens.css'));
    const appComponents = parseAppComponentsFile(await readOptional(path.join(dir, entry.name, APP_COMPONENTS_FILE)));
    const brand = parseBrandRecord(await readOptional(path.join(dir, entry.name, BRAND_FILE)));
    result.set(id, {
      id,
      name: fallback.name,
      summary: fallback.summary,
      category: undefined,
      craftSuggested: [],
      craftApplies: [],
      craftExemptions: [],
      source: 'user',
      body: raw.trim(),
      hasTokens: tokensCss !== undefined,
      tokensCss,
      ...(appComponents ? { appComponents } : {}),
      ...(brand ? { brand } : {}),
    });
  }
  return result;
}

/**
 * The kit's extra craft docs per skill or template id (openspec
 * add-states-and-microcopy-craft): `<assetsRoot>/craft-requires.json`, copied
 * from packages/content/local/ so upstream SKILL.md files stay unedited. Keys
 * starting with `$` are comments. Empty when absent or malformed; the content
 * check is what rejects a bad map.
 */
async function loadCraftRequiresMap(assetsRoot: string): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path.join(assetsRoot, 'craft-requires.json'), 'utf8'));
  } catch {
    return result;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [id, craftIds] of Object.entries(raw as Record<string, unknown>)) {
    if (!id.startsWith('$')) result.set(id, normalizeStringArray(craftIds));
  }
  return result;
}

/** Adds each mapped entry's extra craft docs after its own `od.craft.requires`, without duplicates. */
function applyCraftRequiresMap(skills: Map<string, SkillDetail>, map: Map<string, string[]>): Map<string, SkillDetail> {
  if (map.size === 0) return skills;
  const result = new Map<string, SkillDetail>();
  for (const [publicId, skill] of skills) {
    const extra = map.get(skill.id);
    result.set(publicId, extra ? { ...skill, craftRequires: [...new Set([...skill.craftRequires, ...extra])] } : skill);
  }
  return result;
}

async function loadCraft(assetsRoot: string): Promise<CraftSection[]> {
  const craftDir = path.join(assetsRoot, 'craft');
  const result: CraftSection[] = [];
  if (!(await pathExists(craftDir))) return result;

  const entries = await fs.readdir(craftDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const raw = await fs.readFile(path.join(craftDir, entry.name), 'utf8');
    result.push({ id: entry.name.replace(/\.md$/, ''), body: raw.trim() });
  }
  return result;
}

function matchesQuery(haystacks: string[], query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return haystacks.some((h) => h.toLowerCase().includes(needle));
}

// Merges the three skill-like pools into one catalog, keyed by a
// collision-safe public id. The three pools routinely reuse the same bare
// directory name on purpose — an 'example' is typically the rendered
// counterpart of a same-named skill or design-template (observed for 129 of
// the ~444 vendored entries) — and always shares that entry's `mode` too,
// so `od:<mode>:<dirId>` alone does not disambiguate them. A naive
// bare-id-keyed merge (this function's predecessor) silently dropped
// whichever entry was merged first for every such pair — 129 skills/
// design-templates were unreachable under their own identity, replaced by
// their own example's body/description/mode. Fixed here by keeping every
// entry: within a colliding group, the highest-priority source (see
// SKILL_SOURCES) keeps the plain `od:<mode>:<dirId>` id, and every other
// entry in the group gets its own source name appended
// (`od:<mode>:<dirId>:example`) — so nothing already relying on today's
// (non-colliding) ids changes, and a previously-shadowed entry becomes
// reachable under a clearly-labeled id instead of vanishing.
function mergeSkillPools(...pools: Map<string, SkillDetail>[]): Map<string, SkillDetail> {
  const byDirId = new Map<string, SkillDetail[]>();
  for (const pool of pools) {
    for (const detail of pool.values()) {
      if (!byDirId.has(detail.id)) byDirId.set(detail.id, []);
      byDirId.get(detail.id)!.push(detail);
    }
  }

  const result = new Map<string, SkillDetail>();
  for (const group of byDirId.values()) {
    const sorted =
      group.length === 1 ? group : [...group].sort((a, b) => SKILL_SOURCES.indexOf(a.source) - SKILL_SOURCES.indexOf(b.source));
    sorted.forEach((detail, i) => {
      const base = toPublicSkillId(detail.mode, detail.id);
      result.set(i === 0 ? base : `${base}:${detail.source}`, detail);
    });
  }
  return result;
}

export class ContentIndex {
  private loaded: Promise<LoadedContent> | undefined;
  private integrations: Promise<IntegrationRegistry> | undefined;
  private gallerySite: Promise<GallerySite | undefined> | undefined;
  private printHouses: Promise<PrintHouse[]> | undefined;
  private readonly facetCache = new Map<string, DesignSystemFacets>();
  private readonly vectorCache = new Map<string, StyleVector>();
  private scaleCache: VectorScale | undefined;

  constructor(
    private readonly assetsRoot: string,
    // Returns the absolute path to scan for user-created design systems
    // (`<workspaceRoot>/<outputDirectory>/design-systems`), or undefined
    // when no workspace folder is open. A callback (not a value captured
    // once) so it reflects whatever workspace is open at query time, kept
    // out of this otherwise vscode-free/testable module — the extension
    // host is the only caller that needs to supply one.
    private readonly getUserDesignSystemsDir?: () => string | undefined,
    // Returns the absolute path to the runtime-fetched community-content
    // cache root (see communityContent.ts in the vscode package), or
    // undefined if it's never been synced. Same shape/reasoning as
    // getUserDesignSystemsDir: a callback, not a captured value, so a sync
    // command's write is visible on the very next query with no reload —
    // see loadedSkills().
    private readonly getCommunityContentDir?: () => string | undefined,
  ) {}

  /** Trusted third-party MCP servers (openspec add-integration-registry): `<assetsRoot>/integrations.json`, empty when absent. */
  getIntegrationRegistry(): Promise<IntegrationRegistry> {
    if (!this.integrations) this.integrations = loadIntegrationRegistry(this.assetsRoot).then((r) => r.registry);
    return this.integrations;
  }

  /** The public gallery's settings while it is live (openspec link-public-gallery); undefined otherwise, so callers give no links. */
  async getLiveGallery(): Promise<GallerySite | undefined> {
    if (!this.gallerySite) this.gallerySite = loadGallerySite(this.assetsRoot);
    const site = await this.gallerySite;
    return site?.live ? site : undefined;
  }

  private ensureLoaded(): Promise<LoadedContent> {
    if (!this.loaded) {
      this.loaded = Promise.all([
        loadSkillLikeDir(this.assetsRoot, 'skills', 'skill'),
        loadSkillLikeDir(this.assetsRoot, 'design-templates', 'design-template'),
        loadExamples(this.assetsRoot),
        loadDesignSystems(this.assetsRoot),
        loadCraft(this.assetsRoot),
        loadSurfaces(this.assetsRoot),
        loadGoals(this.assetsRoot),
        loadDesignSystemDescriptors(this.assetsRoot),
        loadCraftRequiresMap(this.assetsRoot),
      ]).then(([skills, templates, examples, designSystems, craft, surfaces, goals, descriptors, craftRequiresMap]) => ({
        skills: applyCraftRequiresMap(mergeSkillPools(skills, templates, examples), craftRequiresMap),
        designSystems,
        craft,
        surfaces,
        goals,
        descriptors,
      }));
    }
    return this.loaded;
  }

  // Merges the cached built-in skill/template/example pool with a
  // freshly-rescanned community pool on every call — same reasoning as
  // loadedDesignSystems()'s user-pool rescan: a sync command can replace the
  // on-disk community cache at any moment in the session, with no reload.
  // mergeSkillPools regroups by each entry's own `.id` (dirId) regardless of
  // whether its input map is raw or already merged, so re-running it here
  // against the cached (already-merged) pool plus the fresh community pool
  // correctly re-applies collision-priority ordering (community always
  // loses) without re-deriving anything from the cached pool.
  private async loadedSkills(): Promise<Map<string, SkillDetail>> {
    const { skills } = await this.ensureLoaded();
    const communityDir = this.getCommunityContentDir?.();
    const communitySkills = communityDir ? await loadExamples(communityDir, 'community') : new Map<string, SkillDetail>();
    if (communitySkills.size === 0) return skills;
    return mergeSkillPools(skills, communitySkills);
  }

  async listSkills(query?: string, mode?: string, source?: string, remixableOnly?: boolean): Promise<SkillSummary[]> {
    const skills = await this.loadedSkills();
    const wantedMode = mode?.trim().toLowerCase();
    const wantedSource = source?.trim().toLowerCase();
    const results: SkillSummary[] = [];
    for (const [publicId, skill] of skills) {
      if (wantedMode && skill.mode !== wantedMode) continue;
      if (wantedSource && skill.source !== wantedSource) continue;
      if (remixableOnly && !skill.exampleArtifactPath) continue;
      if (query && !matchesQuery([skill.id, skill.name, skill.description, ...skill.triggers], query)) continue;
      results.push({
        id: publicId,
        name: skill.name,
        description: skill.description,
        triggers: skill.triggers,
        category: skill.category,
        mode: skill.mode,
        source: skill.source,
        examplePrompt: skill.examplePrompt,
        featured: skill.featured,
        exampleArtifactPath: skill.exampleArtifactPath,
        stub: skill.stub,
      });
    }
    results.sort((a, b) => a.mode.localeCompare(b.mode) || a.name.localeCompare(b.name));
    return results;
  }

  /** Ready surfaces, in catalog order, each with how many entries it resolves to. */
  async listSurfaces(): Promise<Array<Surface & { entryCount: number }>> {
    const { surfaces } = await this.ensureLoaded();
    const out: Array<Surface & { entryCount: number }> = [];
    for (const s of surfaces) if (s.status === 'ready') out.push({ ...s, entryCount: (await this.surfaceEntries(s.id))?.length ?? 0 });
    return out;
  }

  /** The goals, each with only its ready surfaces; goals left with none are dropped. */
  async listGoals(): Promise<Goal[]> {
    const { surfaces, goals } = await this.ensureLoaded();
    const ready = new Set(surfaces.filter((s) => s.status === 'ready').map((s) => s.id));
    return goals.map((g) => ({ ...g, surfaces: g.surfaces.filter((id) => ready.has(id)) })).filter((g) => g.surfaces.length > 0);
  }

  /** Card and sticker printers' file requirements (openspec add-print-house-images); invalid profiles are left out. */
  async listPrintHouses(): Promise<PrintHouse[]> {
    this.printHouses ??= loadPrintHouses(this.assetsRoot).then((r) => r.printHouses);
    return this.printHouses;
  }

  async getPrintHouse(id: string): Promise<PrintHouse | undefined> {
    return (await this.listPrintHouses()).find((p) => p.id === id.trim());
  }

  /** A goal by id (with only its ready surfaces), or undefined. */
  async getGoal(id: string): Promise<Goal | undefined> {
    return (await this.listGoals()).find((g) => g.id === id.trim());
  }

  /** A ready surface by id, or undefined. */
  async getSurface(id: string): Promise<Surface | undefined> {
    const { surfaces } = await this.ensureLoaded();
    return surfaces.find((s) => s.id === id.trim() && s.status === 'ready');
  }

  /**
   * A ready surface's entries in catalog order: each directory id expands to
   * every non-stub skill, design template and example with that id, in that
   * order (the recipe first, then its remixable example). Undefined for an
   * unknown or planned surface.
   */
  async surfaceEntries(id: string): Promise<SkillSummary[] | undefined> {
    const surface = await this.getSurface(id);
    if (!surface) return undefined;
    const skills = await this.loadedSkills();
    const out: SkillSummary[] = [];
    for (const dirId of surface.entries) {
      const matches = [...skills.entries()]
        .filter(([, s]) => s.id === dirId && !s.stub)
        .sort(([, a], [, b]) => SKILL_SOURCES.indexOf(a.source) - SKILL_SOURCES.indexOf(b.source));
      for (const [publicId, skill] of matches) {
        out.push({
          id: publicId,
          name: skill.name,
          description: skill.description,
          triggers: skill.triggers,
          category: skill.category,
          mode: skill.mode,
          source: skill.source,
          examplePrompt: skill.examplePrompt,
          featured: skill.featured,
          exampleArtifactPath: skill.exampleArtifactPath,
        });
      }
    }
    return out;
  }

  async getSkill(id: string): Promise<SkillDetail | undefined> {
    const skills = await this.loadedSkills();
    const trimmed = id.trim();
    // Exact match against the map's own (collision-safe) public ids first —
    // covers every non-colliding entry, and any caller correctly round-tripping
    // a `:<source>`-suffixed id exactly as listSkills() returned it.
    const exact = skills.get(trimmed);
    if (exact) return exact;
    // Fallback for a bare dirId, or an id whose mode/suffix didn't exactly
    // match anything stored (e.g. legacy callers that only ever knew the
    // bare id): narrow by dirId and prefer the highest-priority source, so
    // "give me the skill named X" resolves to the actual skill/template
    // rather than whichever entry happened to load last.
    const bareId = parseSkillId(trimmed);
    const candidates = [...skills.values()].filter((s) => s.id === bareId);
    if (candidates.length === 0) return undefined;
    candidates.sort((a, b) => SKILL_SOURCES.indexOf(a.source) - SKILL_SOURCES.indexOf(b.source));
    return candidates[0];
  }

  async listSkillModes(): Promise<SkillMode[]> {
    const skills = await this.loadedSkills();
    const modes = new Set<SkillMode>();
    for (const skill of skills.values()) modes.add(skill.mode);
    return [...modes].sort((a, b) => a.localeCompare(b));
  }

  // Merges the cached built-in pool with a freshly-rescanned user pool on
  // every call — see loadUserDesignSystems()'s comment for why the user
  // pool is never cached.
  private async loadedDesignSystems(): Promise<Map<string, DesignSystemDetail>> {
    const { designSystems } = await this.ensureLoaded();
    const userSystems = await loadUserDesignSystems(this.getUserDesignSystemsDir?.());
    if (userSystems.size === 0) return designSystems;
    return new Map([...designSystems, ...userSystems]);
  }

  async listDesignSystems(query?: string, category?: string): Promise<DesignSystemSummary[]> {
    const designSystems = await this.loadedDesignSystems();
    const { descriptors } = await this.ensureLoaded();
    const results: DesignSystemSummary[] = [];
    const wantedCategory = category?.trim().toLowerCase();
    for (const ds of designSystems.values()) {
      if (wantedCategory && (ds.category ?? '').toLowerCase() !== wantedCategory) continue;
      const d = descriptors.get(ds.id);
      const descriptorWords = d ? [d.kind, ...d.moods, ...d.industries, ...d.surfaces] : [];
      if (query && !matchesAllWords([ds.id, ds.name, ds.summary, ds.category ?? '', ...descriptorWords], query)) continue;
      results.push({ id: ds.id, name: ds.name, summary: ds.summary, category: ds.category, source: ds.source, hasTokens: ds.hasTokens });
    }
    results.sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name));
    return results;
  }

  async listDesignSystemCategories(): Promise<string[]> {
    const designSystems = await this.loadedDesignSystems();
    const categories = new Set<string>();
    for (const ds of designSystems.values()) {
      if (ds.category) categories.add(ds.category);
    }
    return [...categories].sort((a, b) => a.localeCompare(b));
  }

  /**
   * Ranks design systems against a design profile (openspec add-design-system-matching).
   * Deterministic for a given catalog; never changes the active design system.
   */
  /** Style vectors of every design system (built-ins cached), and the bundled set's scale. */
  private async styleVectors(): Promise<{ vectors: Map<string, { vector: StyleVector; detail: DesignSystemDetail }>; scale: VectorScale }> {
    const designSystems = await this.loadedDesignSystems();
    const vectors = new Map<string, { vector: StyleVector; detail: DesignSystemDetail }>();
    for (const detail of designSystems.values()) {
      let vector = detail.source === 'built-in' ? this.vectorCache.get(detail.id) : undefined;
      if (!vector) {
        vector = styleVector(designSystemTokenMap(detail));
        if (detail.source === 'built-in') this.vectorCache.set(detail.id, vector);
      }
      vectors.set(detail.id, { vector, detail });
    }
    if (!this.scaleCache) this.scaleCache = vectorScale([...vectors.values()].filter((v) => v.detail.source === 'built-in').map((v) => v.vector));
    return { vectors, scale: this.scaleCache };
  }

  /** A design system's tokens, for `like`; undefined for an unknown id. */
  async designSystemTokens(id: string): Promise<Map<string, string> | undefined> {
    const detail = (await this.loadedDesignSystems()).get(id);
    return detail ? designSystemTokenMap(detail) : undefined;
  }

  /**
   * The bundled design systems closest to a set of tokens (an extraction's
   * draft), with what sets the tokens apart from the bundled set
   * (openspec add-nearest-design-system). Needs MIN_FEATURES features.
   */
  async nearestDesignSystems(tokens: Map<string, string> | Record<string, string>, n = 3): Promise<{ nearest?: Array<{ id: string; name: string; distance: number; compared: number; differs: string[] }>; distinctive?: string[]; note?: string }> {
    const target = styleVector(tokens);
    const count = featureCount(target);
    if (count < MIN_FEATURES) return { note: `Only ${count} style features were measured (at least ${MIN_FEATURES} are needed), too little to compare with the bundled design systems.` };
    const { vectors, scale } = await this.styleVectors();
    const ranked = [...vectors.values()]
      .filter((v) => v.detail.source === 'built-in')
      .map((v) => ({ id: v.detail.id, name: v.detail.name, ...vectorDistance(target, v.vector, scale) }))
      .filter((d) => d.compared >= MIN_FEATURES)
      .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
    return { nearest: ranked.slice(0, n), distinctive: distinctiveFeatures(target, scale) };
  }

  async recommendDesignSystems(profile: DesignProfile | undefined, limit?: number, like?: { tokens: Map<string, string> | Record<string, string>; id?: string }): Promise<RecommendationResult> {
    const designSystems = await this.loadedDesignSystems();
    const { descriptors } = await this.ensureLoaded();
    const candidates: MatchCandidate[] = [];
    for (const detail of designSystems.values()) {
      // Built-in facets never change, so they're computed once; custom systems are re-read on every call anyway.
      let facets = detail.source === 'built-in' ? this.facetCache.get(detail.id) : undefined;
      if (!facets) {
        facets = computeDesignSystemFacets(detail);
        if (detail.source === 'built-in') this.facetCache.set(detail.id, facets);
      }
      candidates.push({ detail, facets, descriptor: descriptors.get(detail.id) ?? brandDescriptor(detail) });
    }
    if (!like) return rankDesignSystems(candidates, profile, limit);
    const target = styleVector(like.tokens);
    const { vectors, scale } = await this.styleVectors();
    const similarity = new Map<string, { distance: number; compared: number; differs: string[] }>();
    for (const [id, v] of vectors) {
      const d = vectorDistance(target, v.vector, scale);
      if (d.compared >= MIN_FEATURES) similarity.set(id, d);
    }
    return rankDesignSystems(candidates, profile, limit, { similarity, excludeId: like.id });
  }

  /** User design systems whose brand.json says they are the user's own brand. */
  async ownBrandDesignSystems(): Promise<DesignSystemDetail[]> {
    const designSystems = await this.loadedDesignSystems();
    return [...designSystems.values()].filter((d) => d.brand?.kind === 'own').sort((a, b) => a.id.localeCompare(b.id));
  }

  async getDesignSystem(id: string): Promise<DesignSystemDetail | undefined> {
    const designSystems = await this.loadedDesignSystems();
    return designSystems.get(id);
  }

  async craftSections(): Promise<CraftSection[]> {
    const { craft } = await this.ensureLoaded();
    return craft;
  }
}
