// The privacy ceiling (openspec add-tailored-portfolios): export and publish
// refuse an output holding a library project or asset stricter than the
// version's ceiling, naming each one. Library content is found by its ids
// (data-od-project, data-od-asset), which the portfolio recipes always write;
// a copied image without ids is not caught (the portfolio checks warn about
// untagged images instead).
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { load } from 'cheerio';
import { readArtifact } from '../vendored/artifactCreate';
import type { JsonRecord } from '../vendored/artifactManifest';
import { findCollectionArtifacts } from '../workspace/collectionScan';
import { assetPrivacy, privacyRank, readProject, type PrivacyLevel, type Project } from './library';
import { portfolioRecordOf } from './portfolioBrief';
import { readTarget, type Target } from './targets';

export interface PrivacyViolation {
  project: string;
  asset?: string;
  level: PrivacyLevel;
  /** The page it is on: its title or entry path. */
  page: string;
}

/** Library ids on a page: projects by data-od-project or data-od-case-study, assets by data-od-asset. */
export function libraryIdsOf(html: string): { projects: Set<string>; assets: Set<string> } {
  const $ = load(html);
  const projects = new Set<string>();
  const assets = new Set<string>();
  $('[data-od-project]').each((_, el) => {
    const v = ($(el).attr('data-od-project') ?? '').trim();
    if (v) projects.add(v);
  });
  $('[data-od-case-study]').each((_, el) => {
    const v = ($(el).attr('data-od-case-study') ?? '').trim();
    if (v) projects.add(v);
  });
  $('[data-od-asset]').each((_, el) => {
    const v = ($(el).attr('data-od-asset') ?? '').trim();
    if (v.includes('/')) assets.add(v);
  });
  return { projects, assets };
}

/** Items on the pages stricter than the ceiling. */
export async function ceilingViolations(
  workspaceRoot: string,
  outputDir: string,
  pages: Array<{ label: string; html: string }>,
  ceiling: PrivacyLevel,
): Promise<PrivacyViolation[]> {
  const cache = new Map<string, Project | undefined>();
  const project = async (slug: string) => {
    if (!cache.has(slug)) cache.set(slug, await readProject(workspaceRoot, outputDir, slug).catch(() => undefined));
    return cache.get(slug);
  };
  const out: PrivacyViolation[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    const ids = libraryIdsOf(page.html);
    for (const slug of ids.projects) {
      const p = await project(slug);
      if (p && privacyRank(p.privacy) > privacyRank(ceiling) && !seen.has(`${page.label}|${slug}`)) {
        seen.add(`${page.label}|${slug}`);
        out.push({ project: slug, level: p.privacy, page: page.label });
      }
    }
    for (const ref of ids.assets) {
      const [slug, id] = ref.split('/');
      const p = await project(slug);
      const asset = p?.assets.find((a) => a.id === id);
      if (!p || !asset) continue;
      const level = assetPrivacy(p, asset);
      if (privacyRank(level) > privacyRank(ceiling) && !seen.has(`${page.label}|${ref}`)) {
        seen.add(`${page.label}|${ref}`);
        out.push({ project: slug, asset: id, level, page: page.label });
      }
    }
  }
  return out;
}

export function formatViolations(v: PrivacyViolation[], ceiling: PrivacyLevel, action: 'export' | 'publish'): string {
  const items = v.map((x) => `- ${x.asset ? `the picture ${x.project}/${x.asset}` : `the project ${x.project}`} is ${x.level}, on ${x.page}`);
  return `Not ${action === 'export' ? 'exported' : 'published'}: this version's privacy ceiling is ${ceiling}, and it holds work stricter than that:\n${items.join('\n')}\nRemove those from the pages, or raise the target's ceiling with save_open_design_portfolio_target if the designer may share them this way.`;
}

/** The pages an export or publish of `entryPath` carries: the whole collection for a screen of one. */
async function pagesFor(workspaceRoot: string, outputDir: string, entryPath: string, manifest: JsonRecord, html: string): Promise<Array<{ label: string; html: string }>> {
  const label = (m: JsonRecord, p: string) => (typeof m.title === 'string' && m.title ? `${m.title} (${p})` : p);
  const collectionId = typeof manifest.collectionId === 'string' ? manifest.collectionId : undefined;
  if (!collectionId) return [{ label: label(manifest, entryPath), html }];
  const members = await findCollectionArtifacts(workspaceRoot, outputDir, collectionId).catch(() => []);
  const dir = path.posix.dirname(entryPath);
  const pages: Array<{ label: string; html: string }> = [];
  for (const m of members) {
    if (path.posix.dirname(m.entryPath) !== dir) continue;
    const content = await fs.readFile(path.join(workspaceRoot, m.entryPath), 'utf8').catch(() => undefined);
    if (content !== undefined) pages.push({ label: m.title ? `${m.title} (${m.entryPath})` : m.entryPath, html: content });
  }
  return pages.length ? pages : [{ label: label(manifest, entryPath), html }];
}

export type PortfolioGuard = { ok: true; notes: string[]; target?: Target; ceiling?: PrivacyLevel } | { ok: false; text: string };

/**
 * The privacy guard for an export (`file`: any file format) or a publish of a
 * portfolio design. Designs without portfolio inputs pass. A design made for a
 * target uses its ceiling; one without a target uses `unlisted`, so internal
 * work never leaves. An internal ceiling allows file exports only.
 */
export async function portfolioGuard(input: { workspaceRoot: string; outputDir: string; entryPath: string; action: 'export' | 'publish'; provider?: string }): Promise<PortfolioGuard> {
  const artifact = await readArtifact({ workspaceRoot: input.workspaceRoot, entryPath: input.entryPath }).catch(() => null);
  const manifest = artifact?.manifest;
  if (!artifact || !manifest) return { ok: true, notes: [] };
  const record = portfolioRecordOf(manifest.metadata);
  if (!record) return { ok: true, notes: [] };
  const target = record.target ? await readTarget(input.workspaceRoot, input.outputDir, record.target) : undefined;
  if (record.target && !target) return { ok: false, text: `This design was made for the target "${record.target}", which no longer exists. Save it again with save_open_design_portfolio_target, or rebuild the design without it.` };
  const ceiling: PrivacyLevel = target?.ceiling ?? 'unlisted';
  if (input.action === 'publish' && ceiling === 'internal') {
    return { ok: false, text: `Not published: "${target?.name ?? 'this version'}" is internal (a promotion packet or work under NDA), so it is only exported as a file. Export it as a PDF with export_open_design_artifact and give the designer the file.` };
  }
  const pages = await pagesFor(input.workspaceRoot, input.outputDir, input.entryPath, manifest, artifact.entryContent);
  const violations = await ceilingViolations(input.workspaceRoot, input.outputDir, pages, ceiling);
  if (violations.length) return { ok: false, text: formatViolations(violations, ceiling, input.action) };
  const notes: string[] = [];
  if (input.action === 'publish' && ceiling === 'unlisted') {
    if (input.provider && input.provider !== 'claude-artifact') {
      notes.push(`This version is unlisted: share the link only with the people it is for. ${input.provider} pages are public to anyone with the address, so ask the designer to add a password on the host if it offers one; the kit hasn't set one.`);
    } else if (!input.provider) {
      notes.push('This version is unlisted: publish it as a Claude artifact (private until shared), or on a host where the designer adds a password. The kit doesn\'t set passwords.');
    }
  }
  return { ok: true, notes, target, ceiling };
}
