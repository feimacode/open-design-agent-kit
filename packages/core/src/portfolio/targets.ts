// Tailored portfolio versions (openspec add-tailored-portfolios): a target is
// one situation (a job, a client, a school, a promotion) with its projects in
// order, a privacy ceiling, the outputs it wants, a cover note and its limits.
// Targets only pick, order, limit and restrict; the outputs stay the portfolio
// recipes with the target passed in.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { libraryPaths, outcomeLine, PRIVACY_LEVELS, privacyRank, projectSlug, readAllProjects, readLibrary, type PrivacyLevel, type Project } from './library';

export const TARGETS_DIR = 'targets';
export const TARGET_KINDS = ['job', 'client', 'school', 'promotion', 'general', 'review'] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];
export const TARGET_OUTPUTS = ['site', 'pdf', 'deck', 'images'] as const;
export type TargetOutput = (typeof TARGET_OUTPUTS)[number];
export const PDF_PAGE_SIZES = ['a4', 'letter', '16:9'] as const;
export type PdfPageSize = (typeof PDF_PAGE_SIZES)[number];
export const MAX_TARGET_PROJECTS = 12;
export const MAX_CRITERIA = 20;
/** A review post asks at most this many questions (openspec add-portfolio-share-and-review). */
export const MAX_REVIEW_QUESTIONS = 3;
const MB = 1024 * 1024;

export interface TargetLimits {
  /** Largest PDF, in bytes. */
  pdfBytes?: number;
  /** Largest single image of a school image set, in bytes. */
  imageBytes?: number;
  /** How many pieces a school takes. */
  pieces?: number;
  pdfPageSize?: PdfPageSize;
}

export interface Target {
  version: 1;
  slug: string;
  kind: TargetKind;
  name: string;
  /** The pasted ad, brief, school rules or promotion criteria, as given. */
  notes?: string;
  /** Library project slugs, in this version's order. */
  projects: string[];
  ceiling: PrivacyLevel;
  outputs: TargetOutput[];
  coverNote?: string;
  limits: TargetLimits;
  /** Promotion: the criteria to map evidence to, one per line of the pasted framework. */
  criteria?: string[];
  /** Client: their site and the kit's redesign concept and before/after page for it. */
  client?: { site?: string; concept?: string; beforeAfter?: string };
  /** Review: the community it is posted to, up to three questions, and the feedback not wanted. */
  review?: { community?: string; questions?: string[]; notWanted?: string; labels?: Record<string, string> };
  updatedAt: string;
}

/** Defaults per kind: job and client PDFs 10 MB; school images 5 MB and PDF 10 MB (SlideRoom's documented limits); promotion none. */
export function defaultLimits(kind: TargetKind): TargetLimits {
  if (kind === 'job' || kind === 'client') return { pdfBytes: 10 * MB, pdfPageSize: '16:9' };
  if (kind === 'school') return { pdfBytes: 10 * MB, imageBytes: 5 * MB, pdfPageSize: 'a4' };
  if (kind === 'general') return { pdfBytes: 10 * MB, pdfPageSize: '16:9' };
  return {};
}

export function defaultCeiling(kind: TargetKind): PrivacyLevel {
  if (kind === 'promotion') return 'internal';
  // A review version is anonymised and shared by link with strangers: unlisted, never on the public portfolio.
  return kind === 'review' ? 'unlisted' : 'public';
}

export function defaultOutputs(kind: TargetKind): TargetOutput[] {
  if (kind === 'school') return ['images', 'pdf'];
  if (kind === 'promotion') return ['pdf'];
  if (kind === 'client') return ['site', 'pdf'];
  if (kind === 'review') return ['site'];
  return ['site', 'pdf'];
}

export function targetsDir(outputDir: string): string {
  return path.posix.join(libraryPaths(outputDir).dir, TARGETS_DIR);
}

export function targetFile(outputDir: string, slug: string): string {
  return path.posix.join(targetsDir(outputDir), `${slug}.json`);
}

export async function readTarget(workspaceRoot: string, outputDir: string, slug: string): Promise<Target | undefined> {
  try {
    const t = JSON.parse(await fs.readFile(path.join(workspaceRoot, targetFile(outputDir, slug)), 'utf8')) as Target;
    return t && t.version === 1 && typeof t.slug === 'string' ? t : undefined;
  } catch {
    return undefined;
  }
}

