// save_open_design_project and get_open_design_library (openspec
// add-work-library): the only way the library's facts change, so every
// project is checked against the schema, the asset-not-looser privacy rule and
// the outcome-source rule before it is written.
import { readAllTargets } from './targets';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { rebuildAssetCopies } from './importWork';
import {
  ASSET_DEVICES,
  ASSET_KINDS,
  assetPrivacy,
  emptyLibrary,
  libraryPaths,
  outcomeLine,
  PRIVACY_LEVELS,
  privacyRank,
  projectGaps,
  projectSlug,
  readAllProjects,
  readLibrary,
  readProject,
  validateOwner,
  validateProjectFields,
  validateRedactions,
  writeLibrary,
  writeProject,
  type AssetDevice,
  type AssetKind,
  type Library,
  type PrivacyLevel,
  type Project,
} from './library';

export interface SaveProjectInput {
  workspaceRoot: string;
  outputDir: string;
  owner?: unknown;
  /** A design system id, or "" to clear. Checked by the caller against the design systems it knows. */
  style?: string;
  order?: unknown;
  project?: unknown;
  assets?: unknown;
  browserPath?: string;
}

export interface SaveProjectResult {
  ok: boolean;
  text: string;
}

interface AssetEdit {
  id: string;
  alt?: string;
  confirmAlt?: boolean;
  caption?: string;
  privacy?: PrivacyLevel | null;
  redactions?: unknown;
  device?: AssetDevice | null;
  assetKind?: AssetKind;
  remove?: boolean;
}

function fail(text: string): SaveProjectResult {
  return { ok: false, text: `Nothing was saved: ${text}` };
}

