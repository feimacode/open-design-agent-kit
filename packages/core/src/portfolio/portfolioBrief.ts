// Portfolio brief inputs (openspec add-portfolio-site-and-deck): which library
// projects a portfolio site or interview deck shows, the facts and pictures it
// may use, and the process story taken only from the kit's own records. The
// pictures an output may show are copied next to the design (media/<project>/),
// so the site bundle can carry them; internal ones never are.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { readArtifact } from '../vendored/artifactCreate';
import { editLogOf } from '../generation/steeringEdits';
import { readArtifactComments } from '../workspace/artifactComments';
import { readExplorationPlan, explorationPaths } from '../workspace/explorationStore';
import { readTarget } from './targets';
// The before/after page's file name (export/beforeAfter.ts), kept here so this module doesn't import the export code.
const BEFORE_AFTER_FILE = 'before-after.html';
import { criteriaMap, type Target } from './targets';
import { composeAnonymiseSection, composeReviewPostSection } from './anonymise';
import {
  assetForOutput,
  assetPrivacy,
  privacyRank,
  type PrivacyLevel,
  libraryPaths,
  outcomeLine,
  projectGaps,
  readLibrary,
  readProject,
  type Library,
  type Project,
  type ProjectAsset,
} from './library';

export const PORTFOLIO_KINDS = ['site', 'deck', 'pdf', 'share'] as const;
export type PortfolioKind = (typeof PORTFOLIO_KINDS)[number];
export const INTERVIEW_LENGTHS = [30, 45, 60] as const;
export const DEFAULT_INTERVIEW_LENGTH = 45;
export const MAX_SITE_PROJECTS = 6;
export const MAX_DECK_PROJECTS = 2;
export const MAX_PDF_PROJECTS = 12;
/** A share pack is made from one project (openspec add-portfolio-share-and-review). */
export const MAX_SHARE_PROJECTS = 1;
/** Words in a case study's body (outside navigation and footer). */
export const CASE_STUDY_WORDS = { min: 500, max: 1800 } as const;
/** Bytes a page and the files it loads by default may weigh. */
export const PAGE_WEIGHT_BUDGET = 3 * 1024 * 1024;
/** Folder beside the design that holds the copied pictures. */
export const PORTFOLIO_MEDIA_DIR = 'media';

/** What a design records as metadata.portfolio, so the portfolio checks know to run. */
export interface PortfolioRecord {
  kind: PortfolioKind;
  projects: string[];
  /** Interview decks: the talk's length in minutes. */
  length?: number;
  /** The tailored version this design is for (openspec add-tailored-portfolios). */
  target?: string;
}

export function portfolioKindForSkill(skillId: string | undefined): PortfolioKind {
  if (skillId && /portfolio-pdf/.test(skillId)) return 'pdf';
  if (skillId && /share-pack/.test(skillId)) return 'share';
  return skillId && /interview-deck|deck/.test(skillId) ? 'deck' : 'site';
}

type Ok<T> = { ok: true; value: T } | { ok: false; error: string };

/** Checks `portfolio: { projects, length? }` for a site or a deck. */
export function validatePortfolioInput(v: unknown, kind: PortfolioKind): Ok<PortfolioRecord> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'portfolio must be an object: { projects: ["<project slug>", …], length? }.' };
  const o = v as Record<string, unknown>;
  const target = typeof o.target === 'string' && o.target.trim() ? o.target.trim() : undefined;
  if (o.target !== undefined && !target) return { ok: false, error: 'portfolio.target is a target slug from save_open_design_portfolio_target.' };
  if (target && o.projects === undefined) {
    // The target's projects are filled in when the brief reads it.
    return { ok: true, value: { kind, projects: [], target, ...(kind === 'deck' ? { length: o.length === undefined ? DEFAULT_INTERVIEW_LENGTH : Number(o.length) } : {}) } };
  }
  if (!Array.isArray(o.projects) || o.projects.length === 0 || !o.projects.every((p) => typeof p === 'string' && p.trim())) {
    return { ok: false, error: 'portfolio.projects must list at least one library project slug (get_open_design_library lists them), or give a target.' };
  }
  const projects = [...new Set((o.projects as string[]).map((p) => p.trim()))];
  const max = maxProjects(kind);
  if (projects.length > max) {
    return {
      ok: false,
      error:
        kind === 'deck'
          ? `An interview deck covers one or two projects; got ${projects.length}. Pick the two that best show the role.`
          : kind === 'share'
            ? `A share pack is made from one project; got ${projects.length}. Make one pack per project.`
            : `A portfolio site shows at most ${MAX_SITE_PROJECTS} case studies; got ${projects.length}. Three to five is the usual range.`,
    };
  }
  let length: number | undefined;
  if (kind === 'deck') {
    length = o.length === undefined ? DEFAULT_INTERVIEW_LENGTH : Number(o.length);
    if (!(INTERVIEW_LENGTHS as readonly number[]).includes(length)) return { ok: false, error: `portfolio.length is the talk's length in minutes: 30, 45 or 60; got ${JSON.stringify(o.length)}.` };
  } else if (o.length !== undefined) {
    return { ok: false, error: `portfolio.length is for interview decks (30, 45 or 60 minutes); a ${kind === 'pdf' ? 'PDF' : kind === 'share' ? 'share pack' : 'site'} has no length.` };
  }
  return { ok: true, value: { kind, projects, ...(length !== undefined ? { length } : {}), ...(target ? { target } : {}) } };
}