export async function readAllTargets(workspaceRoot: string, outputDir: string): Promise<Target[]> {
  const dir = path.join(workspaceRoot, targetsDir(outputDir));
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const out: Target[] = [];
  for (const n of names.filter((n) => n.endsWith('.json')).sort()) {
    const t = await readTarget(workspaceRoot, outputDir, n.slice(0, -5));
    if (t) out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------- matching

const STOP = new Set(
  'the and for with you your our are was were will that this from have has had not but can all any into about over more most such than then them they their there what when where which who why how its it is be of to in on at by or as an a we us me my i do does did done also very just only both each few other some own same so too per via within across including experience years year role team teams work working ability strong skills skill looking join company'.split(
    ' ',
  ),
);

function stem(w: string): string {
  return w.length > 4 ? w.replace(/(?:ies)$/, 'y').replace(/(?:ing|ed|es|s)$/, '') : w;
}

/** Meaningful words and two-word phrases of a text, lower-cased and lightly stemmed. */
export function terms(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));
  const out = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    if (words[i].length >= 3 || /\d/.test(words[i]) || words[i] === 'ux' || words[i] === 'ui') out.add(stem(words[i]));
    if (i + 1 < words.length) out.add(`${stem(words[i])} ${stem(words[i + 1])}`);
  }
  return out;
}

function projectText(p: Project): string {
  return [
    p.title,
    p.role,
    p.problem ?? '',
    ...(p.tags ?? []),
    ...(p.platforms ?? []),
    ...(p.constraints ?? []),
    ...(p.decisions ?? []).flatMap((d) => [d.choice, d.why ?? '', d.tradeOff ?? '', ...(d.rejected ?? [])]),
    ...(p.outcomes ?? []).map((o) => `${o.text} ${o.value ?? ''}`),
  ].join(' \n ');
}

/** The words of `notes` a project matches, phrases first. */
export function matchedWords(notes: string, p: Project): string[] {
  const want = terms(notes);
  const have = terms(projectText(p));
  const hits = [...want].filter((t) => have.has(t));
  // A phrase hit covers its words.
  const phrases = hits.filter((h) => h.includes(' '));
  return [...phrases, ...hits.filter((h) => !h.includes(' ') && !phrases.some((ph) => ph.split(' ').includes(h)))];
}

export interface SuggestedProject {
  slug: string;
  title: string;
  matched: string[];
}