export async function saveProject(input: SaveProjectInput): Promise<SaveProjectResult> {
  const library: Library = (await readLibrary(input.workspaceRoot, input.outputDir)) ?? emptyLibrary();
  const notes: string[] = [];
  let changedLibrary = false;

  if (input.owner !== undefined) {
    const owner = validateOwner(input.owner);
    if (!owner.ok) return fail(owner.error);
    library.owner = { ...library.owner, ...Object.fromEntries(Object.entries(owner.value).filter(([, v]) => v !== undefined)) };
    changedLibrary = true;
  }
  if (input.style !== undefined) {
    library.style = input.style.trim() || undefined;
    changedLibrary = true;
  }

  let project: Project | undefined;
  let isNew = false;
  if (input.project !== undefined) {
    const fields = validateProjectFields(input.project);
    if (!fields.ok) return fail(fields.error);
    const f = fields.value;
    const slug = f.slug ?? (f.title ? projectSlug(f.title) : undefined);
    if (!slug) return fail('project needs a slug (to change one) or a title (to add one).');
    const existing = await readProject(input.workspaceRoot, input.outputDir, slug);
    if (!existing) {
      if (!f.title || !f.role || !f.privacy) {
        return fail(`"${slug}" is a new project, so it needs a title, the designer's role and a privacy level (public, unlisted or internal). Ask the designer which level fits: internal for work under NDA or only for a promotion packet.`);
      }
      isNew = true;
    }
    project = existing ?? { slug, title: f.title!, role: f.role!, privacy: f.privacy!, assets: [] };
    for (const [key, value] of Object.entries(f)) {
      if (key === 'slug' || value === undefined) continue;
      (project as unknown as Record<string, unknown>)[key] = value;
    }
    // A project made stricter makes its assets' own looser levels meaningless: drop them.
    for (const a of project.assets) if (a.privacy && privacyRank(a.privacy) <= privacyRank(project.privacy)) delete a.privacy;
    if (!library.projects.includes(slug)) {
      library.projects.push(slug);
      changedLibrary = true;
    }
  }

  if (input.assets !== undefined) {
    if (!Array.isArray(input.assets)) return fail('assets must be a list of { id, alt?, confirmAlt?, caption?, privacy?, redactions?, device?, assetKind?, remove? }.');
    if (!project) {
      const slugs = new Set((input.assets as Array<{ project?: unknown }>).map((a) => a?.project).filter((s): s is string => typeof s === 'string'));
      if (slugs.size !== 1) return fail('assets belong to one project: pass project: { slug } with them.');
      project = await readProject(input.workspaceRoot, input.outputDir, [...slugs][0]);
      if (!project) return fail(`there is no project "${[...slugs][0]}".`);
    }
    const rebuild: string[] = [];
    for (const raw of input.assets as AssetEdit[]) {
      const asset = project.assets.find((a) => a.id === raw?.id);
      if (!asset) return fail(`"${project.slug}" has no asset "${raw?.id}". Its assets: ${project.assets.map((a) => a.id).join(', ') || 'none yet'}.`);
      if (raw.remove) {
        const dir = path.join(input.workspaceRoot, libraryPaths(input.outputDir).projectDir(project.slug));
        for (const f of [asset.file, asset.redactedFile, ...(asset.variants ?? []).map((v) => v.file)]) if (f) await fs.rm(path.join(dir, f), { force: true });
        project.assets = project.assets.filter((a) => a !== asset);
        notes.push(`Removed ${asset.id}.`);
        continue;
      }
      if (raw.alt !== undefined) {
        const alt = String(raw.alt).trim();
        asset.alt = alt || undefined;
        asset.altDraft = alt ? raw.confirmAlt !== true : undefined;
      } else if (raw.confirmAlt === true) {
        if (!asset.alt) return fail(`${asset.id} has no alt text to confirm.`);
        delete asset.altDraft;
      }
      if (raw.caption !== undefined) asset.caption = String(raw.caption).trim() || undefined;
      if (raw.privacy !== undefined) {
        if (raw.privacy === null) delete asset.privacy;
        else {
          if (!(PRIVACY_LEVELS as readonly unknown[]).includes(raw.privacy)) return fail(`privacy must be one of ${PRIVACY_LEVELS.join(', ')}.`);
          if (privacyRank(raw.privacy) < privacyRank(project.privacy)) return fail(`${asset.id} can't be "${raw.privacy}" in a "${project.privacy}" project; an asset can't be looser than its project.`);
          asset.privacy = raw.privacy === project.privacy ? undefined : raw.privacy;
        }
      }
      if (raw.device !== undefined) {
        if (raw.device === null) delete asset.device;
        else if (!(ASSET_DEVICES as readonly unknown[]).includes(raw.device)) return fail(`device must be one of ${ASSET_DEVICES.join(', ')}.`);
        else asset.device = raw.device;
      }
      if (raw.assetKind !== undefined) {
        if (!(ASSET_KINDS as readonly unknown[]).includes(raw.assetKind)) return fail(`assetKind must be one of ${ASSET_KINDS.join(', ')}.`);
        asset.kind = raw.assetKind;
      }
      if (raw.redactions !== undefined) {
        const boxes = validateRedactions(raw.redactions, `${asset.id}.redactions`);
        if (!boxes.ok) return fail(boxes.error);
        asset.redactions = boxes.value?.length ? boxes.value : undefined;
        rebuild.push(asset.id);
      }
    }
    for (const id of rebuild) {
      const asset = project.assets.find((a) => a.id === id)!;
      const rebuilt = await rebuildAssetCopies({ workspaceRoot: input.workspaceRoot, outputDir: input.outputDir, project, asset, browserPath: input.browserPath });
      if (!rebuilt.ok) {
        if (asset.redactions?.length) asset.copiesStale = true;
        notes.push(`${id}: ${rebuilt.error} Until then no output will show it.`);
      } else notes.push(`${id}: ${asset.redactions?.length ? `redacted copies made (${asset.redactions.length} box${asset.redactions.length === 1 ? '' : 'es'})` : 'redactions cleared, copies remade'}.`);
    }
  }

  if (input.order !== undefined) {
    if (!Array.isArray(input.order) || input.order.some((s) => typeof s !== 'string')) return fail('order must be a list of project slugs.');
    const all = (await readAllProjects(input.workspaceRoot, input.outputDir)).map((p) => p.slug);
    if (project && !all.includes(project.slug)) all.push(project.slug);
    const unknown = (input.order as string[]).filter((s) => !all.includes(s));
    if (unknown.length) return fail(`order names projects that don't exist: ${unknown.join(', ')}.`);
    library.projects = [...(input.order as string[]), ...all.filter((s) => !(input.order as string[]).includes(s))];
    changedLibrary = true;
  }

  if (!project && !changedLibrary) return fail('pass owner, style, order, project or assets.');
  if (project) await writeProject(input.workspaceRoot, input.outputDir, project);
  if (changedLibrary || isNew) await writeLibrary(input.workspaceRoot, input.outputDir, library);

  const lines: string[] = [];
  if (project) {
    lines.push(`${isNew ? 'Added' : 'Saved'} project "${project.slug}" (${project.title}, ${project.privacy}).`);
    const gaps = projectGaps(project);
    lines.push(gaps.length ? `Still missing: ${gaps.join('; ')}. Ask the designer for these; never fill them in yourself.` : 'Nothing is missing for a case study.');
  } else lines.push('Saved the library.');
  if (input.owner !== undefined) lines.push(`Owner: ${[library.owner.name, library.owner.role].filter(Boolean).join(', ') || '(no name yet)'}.`);
  if (input.style !== undefined) lines.push(library.style ? `Portfolio style: ${library.style}.` : 'Portfolio style cleared.');
  lines.push(...notes);
  return { ok: true, text: lines.join('\n') };
}

export interface LibrarySummary {
  exists: boolean;
  library: Library;
  projects: Array<{ slug: string; title: string; role: string; privacy: PrivacyLevel; assets: number; gaps: string[] }>;
}

