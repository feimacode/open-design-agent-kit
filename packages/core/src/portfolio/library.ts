// The work library (openspec add-work-library): a designer's projects, the
// facts about each (role, team, dates, decisions, outcomes) and their images,
// entered once and read by every portfolio output. Plain JSON and image files
// under <designs folder>/portfolio/, so it works the same in every host and can
// sit in git. Only the portfolio tools write here; no design is registered
// inside it.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export const PORTFOLIO_DIR = 'portfolio';
export const LIBRARY_FILE = 'library.json';
export const PROJECTS_DIR = 'projects';
export const PROJECT_FILE = 'project.json';
export const ASSETS_DIR = 'assets';

export const PRIVACY_LEVELS = ['public', 'unlisted', 'internal'] as const;
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];
export const OUTCOME_SOURCES = ['measured', 'estimated', 'qualitative'] as const;
export type OutcomeSource = (typeof OUTCOME_SOURCES)[number];
export const ASSET_KINDS = ['screen', 'photo', 'video', 'design', 'other'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const ASSET_DEVICES = ['iphone', 'android', 'ipad', 'browser', 'macbook'] as const;
export type AssetDevice = (typeof ASSET_DEVICES)[number];
export const LINK_KINDS = ['live', 'prototype', 'write-up', 'other'] as const;

/** How strict a level is: public 0 < unlisted 1 < internal 2. */
export function privacyRank(level: PrivacyLevel): number {
  return PRIVACY_LEVELS.indexOf(level);
}

/** The stricter of two levels. */
export function stricterPrivacy(a: PrivacyLevel, b: PrivacyLevel): PrivacyLevel {
  return privacyRank(a) >= privacyRank(b) ? a : b;
}

export interface LibraryLink {
  label: string;
  url: string;
}

export interface LibraryOwner {
  name?: string;
  role?: string;
  location?: string;
  bio?: string;
  email?: string;
  links?: LibraryLink[];
}

export interface Library {
  version: 1;
  owner: LibraryOwner;
  /** Project slugs, in the designer's order. */
  projects: string[];
  /** A design system id: the portfolio's own style (openspec add-work-library, Library Style). */
  style?: string;
}

export interface ProjectDecision {
  choice: string;
  rejected?: string[];
  why?: string;
  tradeOff?: string;
}

export interface ProjectOutcome {
  text: string;
  /** The number or result as the designer gave it, e.g. "+18% sign-ups". */
  value?: string;
  source: OutcomeSource;
}

export interface ProjectLink {
  kind: (typeof LINK_KINDS)[number];
  url: string;
  label?: string;
}

/** A box to blur, in the image's own coordinates from 0 to 1. */
export interface Redaction {
  x: number;
  y: number;
  width: number;
  height: number;
  note?: string;
}

export interface AssetVariant {
  width: number;
  /** Project-relative path, e.g. "assets/home-1400.webp". */
  file: string;
}

export interface AssetOrigin {
  kind: 'file' | 'data' | 'url' | 'design' | 'figma';
  from: string;
  capturedAt: string;
}

export interface ProjectAsset {
  id: string;
  /** Project-relative path of the kept original. */
  file: string;
  mime: string;
  width?: number;
  height?: number;
  bytes: number;
  kind: AssetKind;
  device?: AssetDevice;
  alt?: string;
  /** True until the designer confirms the alt text. */
  altDraft?: boolean;
  caption?: string;
  /** Stricter than (or the same as) the project's level; absent means the project's. */
  privacy?: PrivacyLevel;
  redactions?: Redaction[];
  variants?: AssetVariant[];
  /** Project-relative PNG with the redactions baked in; outputs use it instead of the original. */
  redactedFile?: string;
  /** Project-relative PNG of a screen inside the kit's device frame (redactions baked in), for shots and covers. */
  framedFile?: string;
  /** True when the redactions changed but the copies couldn't be rebuilt (no browser): outputs must not use the asset. */
  copiesStale?: boolean;
  origin: AssetOrigin;
}

export interface Project {
  slug: string;
  title: string;
  role: string;
  privacy: PrivacyLevel;
  company?: string;
  client?: string;
  team?: string[];
  dates?: { start?: string; end?: string };
  platforms?: string[];
  problem?: string;
  constraints?: string[];
  decisions?: ProjectDecision[];
  outcomes?: ProjectOutcome[];
  links?: ProjectLink[];
  tags?: string[];
  /** Kit designs made for this project (entry paths), read by the process story. */
  designs?: string[];
  assets: ProjectAsset[];
}

export interface LibraryPaths {
  /** Workspace-relative folder of the library. */
  dir: string;
  libraryFile: string;
  projectDir(slug: string): string;
  projectFile(slug: string): string;
}

export function libraryPaths(outputDir: string): LibraryPaths {
  const dir = path.posix.join(outputDir.replace(/\\/g, '/'), PORTFOLIO_DIR);
  return {
    dir,
    libraryFile: path.posix.join(dir, LIBRARY_FILE),
    projectDir: (slug) => path.posix.join(dir, PROJECTS_DIR, slug),
    projectFile: (slug) => path.posix.join(dir, PROJECTS_DIR, slug, PROJECT_FILE),
  };
}

/** True when a workspace-relative path is inside the library folder. */
export function isInsideLibrary(outputDir: string, workspacePath: string): boolean {
  const dir = libraryPaths(outputDir).dir;
  const p = path.posix.normalize(workspacePath.replace(/\\/g, '/').replace(/^\.\//, ''));
  return p === dir || p.startsWith(dir + '/');
}

export function projectSlug(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'project';
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function emptyLibrary(): Library {
  return { version: 1, owner: {}, projects: [] };
}

async function readJson(file: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error(`${path.basename(file)} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
}

export async function readLibrary(workspaceRoot: string, outputDir: string): Promise<Library | undefined> {
  const raw = await readJson(path.join(workspaceRoot, libraryPaths(outputDir).libraryFile));
  if (raw === undefined) return undefined;
  const r = raw as Partial<Library>;
  return {
    version: 1,
    owner: r.owner && typeof r.owner === 'object' ? r.owner : {},
    projects: Array.isArray(r.projects) ? r.projects.filter((s): s is string => typeof s === 'string') : [],
    style: typeof r.style === 'string' && r.style.trim() ? r.style : undefined,
  };
}

export async function writeLibrary(workspaceRoot: string, outputDir: string, library: Library): Promise<void> {
  await writeJson(path.join(workspaceRoot, libraryPaths(outputDir).libraryFile), library);
}

export async function readProject(workspaceRoot: string, outputDir: string, slug: string): Promise<Project | undefined> {
  if (!SLUG.test(slug)) return undefined;
  const raw = await readJson(path.join(workspaceRoot, libraryPaths(outputDir).projectFile(slug)));
  if (raw === undefined) return undefined;
  const p = raw as Project;
  return { ...p, assets: Array.isArray(p.assets) ? p.assets : [] };
}

export async function writeProject(workspaceRoot: string, outputDir: string, project: Project): Promise<void> {
  await writeJson(path.join(workspaceRoot, libraryPaths(outputDir).projectFile(project.slug)), project);
}

/** Every project of the library, in library order (projects on disk but not listed come last). */
export async function readAllProjects(workspaceRoot: string, outputDir: string): Promise<Project[]> {
  const library = (await readLibrary(workspaceRoot, outputDir)) ?? emptyLibrary();
  const root = path.join(workspaceRoot, libraryPaths(outputDir).dir, PROJECTS_DIR);
  let onDisk: string[] = [];
  try {
    onDisk = (await fs.readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch {
    onDisk = [];
  }
  const order = [...library.projects.filter((s) => onDisk.includes(s)), ...onDisk.filter((s) => !library.projects.includes(s))];
  const projects: Project[] = [];
  for (const slug of order) {
    const p = await readProject(workspaceRoot, outputDir, slug);
    if (p) projects.push(p);
  }
  return projects;
}

/** The level an asset actually has: its own, or the project's when it has none. */
export function assetPrivacy(project: Project, asset: ProjectAsset): PrivacyLevel {
  return asset.privacy ? stricterPrivacy(project.privacy, asset.privacy) : project.privacy;
}

// ---------- validation ----------

type Ok<T> = { ok: true; value: T } | { ok: false; error: string };

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const strList = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.map(str).filter((s): s is string => !!s) : undefined);

function isUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function validLinks(v: unknown, where: string): Ok<LibraryLink[] | undefined> {
  if (v === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(v)) return { ok: false, error: `${where} must be a list of { label, url }.` };
  const out: LibraryLink[] = [];
  for (const item of v) {
    const label = str((item as LibraryLink)?.label);
    const url = str((item as LibraryLink)?.url);
    if (!label || !url || !isUrl(url)) return { ok: false, error: `${where}: every link needs a label and an http(s) or mailto: url.` };
    out.push({ label, url });
  }
  return { ok: true, value: out };
}

export function validateOwner(v: unknown): Ok<LibraryOwner> {
  if (v === null || typeof v !== 'object') return { ok: false, error: 'owner must be an object.' };
  const o = v as Record<string, unknown>;
  const links = validLinks(o.links, 'owner.links');
  if (!links.ok) return links;
  const email = str(o.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'owner.email is not an email address.' };
  return { ok: true, value: { name: str(o.name), role: str(o.role), location: str(o.location), bio: str(o.bio), email, links: links.value } };
}

function validPrivacy(v: unknown, where: string): Ok<PrivacyLevel | undefined> {
  if (v === undefined) return { ok: true, value: undefined };
  if (typeof v === 'string' && (PRIVACY_LEVELS as readonly string[]).includes(v)) return { ok: true, value: v as PrivacyLevel };
  return { ok: false, error: `${where} must be one of ${PRIVACY_LEVELS.join(', ')}.` };
}

export function validateRedactions(v: unknown, where: string): Ok<Redaction[] | undefined> {
  if (v === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(v)) return { ok: false, error: `${where} must be a list of { x, y, width, height } boxes from 0 to 1.` };
  const out: Redaction[] = [];
  for (const r of v) {
    const { x, y, width, height } = (r ?? {}) as Redaction;
    const nums = [x, y, width, height];
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1) || width <= 0 || height <= 0 || x + width > 1.0001 || y + height > 1.0001) {
      return { ok: false, error: `${where}: each box is { x, y, width, height } in the image's own coordinates from 0 to 1, inside the image.` };
    }
    out.push({ x, y, width, height, note: str((r as Redaction).note) });
  }
  return { ok: true, value: out };
}

/** The project fields `save_open_design_project` accepts (everything but assets, which import adds). */
export interface ProjectFields {
  slug?: string;
  title?: string;
  role?: string;
  privacy?: PrivacyLevel;
  company?: string;
  client?: string;
  team?: string[];
  dates?: { start?: string; end?: string };
  platforms?: string[];
  problem?: string;
  constraints?: string[];
  decisions?: ProjectDecision[];
  outcomes?: ProjectOutcome[];
  links?: ProjectLink[];
  tags?: string[];
  designs?: string[];
}

/** Checks and normalises the fields given; fields left out stay undefined (the caller merges). */
export function validateProjectFields(v: unknown): Ok<ProjectFields> {
  if (v === null || typeof v !== 'object') return { ok: false, error: 'project must be an object.' };
  const p = v as Record<string, unknown>;
  const privacy = validPrivacy(p.privacy, 'project.privacy');
  if (!privacy.ok) return privacy;
  const slug = str(p.slug);
  if (slug && !SLUG.test(slug)) return { ok: false, error: `project.slug "${slug}" must be lower-case letters, digits and hyphens, e.g. "checkout-redesign".` };
  let decisions: ProjectDecision[] | undefined;
  if (p.decisions !== undefined) {
    if (!Array.isArray(p.decisions)) return { ok: false, error: 'project.decisions must be a list of { choice, rejected?, why?, tradeOff? }.' };
    decisions = [];
    for (const d of p.decisions) {
      const choice = str((d as ProjectDecision)?.choice);
      if (!choice) return { ok: false, error: 'project.decisions: every decision needs a choice (what was decided).' };
      decisions.push({ choice, rejected: strList((d as ProjectDecision).rejected), why: str((d as ProjectDecision).why), tradeOff: str((d as ProjectDecision).tradeOff) });
    }
  }
  let outcomes: ProjectOutcome[] | undefined;
  if (p.outcomes !== undefined) {
    if (!Array.isArray(p.outcomes)) return { ok: false, error: 'project.outcomes must be a list of { text, value?, source }.' };
    outcomes = [];
    for (const o of p.outcomes) {
      const text = str((o as ProjectOutcome)?.text);
      const source = (o as ProjectOutcome)?.source;
      if (!text) return { ok: false, error: 'project.outcomes: every outcome needs text.' };
      if (!(OUTCOME_SOURCES as readonly string[]).includes(source)) {
        return { ok: false, error: `project.outcomes: "${text}" needs a source: measured (the designer has the number), estimated, or qualitative (no number). Ask the designer; never guess.` };
      }
      const value = str((o as ProjectOutcome).value);
      if (source === 'qualitative' && value) return { ok: false, error: `project.outcomes: "${text}" is qualitative, so it can't carry a value. Use estimated or measured if the designer gave a number.` };
      outcomes.push({ text, value, source });
    }
  }
  let links: ProjectLink[] | undefined;
  if (p.links !== undefined) {
    if (!Array.isArray(p.links)) return { ok: false, error: 'project.links must be a list of { kind, url, label? }.' };
    links = [];
    for (const l of p.links) {
      const url = str((l as ProjectLink)?.url);
      const kind = (l as ProjectLink)?.kind ?? 'other';
      if (!url || !isUrl(url)) return { ok: false, error: 'project.links: every link needs an http(s) url.' };
      if (!(LINK_KINDS as readonly string[]).includes(kind)) return { ok: false, error: `project.links: kind must be one of ${LINK_KINDS.join(', ')}.` };
      links.push({ kind, url, label: str((l as ProjectLink).label) });
    }
  }
  let dates: ProjectFields['dates'];
  if (p.dates !== undefined) {
    const d = p.dates as Record<string, unknown>;
    const start = str(d?.start);
    const end = str(d?.end);
    const ok = (s?: string) => !s || /^\d{4}(-\d{2})?(-\d{2})?$/.test(s) || s === 'now';
    if (!ok(start) || !ok(end)) return { ok: false, error: 'project.dates: start and end are YYYY, YYYY-MM or YYYY-MM-DD (end may be "now").' };
    dates = { start, end };
  }
  return {
    ok: true,
    value: {
      slug,
      title: str(p.title),
      role: str(p.role),
      privacy: privacy.value,
      company: str(p.company),
      client: str(p.client),
      team: strList(p.team),
      dates,
      platforms: strList(p.platforms),
      problem: str(p.problem),
      constraints: strList(p.constraints),
      decisions,
      outcomes,
      links,
      tags: strList(p.tags)?.map((t) => t.toLowerCase()),
      designs: strList(p.designs),
    },
  };
}

/** What a project still lacks for a good case study, in plain words. */
export function projectGaps(project: Project): string[] {
  const gaps: string[] = [];
  if (!project.company && !project.client) gaps.push('company or client (can be kept private later)');
  if (!project.dates?.start) gaps.push('dates');
  if (!project.team?.length) gaps.push('team (who the designer worked with)');
  if (!project.problem) gaps.push('problem');
  if (!project.decisions?.length) gaps.push('key decisions (the choice, the options rejected and why)');
  else if (!project.decisions.some((d) => d.rejected?.length)) gaps.push('the options rejected for at least one decision');
  if (!project.outcomes?.length) gaps.push('outcomes (with a source: measured, estimated or qualitative)');
  if (!project.assets.length) gaps.push('images (import_open_design_work)');
  const noAlt = project.assets.filter((a) => a.kind !== 'video' && !a.alt).length;
  if (noAlt) gaps.push(`alt text for ${noAlt} image${noAlt === 1 ? '' : 's'}`);
  const draftAlt = project.assets.filter((a) => a.alt && a.altDraft).length;
  if (draftAlt) gaps.push(`the designer's confirmation of ${draftAlt} drafted alt text${draftAlt === 1 ? '' : 's'}`);
  return gaps;
}

/** How an outcome is shown: measured as written, estimated with "about", qualitative without a number. */
export function outcomeLine(o: ProjectOutcome): string {
  if (o.source === 'qualitative' || !o.value) return o.text;
  return o.source === 'estimated' ? `${o.text}: about ${o.value.replace(/^(about|around|~)\s*/i, '')}` : `${o.text}: ${o.value}`;
}

export interface AssetForOutput {
  /** Project-relative file for a single image (the redacted copy when there are boxes). */
  file: string;
  /** Project-relative WebP widths, narrowest first. */
  variants: AssetVariant[];
  /** Project-relative PNG in its device frame, when the asset has one. */
  framedFile?: string;
}

/**
 * The files an output may show for an asset, or why it can't be shown: an
 * asset with redaction boxes is shown only through its redacted copies.
 */
export function assetForOutput(asset: ProjectAsset): { ok: true; value: AssetForOutput } | { ok: false; error: string } {
  const redacted = !!asset.redactions?.length;
  if (redacted && (asset.copiesStale || !asset.redactedFile)) {
    return { ok: false, error: `${asset.id} has redaction boxes but its redacted copies weren't made (no browser). Run save_open_design_project again where a browser is available, or leave the asset out.` };
  }
  const variants = [...(asset.variants ?? [])].sort((a, b) => a.width - b.width);
  return { ok: true, value: { file: redacted ? asset.redactedFile! : asset.file, variants, ...(asset.framedFile ? { framedFile: asset.framedFile } : {}) } };
}
