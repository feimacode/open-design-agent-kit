import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';

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
}

export interface SkillDetail extends SkillSummary {
  body: string;
  /** Upstream's free-form canvas-size hint, e.g. "1600×900 (16:9)" — see parseAspectHint. */
  aspectHint?: string;
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
  craftSuggested: string[];
  /** The design system's `tokens.css`, when it has one. */
  tokensCss?: string;
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
    });
  }
  return result;
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
  craft?: { suggested?: unknown };
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
    const raw = await fs.readFile(designMdPath, 'utf8');
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
    result.set(id, {
      id,
      name: fallback.name,
      summary: fallback.summary,
      category: undefined,
      craftSuggested: [],
      source: 'user',
      body: raw.trim(),
      hasTokens: tokensCss !== undefined,
      tokensCss,
    });
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

  private ensureLoaded(): Promise<LoadedContent> {
    if (!this.loaded) {
      this.loaded = Promise.all([
        loadSkillLikeDir(this.assetsRoot, 'skills', 'skill'),
        loadSkillLikeDir(this.assetsRoot, 'design-templates', 'design-template'),
        loadExamples(this.assetsRoot),
        loadDesignSystems(this.assetsRoot),
        loadCraft(this.assetsRoot),
      ]).then(([skills, templates, examples, designSystems, craft]) => ({
        skills: mergeSkillPools(skills, templates, examples),
        designSystems,
        craft,
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
      });
    }
    results.sort((a, b) => a.mode.localeCompare(b.mode) || a.name.localeCompare(b.name));
    return results;
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
    const results: DesignSystemSummary[] = [];
    const wantedCategory = category?.trim().toLowerCase();
    for (const ds of designSystems.values()) {
      if (wantedCategory && (ds.category ?? '').toLowerCase() !== wantedCategory) continue;
      if (query && !matchesQuery([ds.id, ds.name, ds.summary, ds.category ?? ''], query)) continue;
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

  async getDesignSystem(id: string): Promise<DesignSystemDetail | undefined> {
    const designSystems = await this.loadedDesignSystems();
    return designSystems.get(id);
  }

  async craftSections(): Promise<CraftSection[]> {
    const { craft } = await this.ensureLoaded();
    return craft;
  }
}