function maxProjects(kind: PortfolioKind): number {
  return kind === 'deck' ? MAX_DECK_PROJECTS : kind === 'pdf' ? MAX_PDF_PROJECTS : kind === 'share' ? MAX_SHARE_PROJECTS : MAX_SITE_PROJECTS;
}

/** metadata.portfolio when it is a valid record. */
export function portfolioRecordOf(metadata: unknown): PortfolioRecord | undefined {
  const p = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>).portfolio : undefined;
  if (!p || typeof p !== 'object') return undefined;
  const r = p as Record<string, unknown>;
  const kind = (PORTFOLIO_KINDS as readonly unknown[]).includes(r.kind) ? (r.kind as PortfolioKind) : undefined;
  if (!kind || !Array.isArray(r.projects)) return undefined;
  const projects = r.projects.filter((x): x is string => typeof x === 'string');
  return { kind, projects, ...(typeof r.length === 'number' ? { length: r.length } : {}), ...(typeof r.target === 'string' ? { target: r.target } : {}) };
}

export function withPortfolioMetadata(metadata: Record<string, unknown> | undefined, record: PortfolioRecord | undefined): Record<string, unknown> | undefined {
  if (!record) return metadata;
  return { ...(metadata ?? {}), portfolio: record };
}

// ---------------------------------------------------------------- process story

export interface ProcessRecord {
  kind: 'exploration' | 'comparison' | 'steering' | 'revision' | 'before-after';
  /** One line for the brief, from the record itself. */
  text: string;
  /** Workspace-relative file the line comes from. */
  path: string;
}

/**
 * The records that exist for a project's linked designs: exploration
 * directions, the comparison page and the choice, checked steering edits,
 * resolved comments and a before/after page. Empty when there are none.
 */
export async function processRecords(workspaceRoot: string, outputDir: string, designs: string[] | undefined): Promise<ProcessRecord[]> {
  const out: ProcessRecord[] = [];
  for (const entryPath of designs ?? []) {
    const artifact = await readArtifact({ workspaceRoot, entryPath }).catch(() => undefined);
    const manifest = artifact?.manifest ?? null;
    if (!manifest) continue;
    const title = typeof manifest.title === 'string' ? manifest.title : entryPath;
    const explorationId = typeof manifest.explorationId === 'string' ? manifest.explorationId : undefined;
    if (explorationId) {
      const plan = await readExplorationPlan(workspaceRoot, outputDir, explorationId).catch(() => undefined);
      if (plan) {
        const paths = explorationPaths(outputDir, explorationId);
        out.push({ kind: 'exploration', text: `${title}: explored ${plan.directions.length} directions (${plan.directions.map((d) => d.label).join(', ')})`, path: paths.plan });
        const compare = await fs.stat(path.join(workspaceRoot, paths.compare)).then(() => true, () => false);
        if (compare || plan.chosen) {
          const chosen = plan.chosen ? plan.directions.find((d) => d.id === plan.chosen!.directionId) : undefined;
          out.push({
            kind: 'comparison',
            text: `${title}: compared them side by side${chosen ? ` and chose "${chosen.label}"${plan.chosen?.notes ? ` (${plan.chosen.notes})` : ''}` : ''}`,
            path: paths.compare,
          });
        }
      }
    }
    const edits = editLogOf(manifest).filter((e) => e.status === 'checked');
    if (edits.length > 0) {
      out.push({ kind: 'steering', text: `${title}: ${edits.length} checked edit(s): ${edits.map((e) => `${e.verb} ${e.scope}`).join('; ')}`, path: `${entryPath}.artifact.json` });
    }
    const comments = (await readArtifactComments(workspaceRoot, entryPath).catch(() => [])).filter((c) => c.status === 'resolved');
    if (comments.length > 0) out.push({ kind: 'revision', text: `${title}: ${comments.length} review comment(s) addressed`, path: `${entryPath}.comments.json` });
    const beforeAfter = path.posix.join(path.posix.dirname(entryPath), BEFORE_AFTER_FILE);
    if (await fs.stat(path.join(workspaceRoot, beforeAfter)).then(() => true, () => false)) {
      out.push({ kind: 'before-after', text: `${title}: a before/after page beside the site it replaced`, path: beforeAfter });
    }
  }
  return out;
}