/** Projects ordered by how many of the notes' words and phrases they match (phrases count double), library order breaking ties. */
export function suggestOrder(notes: string | undefined, projects: Project[]): SuggestedProject[] {
  const scored = projects.map((p, i) => {
    const matched = notes ? matchedWords(notes, p) : [];
    const score = matched.reduce((n, m) => n + (m.includes(' ') ? 2 : 1), 0);
    return { p, i, matched, score };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((s) => ({ slug: s.p.slug, title: s.p.title, matched: s.matched }));
}

export interface CriterionEvidence {
  criterion: string;
  evidence: Array<{ project: string; title: string; outcomes: string[]; matched: string[] }>;
}

/** Each criterion with the projects (and their outcomes) that show it; a criterion with none stays, empty. */
export function criteriaMap(criteria: string[], projects: Project[]): CriterionEvidence[] {
  return criteria.map((criterion) => {
    const evidence = projects
      .map((p) => {
        const matched = matchedWords(criterion, p);
        const strong = matched.some((m) => m.includes(' ')) || matched.length >= 2;
        return strong ? { project: p.slug, title: p.title, outcomes: (p.outcomes ?? []).map(outcomeLine), matched } : undefined;
      })
      .filter((e): e is NonNullable<typeof e> => !!e);
    return { criterion, evidence };
  });
}

/** Criteria from a pasted framework: one per line or bullet, trimmed, at most MAX_CRITERIA. */
export function parseCriteria(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? v.split(/\n+/) : [];
  const out = list.map((c) => c.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter((c) => c.length >= 3);
  return out.slice(0, MAX_CRITERIA);
}

// ---------------------------------------------------------------- save

type Ok<T> = { ok: true; value: T } | { ok: false; error: string };

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function validateLimits(v: unknown, base: TargetLimits): Ok<TargetLimits> {
  if (v === undefined) return { ok: true, value: base };
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'limits must be an object: { pdfMB, imageMB, pieces, pdfPageSize }.' };
  const o = v as Record<string, unknown>;
  const out: TargetLimits = { ...base };
  const mb = (key: string, field: 'pdfBytes' | 'imageBytes'): string | undefined => {
    if (o[key] === undefined) return undefined;
    if (o[key] === null) {
      delete out[field];
      return undefined;
    }
    const n = Number(o[key]);
    if (!(n > 0 && n <= 500)) return `limits.${key} is a size in MB between 0 and 500; got ${JSON.stringify(o[key])}.`;
    out[field] = Math.round(n * MB);
    return undefined;
  };
  const e = mb('pdfMB', 'pdfBytes') ?? mb('imageMB', 'imageBytes');
  if (e) return { ok: false, error: e };
  if (o.pieces !== undefined) {
    const n = Number(o.pieces);
    if (!(Number.isInteger(n) && n >= 1 && n <= 100)) return { ok: false, error: 'limits.pieces is a whole number from 1 to 100.' };
    out.pieces = n;
  }
  if (o.pdfPageSize !== undefined) {
    if (!(PDF_PAGE_SIZES as readonly unknown[]).includes(o.pdfPageSize)) return { ok: false, error: `limits.pdfPageSize is one of ${PDF_PAGE_SIZES.join(', ')}.` };
    out.pdfPageSize = o.pdfPageSize as PdfPageSize;
  }
  return { ok: true, value: out };
}

export interface SaveTargetInput {
  workspaceRoot: string;
  outputDir: string;
  target: unknown;
  now?: Date;
}

/** Validates and saves a target, filling its kind's defaults; returns the text for the agent. */
export async function saveTarget(input: SaveTargetInput): Promise<{ ok: boolean; text: string; target?: Target }> {
  const v = input.target;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, text: 'target must be an object: { name, kind, notes?, projects?, ceiling?, outputs?, coverNote?, limits?, criteria?, client?, review? }.' };
  const o = v as Record<string, unknown>;
  const library = await readLibrary(input.workspaceRoot, input.outputDir);
  if (!library) return { ok: false, text: 'There is no work library yet. Save the designer\'s projects with save_open_design_project first.' };
  const slugIn = str(o.slug);
  const existing = slugIn ? await readTarget(input.workspaceRoot, input.outputDir, slugIn) : undefined;
  if (slugIn && !existing && !str(o.name)) return { ok: false, text: `No target "${slugIn}". Give a name and a kind to start one.` };
  const name = str(o.name) ?? existing?.name;
  if (!name) return { ok: false, text: 'A new target needs a name, e.g. "Acme senior product designer" or "RCA MA application".' };
  const kindIn = o.kind ?? existing?.kind;
  if (!(TARGET_KINDS as readonly unknown[]).includes(kindIn)) return { ok: false, text: `kind is one of ${TARGET_KINDS.join(', ')}.` };
  const kind = kindIn as TargetKind;
  const slug = existing?.slug ?? (slugIn ? projectSlug(slugIn) : projectSlug(name));
  const all = await readAllProjects(input.workspaceRoot, input.outputDir);
  const bySlug = new Map(all.map((p) => [p.slug, p]));

  const ceilingIn = o.ceiling ?? existing?.ceiling ?? defaultCeiling(kind);
  if (!(PRIVACY_LEVELS as readonly unknown[]).includes(ceilingIn)) return { ok: false, text: `ceiling is one of ${PRIVACY_LEVELS.join(', ')}.` };
  const ceiling = ceilingIn as PrivacyLevel;

  let outputs = existing?.outputs ?? defaultOutputs(kind);
  if (o.outputs !== undefined) {
    if (!Array.isArray(o.outputs) || o.outputs.length === 0 || !o.outputs.every((x) => (TARGET_OUTPUTS as readonly unknown[]).includes(x))) return { ok: false, text: `outputs lists one or more of ${TARGET_OUTPUTS.join(', ')}.` };
    outputs = [...new Set(o.outputs as TargetOutput[])];
  }
  if (ceiling === 'internal' && outputs.includes('site')) return { ok: false, text: 'An internal target is exported as files only (a PDF, a deck or images), never published as a site. Leave "site" out of outputs, or raise the ceiling if the designer may share it.' };

  const limits = validateLimits(o.limits, existing && existing.kind === kind ? existing.limits : defaultLimits(kind));
  if (!limits.ok) return { ok: false, text: limits.error };

  const notes = o.notes === undefined ? existing?.notes : str(o.notes);
  if (notes && notes.length > 20000) return { ok: false, text: 'notes is at most 20,000 characters; paste the ad or rules, not the whole site.' };
  const criteria = o.criteria !== undefined ? parseCriteria(o.criteria) : existing?.criteria ?? (kind === 'promotion' && notes ? parseCriteria(notes) : undefined);

  let projects = existing?.projects ?? [];
  if (o.projects !== undefined) {
    if (!Array.isArray(o.projects) || !o.projects.every((x) => typeof x === 'string')) return { ok: false, text: 'projects lists library project slugs.' };
    projects = [...new Set((o.projects as string[]).map((s) => s.trim()))];
    const unknown = projects.filter((s) => !bySlug.has(s));
    if (unknown.length) return { ok: false, text: `Not in the library: ${unknown.join(', ')}. Projects: ${library.projects.join(', ')}.` };
    if (projects.length > MAX_TARGET_PROJECTS) return { ok: false, text: `A target holds at most ${MAX_TARGET_PROJECTS} projects.` };
  }

  let client = existing?.client;
  if (o.client !== undefined) {
    if (!o.client || typeof o.client !== 'object' || Array.isArray(o.client)) return { ok: false, text: 'client is { site?, concept?, beforeAfter? }: their site and the redesign concept and before/after page made for it.' };
    const c = o.client as Record<string, unknown>;
    client = { ...(str(c.site) ? { site: str(c.site) } : {}), ...(str(c.concept) ? { concept: str(c.concept) } : {}), ...(str(c.beforeAfter) ? { beforeAfter: str(c.beforeAfter) } : {}) };
    for (const p of [client.concept, client.beforeAfter]) {
      if (p && !(await fs.stat(path.join(input.workspaceRoot, p)).then((s) => s.isFile(), () => false))) return { ok: false, text: `client: ${p} isn't a file in the workspace. Pass the entry path of the redesign concept or the before/after page.` };
    }
    if (kind !== 'client') return { ok: false, text: 'client applies to client targets.' };
  }

  let review = existing?.review;
  if (o.review !== undefined) {
    if (kind !== 'review') return { ok: false, text: 'review applies to review targets.' };
    if (!o.review || typeof o.review !== 'object' || Array.isArray(o.review)) return { ok: false, text: 'review is { community?, questions?, notWanted?, labels? }: where it is posted, up to three questions, the feedback the designer doesn\'t want, and neutral labels per project slug ("Grocery company, 2025").' };
    const r = o.review as Record<string, unknown>;
    let questions: string[] | undefined;
    if (r.questions !== undefined) {
      if (!Array.isArray(r.questions) || !r.questions.every((q) => typeof q === 'string')) return { ok: false, text: 'review.questions lists the questions as strings.' };
      questions = (r.questions as string[]).map((q) => q.trim()).filter(Boolean);
      if (questions.length > MAX_REVIEW_QUESTIONS) {
        return { ok: false, text: `A review post asks at most ${MAX_REVIEW_QUESTIONS} questions (reviewers answer fewer, sharper questions); got ${questions.length}. Ask the designer which three to keep:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` };
      }
    }
    let labels: Record<string, string> | undefined;
    if (r.labels !== undefined) {
      if (!r.labels || typeof r.labels !== 'object' || Array.isArray(r.labels) || !Object.values(r.labels).every((x) => typeof x === 'string')) return { ok: false, text: 'review.labels maps project slugs to neutral labels, e.g. { "checkout-redesign": "Grocery company, 2025" }.' };
      labels = Object.fromEntries(Object.entries(r.labels as Record<string, string>).map(([k, x]) => [k.trim(), x.trim()]).filter(([k, x]) => k && x));
      const unknown = Object.keys(labels ?? {}).filter((k) => !bySlug.has(k));
      if (unknown.length) return { ok: false, text: `review.labels: not in the library: ${unknown.join(', ')}.` };
    }
    const prev = existing?.review;
    review = {
      ...(str(r.community) ?? prev?.community ? { community: str(r.community) ?? prev?.community } : {}),
      ...((questions ?? prev?.questions)?.length ? { questions: questions ?? prev?.questions } : {}),
      ...(str(r.notWanted) ?? prev?.notWanted ? { notWanted: str(r.notWanted) ?? prev?.notWanted } : {}),
      ...(labels ?? prev?.labels ? { labels: labels ?? prev?.labels } : {}),
    };
  }
  if (kind === 'review' && ceiling !== 'unlisted' && ceiling !== 'public') return { ok: false, text: 'A review version is shared with strangers by link, so its ceiling is unlisted (or public); internal work can\'t go in it.' };

  const target: Target = {
    version: 1,
    slug,
    kind,
    name,
    ...(notes ? { notes } : {}),
    projects,
    ceiling,
    outputs,
    ...(o.coverNote !== undefined ? (str(o.coverNote) ? { coverNote: str(o.coverNote) } : {}) : existing?.coverNote ? { coverNote: existing.coverNote } : {}),
    limits: limits.value,
    ...(criteria?.length ? { criteria } : {}),
    ...(client && Object.keys(client).length ? { client } : {}),
    ...(review && Object.keys(review).length ? { review } : {}),
    updatedAt: (input.now ?? new Date()).toISOString(),
  };
  const file = path.join(input.workspaceRoot, targetFile(input.outputDir, slug));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(target, null, 2) + '\n');
  return { ok: true, text: formatTarget(target, all), target };
}