export async function summarizeLibrary(workspaceRoot: string, outputDir: string): Promise<LibrarySummary> {
  const library = await readLibrary(workspaceRoot, outputDir);
  const projects = await readAllProjects(workspaceRoot, outputDir);
  return {
    exists: !!library || projects.length > 0,
    library: library ?? emptyLibrary(),
    projects: projects.map((p) => ({ slug: p.slug, title: p.title, role: p.role, privacy: p.privacy, assets: p.assets.length, gaps: projectGaps(p) })),
  };
}

export async function formatLibrary(workspaceRoot: string, outputDir: string, slug?: string): Promise<string> {
  if (slug) {
    const p = await readProject(workspaceRoot, outputDir, slug);
    if (!p) return `There is no project "${slug}" in the work library.`;
    const dir = libraryPaths(outputDir).projectDir(p.slug);
    const lines = [`# ${p.title} (${p.slug})`, `Role: ${p.role}. Privacy: ${p.privacy}. Folder: ${dir}/`];
    if (p.company || p.client) lines.push(`For: ${[p.company, p.client].filter(Boolean).join(' / ')}`);
    if (p.dates?.start) lines.push(`Dates: ${p.dates.start}${p.dates.end ? ` to ${p.dates.end}` : ''}`);
    if (p.team?.length) lines.push(`Team: ${p.team.join(', ')}`);
    if (p.problem) lines.push(`Problem: ${p.problem}`);
    if (p.constraints?.length) lines.push(`Constraints: ${p.constraints.join('; ')}`);
    for (const d of p.decisions ?? []) lines.push(`Decision: ${d.choice}${d.rejected?.length ? ` (rejected: ${d.rejected.join('; ')})` : ''}${d.why ? `. Why: ${d.why}` : ''}${d.tradeOff ? `. Trade-off: ${d.tradeOff}` : ''}`);
    for (const o of p.outcomes ?? []) lines.push(`Outcome (${o.source}): ${outcomeLine(o)}`);
    for (const l of p.links ?? []) lines.push(`Link (${l.kind}): ${l.url}`);
    if (p.tags?.length) lines.push(`Tags: ${p.tags.join(', ')}`);
    if (p.designs?.length) lines.push(`Kit designs: ${p.designs.join(', ')}`);
    lines.push('', 'Assets:');
    for (const a of p.assets) {
      const level = assetPrivacy(p, a);
      lines.push(`- ${a.id}: ${a.file}${a.width ? ` ${a.width}×${a.height}` : ''}, ${a.kind}${a.device ? ` (${a.device})` : ''}, ${level}${a.redactions?.length ? `, ${a.redactions.length} redaction box${a.redactions.length === 1 ? '' : 'es'}${a.copiesStale ? ' (copies not made yet)' : ''}` : ''}${a.alt ? `, alt${a.altDraft ? ' (draft)' : ''}: "${a.alt}"` : ', no alt text'}`);
    }
    if (!p.assets.length) lines.push('- none yet (import_open_design_work)');
    const gaps = projectGaps(p);
    if (gaps.length) lines.push('', `Missing: ${gaps.join('; ')}.`);
    return lines.join('\n');
  }
  const s = await summarizeLibrary(workspaceRoot, outputDir);
  if (!s.exists) {
    return `The work library is empty. Start it with save_open_design_project: the designer's name and role (owner), then one project at a time (title, role, privacy), then import_open_design_work for its images. It lives in ${libraryPaths(outputDir).dir}/.`;
  }
  const o = s.library.owner;
  const lines = [`Work library (${libraryPaths(outputDir).dir}/): ${[o.name, o.role, o.location].filter(Boolean).join(', ') || 'no owner details yet'}.`];
  lines.push(s.library.style ? `Style: ${s.library.style}.` : 'Style: none set (offer to build one from the designer\'s own site, Figma or Canva files, or screenshots).');
  lines.push('', 'Projects, in order:');
  for (const p of s.projects) lines.push(`- ${p.slug}: ${p.title}. ${p.role}. ${p.privacy}, ${p.assets} asset${p.assets === 1 ? '' : 's'}.${p.gaps.length ? ` Missing: ${p.gaps.join('; ')}.` : ' Complete.'}`);
  if (!s.projects.length) lines.push('- none yet');
  const targets = await readAllTargets(workspaceRoot, outputDir);
  if (targets.length) {
    lines.push('', 'Tailored versions (targets):');
    for (const t of targets) lines.push(`- ${t.slug}: ${t.name}. ${t.kind}, ceiling ${t.ceiling}, ${t.projects.length} project${t.projects.length === 1 ? '' : 's'}, outputs ${t.outputs.join(', ')}.`);
  }
  return lines.join('\n');
}