// ---------------------------------------------------------------- brief

export interface PortfolioPicture {
  project: string;
  asset: string;
  /** Paths relative to the design's folder. */
  src: string;
  srcset?: string;
  /** The screen inside the kit's device frame, made at import for assets with a device. */
  framedSrc?: string;
  width?: number;
  height?: number;
  alt?: string;
  altConfirmed: boolean;
}

export interface PortfolioBrief {
  record: PortfolioRecord;
  library: Library;
  projects: Project[];
  pictures: PortfolioPicture[];
  /** The "Portfolio content" section of the brief's instructions. */
  section: string;
  notes: string[];
}

function shown(v: string | undefined): string {
  return v && v.trim() ? v.trim() : '';
}

function dateRange(p: Project): string {
  const start = shown(p.dates?.start);
  const end = shown(p.dates?.end);
  return start || end ? `${start || '?'} to ${end || 'now'}` : '';
}

function pictureMarkup(pic: PortfolioPicture, framed = false): string {
  const attrs = [
    `src="${framed ? pic.framedSrc : pic.src}"`,
    !framed && pic.srcset ? `srcset="${pic.srcset}"` : '',
    !framed && pic.srcset ? 'sizes="(max-width: 800px) 100vw, 1200px"' : '',
    !framed && pic.width && pic.height ? `width="${pic.width}" height="${pic.height}"` : '',
    `alt="${(pic.alt ?? '').replace(/"/g, '&quot;')}"`,
    `data-od-asset="${pic.project}/${pic.asset}"`,
    framed ? 'data-od-framed' : '',
    'loading="lazy"',
  ].filter(Boolean);
  return `<img ${attrs.join(' ')}>`;
}

async function copyPicture(workspaceRoot: string, outputDir: string, project: Project, asset: ProjectAsset, designDir: string): Promise<Ok<PortfolioPicture>> {
  const files = assetForOutput(asset);
  if (!files.ok) return files;
  const projectDir = libraryPaths(outputDir).projectDir(project.slug);
  const mediaDir = path.posix.join(PORTFOLIO_MEDIA_DIR, project.slug);
  const copy = async (rel: string): Promise<string> => {
    const name = path.posix.basename(rel);
    await fs.mkdir(path.join(workspaceRoot, designDir, mediaDir), { recursive: true });
    await fs.copyFile(path.join(workspaceRoot, projectDir, rel), path.join(workspaceRoot, designDir, mediaDir, name));
    return path.posix.join(mediaDir, name);
  };
  const variants = files.value.variants;
  const src = variants.length > 0 ? await copy((variants.find((v) => v.width >= 1400) ?? variants[variants.length - 1]).file) : await copy(files.value.file);
  const srcset = variants.length > 1 ? (await Promise.all(variants.map(async (v) => `${await copy(v.file)} ${v.width}w`))).join(', ') : undefined;
  const framedSrc = files.value.framedFile ? await copy(files.value.framedFile) : undefined;
  return {
    ok: true,
    value: {
      project: project.slug,
      asset: asset.id,
      src,
      ...(srcset ? { srcset } : {}),
      ...(framedSrc ? { framedSrc } : {}),
      ...(asset.width && asset.height ? { width: asset.width, height: asset.height } : {}),
      ...(asset.alt ? { alt: asset.alt } : {}),
      altConfirmed: !!asset.alt && !asset.altDraft,
    },
  };
}