function mb(bytes: number | undefined): string {
  return bytes === undefined ? 'none' : `${Math.round((bytes / MB) * 10) / 10} MB`;
}

export function formatTarget(t: Target, libraryProjects: Project[]): string {
  const bySlug = new Map(libraryProjects.map((p) => [p.slug, p]));
  const lines = [
    `Saved target "${t.name}" (${t.slug}): ${t.kind}, privacy ceiling ${t.ceiling}, outputs ${t.outputs.join(', ')}.`,
    `Limits: PDF ${mb(t.limits.pdfBytes)}${t.limits.pdfPageSize ? ` at ${t.limits.pdfPageSize}` : ''}${t.limits.imageBytes !== undefined ? `, each image ${mb(t.limits.imageBytes)}` : ''}${t.limits.pieces ? `, ${t.limits.pieces} pieces` : ''}.`,
  ];
  if (t.projects.length) {
    lines.push('', 'Projects in this version, in order:');
    for (const slug of t.projects) {
      const p = bySlug.get(slug);
      const tooPrivate = p && privacyRank(p.privacy) > privacyRank(t.ceiling);
      lines.push(`- ${slug}${p ? `: ${p.title}` : ''}${tooPrivate ? ` (${p!.privacy}: stricter than the ceiling, so export and publish will refuse it; drop it or raise the ceiling)` : ''}`);
    }
  }
  const suggested = suggestOrder(t.notes ?? t.criteria?.join('\n'), libraryProjects.filter((p) => privacyRank(p.privacy) <= privacyRank(t.ceiling)));
  if (suggested.length) {
    lines.push('', `Suggested order${t.notes ? ' from the notes' : ' (library order: no notes to match)'}; show it to the designer and let them change it:`);
    for (const s of suggested) lines.push(`- ${s.slug}: ${s.title}${s.matched.length ? ` (matched: ${s.matched.slice(0, 8).join(', ')})` : ''}`);
  }
  const hidden = libraryProjects.filter((p) => privacyRank(p.privacy) > privacyRank(t.ceiling));
  if (hidden.length) lines.push('', `Left out by the ceiling: ${hidden.map((p) => `${p.slug} (${p.privacy})`).join(', ')}.`);
  if (t.kind === 'promotion' && t.criteria?.length) {
    lines.push('', 'Criteria and the evidence the library holds (keep every criterion visible, even with none):');
    for (const c of criteriaMap(t.criteria, libraryProjects.filter((p) => t.projects.length === 0 || t.projects.includes(p.slug)))) {
      lines.push(`- ${c.criterion}: ${c.evidence.length ? c.evidence.map((e) => e.title).join('; ') : 'no evidence yet'}`);
    }
  }
  if (t.kind === 'review') {
    const q = t.review?.questions ?? [];
    lines.push('', `Review round${t.review?.community ? ` for ${t.review.community}` : ''}: ${q.length ? `questions: ${q.map((x, i) => `${i + 1}. ${x}`).join(' ')}` : 'no questions yet: ask the designer for up to three'}${t.review?.notWanted ? `; not wanted: ${t.review.notWanted}` : ''}. The version is anonymised (the check reports any name, employer, client, school or link left in it) and published unlisted.`);
  }
  if (t.ceiling === 'internal') lines.push('', 'Internal: export it as a file (PDF, deck or images) only; it can\'t be published.');
  else if (t.ceiling === 'unlisted') lines.push('', 'Unlisted: publish only as a Claude artifact, or on a host where the designer adds a password; the site gets noindex and no link from the public portfolio.');
  lines.push('', `Next: build its outputs with portfolio: { target: "${t.slug}" } in prepare_open_design_brief (the projects and order come from the target).`);
  return lines.join('\n');
}
