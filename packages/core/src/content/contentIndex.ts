import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';

export type SkillSource = 'skill' | 'design-template' | 'example';

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

// Accepts either the public `od:<mode>:<dirId>` form or a bare dirId (in
// case a caller echoes back something slightly different) and returns the
// dirId used as the internal map key.
export function parseSkillId(input: string): string {
  const match = /^od:[^:]+:(.+)$/.exec(input.trim());
  return match ? match[1] : input.trim();
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
}

export type DesignSystemSource = 'built-in' | 'user';

export interface DesignSystemSummary {
  id: string;
  name: string;
  summary: string;
  category?: string;
  /** 'built-in' = bundled with the extension (read-only); 'user' = written into the workspace via create_open_design_design_system. */
  source: DesignSystemSource;
}

export interface DesignSystemDetail extends DesignSystemSummary {
  body: string;
  craftSuggested: string[];
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
    });
  }
  return result;
}

// Examples (vendored from plugins/_official/examples/*) share the SKILL.md
// shape but carry their example prompt in a sibling open-design.json
// manifest (`od.useCase.query.en`), not in SKILL.md's own `od.example_prompt`
// — and, uniquely among the three skill-like pools, ship an actual rendered
// example.html, which is the remix source. Only entries with a vendored
// example.html are loaded here; the sync script already filters to those.
async function loadExamples(assetsRoot: string): Promise<Map<string, SkillDetail>> {
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
      source: 'example',
      examplePrompt,
      featured: false,
      exampleArtifactPath: path.posix.join('examples', entry.name, 'example.html'),
      body: content.trim(),
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
      });
    }
  }
  return result;
}

// User-created design systems (via create_open_design_design_system) live
// as a plain `DESIGN.md` under the workspace's OpenDesign output directory
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
    result.set(id, {
      id,
      name: fallback.name,
      summary: fallback.summary,
      category: undefined,
      craftSuggested: [],
      source: 'user',
      body: raw.trim(),
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
        skills: new Map([...skills, ...templates, ...examples]),
        designSystems,
        craft,
      }));
    }
    return this.loaded;
  }

  async listSkills(query?: string, mode?: string): Promise<SkillSummary[]> {
    const { skills } = await this.ensureLoaded();
    const wantedMode = mode?.trim().toLowerCase();
    const results: SkillSummary[] = [];
    for (const skill of skills.values()) {
      if (wantedMode && skill.mode !== wantedMode) continue;
      if (query && !matchesQuery([skill.id, skill.name, skill.description, ...skill.triggers], query)) continue;
      results.push({
        id: toPublicSkillId(skill.mode, skill.id),
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
    const { skills } = await this.ensureLoaded();
    return skills.get(parseSkillId(id));
  }

  async listSkillModes(): Promise<SkillMode[]> {
    const { skills } = await this.ensureLoaded();
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
      results.push({ id: ds.id, name: ds.name, summary: ds.summary, category: ds.category, source: ds.source });
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