function projectSection(p: Project, pictures: PortfolioPicture[], skipped: string[], records: ProcessRecord[], kind: PortfolioKind): string {
  const lines: string[] = [`### ${p.title} (\`${p.slug}\`)`, ''];
  const facts: Array<[string, string]> = [
    ['Role', p.role],
    ['Company', shown(p.company)],
    ['Client', shown(p.client)],
    ['Team', (p.team ?? []).join(', ')],
    ['Dates', dateRange(p)],
    ['Platforms', (p.platforms ?? []).join(', ')],
    ['Privacy', p.privacy === 'unlisted' ? 'unlisted (shown only to people with the link; keep it off public lists and search)' : p.privacy],
    ['Problem', shown(p.problem)],
  ];
  for (const [k, v] of facts) if (v) lines.push(`- **${k}:** ${v}`);
  if (p.constraints?.length) lines.push(`- **Constraints:** ${p.constraints.join('; ')}`);
  if (p.decisions?.length) {
    lines.push('- **Decisions** (give these the most room):');
    for (const d of p.decisions) {
      lines.push(`  - Chose ${d.choice}${d.rejected?.length ? `; rejected ${d.rejected.join(', ')}` : ''}${d.why ? `; why: ${d.why}` : ''}${d.tradeOff ? `; trade-off: ${d.tradeOff}` : ''}`);
    }
  }
  if (p.outcomes?.length) {
    lines.push('- **Outcomes** (write each exactly like this: a measured number as given, an estimate with "about", a qualitative one without a number):');
    for (const o of p.outcomes) lines.push(`  - ${outcomeLine(o)}`);
  }
  if (p.links?.length) {
    lines.push('- **Links:**');
    for (const l of p.links) lines.push(`  - ${l.kind}: ${l.url}${l.label ? ` (${l.label})` : ''}${l.kind === 'live' ? ' — mark the link `data-od-live`' : ''}`);
  }
  const gaps = projectGaps(p);
  if (gaps.length) lines.push(`- **Missing:** ${gaps.join('; ')}. Ask the designer for these, or leave the part out; never fill it in yourself.`);
  if (pictures.length) {
    lines.push('', 'Pictures (copied next to the design; use this markup as it is, with the variants as srcset):', '');
    for (const pic of pictures) {
      lines.push(`- \`${pic.asset}\`${pic.altConfirmed ? '' : ' — alt text is a draft: ask the designer to confirm it (save_open_design_project with confirmAlt) before publishing'}`);
      lines.push(`  \`${pictureMarkup(pic)}\``);
      if (pic.framedSrc) lines.push(`  In its device frame (use this in shots and covers): \`${pictureMarkup(pic, true)}\``);
    }
  } else {
    lines.push('', `No pictures can be shown for this project yet. ${kind === 'site' ? 'Ask the designer to import some (import_open_design_work), or' : 'Ask for screenshots, or'} build its pages from the facts alone.`);
  }
  if (skipped.length) lines.push('', `Left out: ${skipped.join('; ')}.`);
  if (records.length) {
    lines.push('', 'How I worked: the kit has these records for the project\'s designs. A "How I worked" block may list them, with the designer\'s own note, and nothing else:', '');
    for (const r of records) lines.push(`- ${r.text} (\`${r.path}\`)`);
  } else {
    lines.push('', 'How I worked: the kit has no records for this project (no linked designs, explorations, edits or before/after pages), so leave the "How I worked" block out. Don\'t describe a process from imagination.');
  }
  return lines.join('\n');
}

/**
 * Reads the library for a portfolio brief, copies the pictures the design may
 * use next to it, and composes the brief's "Portfolio content" section.
 */
export async function loadPortfolioBrief(input: { workspaceRoot: string; outputDir: string; entryPath: string; portfolio: unknown; kind: PortfolioKind }): Promise<Ok<PortfolioBrief>> {
  const checked = validatePortfolioInput(input.portfolio, input.kind);
  if (!checked.ok) return checked;
  let record = checked.value;
  const library = await readLibrary(input.workspaceRoot, input.outputDir);
  if (!library) return { ok: false, error: 'There is no work library yet. Save the designer\'s projects with save_open_design_project (and import their work with import_open_design_work) first.' };
  let target: Target | undefined;
  if (record.target) {
    target = await readTarget(input.workspaceRoot, input.outputDir, record.target);
    if (!target) return { ok: false, error: `No target "${record.target}". Save it with save_open_design_portfolio_target first.` };
    if (record.projects.length === 0) {
      if (target.projects.length === 0) return { ok: false, error: `The target "${target.name}" has no projects yet. Save its projects (in order) with save_open_design_portfolio_target.` };
      const max = maxProjects(input.kind);
      record = { ...record, projects: target.projects.slice(0, max) };
    }
  }
  // A share pack goes on public platforms: public work only, whatever the target says.
  const ceiling: PrivacyLevel = input.kind === 'share' ? 'public' : (target?.ceiling ?? 'unlisted');
  const projects: Project[] = [];
  for (const slug of record.projects) {
    const p = await readProject(input.workspaceRoot, input.outputDir, slug);
    if (!p) return { ok: false, error: `No project "${slug}" in the work library. Projects: ${library.projects.join(', ') || '(none)'}.` };
    if (privacyRank(p.privacy) > privacyRank(ceiling)) {
      if (input.kind === 'share') {
        return { ok: false, error: `"${p.title}" is ${p.privacy}, not public, so it can't go on Dribbble, Behance, LinkedIn or Instagram. Ask the designer whether to make it public (save_open_design_project with privacy "public"), or pick a public project.` };
      }
      return {
        ok: false,
        error: target
          ? `"${p.title}" is ${p.privacy}, stricter than the target's ceiling (${ceiling}), so it can't go in this version. Drop it from the target, or raise the ceiling.`
          : `"${p.title}" is internal, so it can't go in a portfolio. Pick another project, change its privacy with save_open_design_project, or make an internal target for it (a promotion packet, exported as a file).`,
      };
    }
    projects.push(p);
  }
  const designDir = path.posix.dirname(input.entryPath.replace(/\\/g, '/'));
  const pictures: PortfolioPicture[] = [];
  const notes: string[] = [];
  const sections: string[] = [];
  for (const p of projects) {
    const mine: PortfolioPicture[] = [];
    const skipped: string[] = [];
    for (const asset of p.assets) {
      const level = assetPrivacy(p, asset);
      if (privacyRank(level) > privacyRank(ceiling)) {
        skipped.push(`${asset.id} (${level})`);
        continue;
      }
      if (asset.kind === 'video' || asset.mime === 'video/mp4') {
        skipped.push(`${asset.id} (video: add it by hand if the design needs it)`);
        continue;
      }
      const pic = await copyPicture(input.workspaceRoot, input.outputDir, p, asset, designDir);
      if (!pic.ok) {
        skipped.push(`${asset.id} (${pic.error})`);
        continue;
      }
      mine.push(pic.value);
    }
    pictures.push(...mine);
    const records = await processRecords(input.workspaceRoot, input.outputDir, p.designs);
    sections.push(projectSection(p, mine, skipped, records, input.kind));
    if (mine.some((m) => !m.altConfirmed)) notes.push(`${p.title}: some alt text is still a draft.`);
  }
  const o = library.owner;
  const ownerLines = [
    o.name ? `- **Name:** ${o.name}` : '- **Name:** missing: ask the designer',
    o.role ? `- **Role:** ${o.role}` : '- **Role:** missing: ask the designer',
    o.location ? `- **Location:** ${o.location}` : '',
    o.email ? `- **Contact:** mailto:${o.email}` : '- **Contact:** missing: ask the designer for an email or contact link',
    o.bio ? `- **Bio:** ${o.bio}` : '',
    ...(o.links ?? []).map((l) => `- **${l.label}:** ${l.url}`),
  ].filter(Boolean);
  const targetSection = target ? composeTargetSection(target, projects, input.kind, library) : '';
  const section = [
    '## Portfolio content',
    '',
    'Everything about the designer and their work comes from their work library, below. Use only these facts: no invented numbers, clients, team sizes, dates or quotes. When something the outline asks for is missing, ask, or leave that part out. Show only the pictures listed here, with their markup (the `data-od-asset` attribute lets the check find internal or unconfirmed pictures).',
    '',
    '### The designer',
    '',
    ...ownerLines,
    '',
    ...(targetSection ? [targetSection, ''] : []),
    ...sections,
  ].join('\n');
  return { ok: true, value: { record, library, projects, pictures, section, notes } };
}

const PAGE_SIZE_CSS: Record<string, string> = { a4: '297mm × 210mm landscape or 210mm × 297mm portrait (A4)', letter: '11in × 8.5in landscape or 8.5in × 11in portrait (US Letter)', '16:9': '1920 × 1080 px (16:9)' };

/** The "This version" part of the brief: who it is for, its cover note, limits and kind-specific sections. */
export function composeTargetSection(t: Target, projects: Project[], kind: PortfolioKind, library?: Library): string {
  const lines = [`### This version: ${t.name} (${t.kind})`, ''];
  lines.push(`Built for one situation, from the target \`${t.slug}\`: these projects in this order (${projects.map((p) => p.slug).join(', ')}), nothing stricter than **${t.ceiling}**. Put \`data-od-project="<slug>"\` on each project's block and keep \`data-od-asset\` on every picture: export and publish check them against the ceiling.`);
  if (t.coverNote) lines.push('', `Cover note, in the designer's words (open with it, unchanged): "${t.coverNote}"`);
  if (t.notes && t.kind !== 'promotion' && t.kind !== 'review') lines.push('', `What they asked for (from the designer's notes; echo its words where the library supports them, never claim more):\n\n> ${t.notes.slice(0, 1500).replace(/\n+/g, '\n> ')}`);
  if (t.kind === 'review' && library) {
    if (t.notes) lines.push('', `The community's posting rules (from the designer's notes; follow them in the post):\n\n> ${t.notes.slice(0, 1500).replace(/\n+/g, '\n> ')}`);
    lines.push('', composeAnonymiseSection(library, projects, t), '', composeReviewPostSection(t));
  } else if (t.ceiling === 'unlisted' && kind === 'site') {
    lines.push('', 'Unlisted: build it as its own collection (its own collectionId, e.g. the target slug), put `<meta name="robots" content="noindex">` in every page\'s <head>, and don\'t link to it from the public portfolio.');
  }
  if (t.limits.pdfBytes !== undefined || t.limits.pdfPageSize) {
    lines.push('', `PDF: ${t.limits.pdfPageSize ? `pages at ${PAGE_SIZE_CSS[t.limits.pdfPageSize]}, one \`.slide\` per page` : 'one `.slide` per page'}${t.limits.pdfBytes !== undefined ? `; export with maxBytes ${t.limits.pdfBytes} (the export lowers image quality until it fits, and fails naming the heaviest pages if it can't)` : ''}.`);
  }
  if (t.kind === 'school') {
    lines.push('', `School image set: one piece per \`.slide\`, each with \`data-od-piece="<title, year, medium>"\`${t.limits.pieces ? `; exactly ${t.limits.pieces} pieces` : ''}${t.limits.imageBytes !== undefined ? `; export each as JPEG with maxBytes ${t.limits.imageBytes}` : ''}. Titles follow the school's naming rules from the notes.`);
  }
  if (t.kind === 'client' && t.client && (t.client.concept || t.client.beforeAfter)) {
    lines.push('', `"For you" section, after the work and before the contact: a short section for this client${t.client.site ? ` (${t.client.site})` : ''}, marked \`data-od-for-you\`, linking ${[t.client.concept ? `the redesign concept (\`${t.client.concept}\`)` : '', t.client.beforeAfter ? `the before/after page (\`${t.client.beforeAfter}\`)` : ''].filter(Boolean).join(' and ')}. Say it is a concept, not their site.`);
  }
  if (t.kind === 'promotion' && t.criteria?.length) {
    lines.push('', 'Criteria map: a table with every criterion below, in this order, each row marked `data-od-criterion`, with the projects and outcomes that show it. A criterion with no evidence stays in the table, with its cell left empty ("No evidence yet"), so the gap is visible before the committee sees it.', '');
    for (const c of criteriaMap(t.criteria, projects)) {
      lines.push(`- ${c.criterion}: ${c.evidence.length ? c.evidence.map((e) => `${e.title}${e.outcomes.length ? ` (${e.outcomes.join('; ')})` : ''}`).join('; ') : 'no evidence yet'}`);
    }
  }
  return lines.join('\n');
}
