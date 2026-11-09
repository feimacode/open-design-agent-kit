// Steering edits (openspec add-steering-edits): one verb on one part of a
// design. This module resolves the scope, stamps it with a data-od-id,
// snapshots the design, writes the edit log and composes the instructions.
// It never writes design content: the agent makes the edit with its own file
// tools, and check_open_design_artifact with the editId proves it
// (export/editGuard.ts).
import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { load, type CheerioAPI } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { checkRunSlug } from '../export/checkHistory';
import { readArtifact, writeArtifactManifest } from '../vendored/artifactCreate';
import type { JsonRecord } from '../vendored/artifactManifest';
import { readArtifactComments } from '../workspace/artifactComments';
import { extractRootTokens } from './styleTiles';
import { isSteeringVerb, PAGE_SCOPE_VERBS, STEERING_VERBS, type SteeringVerb } from './steeringVerbs';

export const EDIT_LOG_LIMIT = 20;
export const NAMED_REGIONS = ['header', 'hero', 'main', 'footer'] as const;
export type NamedRegion = (typeof NAMED_REGIONS)[number];
/** The scope's HTML in the instructions is cut here; the agent reads the file for the rest. */
const SCOPE_HTML_LIMIT = 12_000;
const MAX_TOKENS_LISTED = 80;

export interface EditScopeInput {
  /** An element's data-od-id. */
  id?: string;
  /** A preview comment's id: its element. */
  commentId?: string;
  /** A CSS selector that matches exactly one element. */
  selector?: string;
  /** A named region, or "page" (polish and harden only). */
  region?: NamedRegion | 'page';
  /** The section whose heading has this text. */
  heading?: string;
}

export interface EditScopeRecord {
  /** The data-od-id the scope carries; absent for a page scope. */
  id?: string;
  /** How the user or agent named it, e.g. 'the section headed "Pricing"'. */
  label: string;
  page?: boolean;
}

export interface EditRecord {
  id: string;
  entryPath: string;
  verb: SteeringVerb;
  scope: EditScopeRecord;
  notes?: string;
  createdAt: string;
  /** sha256 of the design right after the stamp, i.e. the snapshot. */
  beforeHash: string;
}

export interface EditGuardResult {
  checkedAt: string;
  outOfScope: number;
  noEffect: boolean;
  regressions: number;
  /** sha256 of the design the guard checked. */
  hash: string;
  /** The before/after image, workspace-relative. */
  image?: string;
}

export interface EditLogEntry {
  id: string;
  verb: SteeringVerb;
  scope: string;
  scopeId?: string;
  at: string;
  /** `dropped`: prepared, then left without any change when the next edit was prepared. */
  status: 'prepared' | 'checked' | 'undone' | 'dropped';
  result?: EditGuardResult;
}

export type ScopeResolution =
  | { ok: true; element?: Element; page: boolean; label: string; existingId?: string }
  | { ok: false; error: string };

function assertWorkspaceRelative(workspaceRoot: string, rel: string): string {
  const abs = path.isAbsolute(rel) ? rel : path.join(workspaceRoot, rel);
  const back = path.relative(workspaceRoot, abs);
  if (back.startsWith('..') || path.isAbsolute(back)) throw new Error(`Path escapes the workspace: ${rel}`);
  return abs;
}

export function hashHtml(html: string): string {
  return createHash('sha256').update(html).digest('hex');
}

/** `<outputDir>/.edits/<entry slug>/`: snapshots live beside the check runs, outside the design's folder so nothing publishes them. */
export function editsDir(outputDir: string, entryPath: string): string {
  return path.posix.join(outputDir.replace(/\\/g, '/').replace(/\/$/, ''), '.edits', checkRunSlug(entryPath, outputDir));
}

export function editDir(outputDir: string, entryPath: string, editId: string): string {
  return path.posix.join(editsDir(outputDir, entryPath), editId);
}

function textOf($: CheerioAPI, el: AnyNode): string {
  return $(el).text().replace(/\s+/g, ' ').trim();
}

function describe($: CheerioAPI, el: Element): string {
  const id = $(el).attr('id');
  const cls = ($(el).attr('class') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const tag = `${el.tagName}${id ? `#${id}` : ''}${cls.map((c) => `.${c}`).join('')}`;
  const text = textOf($, el).slice(0, 50);
  return text ? `${tag} "${text}"` : tag;
}

function topLevel($: CheerioAPI, selector: string): Element[] {
  return $(selector)
    .toArray()
    .filter((el): el is Element => el.type === 'tag' && $(el).parents('main, article, aside, [role=main]').length === 0);
}

function regionElement($: CheerioAPI, region: NamedRegion): Element | undefined {
  if (region === 'header') return topLevel($, 'header, [role=banner]')[0];
  if (region === 'footer') return topLevel($, 'footer, [role=contentinfo]').at(-1);
  const main = $('main, [role=main]').first().get(0) as Element | undefined;
  if (region === 'main') return main;
  // hero: the first section of main, else the first section of the page.
  const first = main ? $(main).children('section, header, div, article').first().get(0) : $('body section').first().get(0);
  return first as Element | undefined;
}

function sectionForHeading($: CheerioAPI, heading: Element): Element {
  // From the parent up: a heading that carries its own data-od-id is still only the section's title.
  const holder = $(heading).parent().closest('section, article, aside, header, footer, [data-od-id]').get(0) as Element | undefined;
  return holder && holder.tagName !== 'body' ? holder : ((heading.parent as Element) ?? heading);
}

/** Resolves a scope to exactly one element of the design, or the page; lists candidates when it matches none or several. */
export function resolveEditScope(html: string, scope: EditScopeInput, verb: SteeringVerb, comment?: { elementId?: string; selector: string }): ScopeResolution {
  // Source locations let the stamp land on the very element that was resolved.
  const $ = load(html, { sourceCodeLocationInfo: true });
  const pick = (els: Element[], what: string): ScopeResolution => {
    if (els.length === 1) {
      const el = els[0];
      if ($(el).closest('[data-od-include]').length > 0) {
        return { ok: false, error: `${what} is part of the shared navigation (data-od-include), which every screen of the flow uses. Steering edits change one design; edit the shared navigation file itself instead.` };
      }
      return { ok: true, element: el, page: false, label: what, existingId: $(el).attr('data-od-id') || undefined };
    }
    if (els.length === 0) return { ok: false, error: `${what} matches nothing in the design.${candidateList($)}` };
    return { ok: false, error: `${what} matches ${els.length} elements; name one of them:\n${els.slice(0, 8).map((el) => `- ${describe($, el)}${$(el).attr('data-od-id') ? ` (id "${$(el).attr('data-od-id')}")` : ''}`).join('\n')}` };
  };
  const given = (['id', 'commentId', 'selector', 'region', 'heading'] as const).filter((k) => typeof scope[k] === 'string' && (scope[k] as string).trim());
  if (given.length !== 1) return { ok: false, error: 'Give exactly one of scope.id, scope.commentId, scope.selector, scope.region or scope.heading.' };

  if (scope.region === 'page') {
    if (!PAGE_SCOPE_VERBS.includes(verb)) {
      return { ok: false, error: `A whole page can't be made ${verb}: that's a new direction, not an edit. Pick one part (a region, a section by its heading, or an element), or explore directions with prepare_open_design_exploration.` };
    }
    return { ok: true, page: true, label: 'the whole page' };
  }
  if (scope.id) return pick($(`[data-od-id="${scope.id.replace(/"/g, '\\"')}"]`).toArray() as Element[], `The element with data-od-id "${scope.id}"`);
  if (scope.commentId) {
    if (!comment) return { ok: false, error: `No comment "${scope.commentId}" on this design.` };
    if (comment.elementId) {
      const byId = $(`[data-od-id="${comment.elementId.replace(/"/g, '\\"')}"]`).toArray() as Element[];
      if (byId.length === 1) return pick(byId, `The element of comment ${scope.commentId}`);
    }
    let found: Element[] = [];
    try {
      found = $(comment.selector).toArray().filter((n): n is Element => n.type === 'tag');
    } catch {
      found = [];
    }
    return pick(found, `The element of comment ${scope.commentId}`);
  }
  if (scope.selector) {
    let found: Element[];
    try {
      found = $(scope.selector).toArray().filter((n): n is Element => n.type === 'tag');
    } catch {
      return { ok: false, error: `"${scope.selector}" isn't a valid CSS selector.` };
    }
    return pick(found, `The selector "${scope.selector}"`);
  }
  if (scope.region) {
    if (!(NAMED_REGIONS as readonly string[]).includes(scope.region)) return { ok: false, error: `Unknown region "${scope.region}". Use ${NAMED_REGIONS.join(', ')} or page.` };
    const el = regionElement($, scope.region as NamedRegion);
    return el ? pick([el], `The ${scope.region}`) : { ok: false, error: `The design has no ${scope.region}.${candidateList($)}` };
  }
  const wanted = (scope.heading ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const headings = $('h1, h2, h3, h4, h5, h6').toArray() as Element[];
  const exact = headings.filter((h) => textOf($, h).toLowerCase() === wanted);
  const matches = exact.length > 0 ? exact : headings.filter((h) => textOf($, h).toLowerCase().includes(wanted));
  const sections = [...new Set(matches.map((h) => sectionForHeading($, h)))];
  return pick(sections, `The section headed "${scope.heading}"`);
}

function candidateList($: CheerioAPI): string {
  const headings = ($('h1, h2, h3').toArray() as Element[]).map((h) => textOf($, h)).filter(Boolean).slice(0, 10);
  const regions = NAMED_REGIONS.filter((r) => regionElement($, r));
  const parts: string[] = [];
  if (regions.length) parts.push(`regions: ${regions.join(', ')}`);
  if (headings.length) parts.push(`headings: ${headings.map((h) => `"${h.slice(0, 40)}"`).join(', ')}`);
  return parts.length ? ` Candidates: ${parts.join('; ')}.` : '';
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'part'
  );
}

/**
 * Adds data-od-id to the scope element's start tag, by its source offset, so
 * nothing else in the file changes. Returns the html unchanged when the
 * element already has one.
 */
export function stampScope(html: string, target: { tagName: string; startOffset: number }, id: string): string {
  const $ = load(html, { sourceCodeLocationInfo: true });
  const el = ($('*').toArray() as Element[]).find((e) => e.sourceCodeLocation?.startOffset === target.startOffset && e.tagName === target.tagName);
  const loc = el?.sourceCodeLocation?.startTag;
  if (!el || !loc) throw new Error(`Couldn't find the ${target.tagName} element in the source to mark it.`);
  if ($(el).attr('data-od-id')) return html;
  const tag = html.slice(loc.startOffset, loc.endOffset);
  const close = tag.endsWith('/>') ? tag.length - 2 : tag.length - 1;
  const stamped = `${tag.slice(0, close).replace(/\s+$/, '')} data-od-id="${id}"${tag.slice(close)}`;
  return html.slice(0, loc.startOffset) + stamped + html.slice(loc.endOffset);
}

/** A data-od-id not yet used in the design. */
export function uniqueScopeId(html: string, base: string): string {
  const $ = load(html);
  const used = new Set($('[data-od-id]').toArray().map((el) => $(el).attr('data-od-id')));
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

function readLog(manifest: JsonRecord | null): EditLogEntry[] {
  const metadata = manifest?.metadata;
  const edits = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as JsonRecord).edits : undefined;
  return Array.isArray(edits) ? (edits as EditLogEntry[]).filter((e) => e && typeof e.id === 'string') : [];
}

/** The manifest's edit log, newest last. */
export function editLogOf(manifest: JsonRecord | null): EditLogEntry[] {
  return readLog(manifest);
}

async function writeLog(workspaceRoot: string, outputDir: string, entryPath: string, manifest: JsonRecord, log: EditLogEntry[]): Promise<void> {
  const kept = log.slice(-EDIT_LOG_LIMIT);
  const dropped = log.slice(0, Math.max(0, log.length - EDIT_LOG_LIMIT));
  const metadata = manifest.metadata && typeof manifest.metadata === 'object' && !Array.isArray(manifest.metadata) ? { ...(manifest.metadata as JsonRecord) } : {};
  metadata.edits = kept as unknown as JsonRecord[];
  await writeArtifactManifest({ workspaceRoot, entryPath, artifactManifest: { ...manifest, metadata } });
  for (const old of dropped) {
    await fs.rm(path.join(workspaceRoot, editDir(outputDir, entryPath, old.id)), { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Updates one edit's log entry (the guard records its result here). */
export async function updateEditLog(workspaceRoot: string, outputDir: string, entryPath: string, editId: string, change: Partial<EditLogEntry>): Promise<void> {
  const artifact = await readArtifact({ workspaceRoot, entryPath });
  if (!artifact?.manifest) return;
  const log = readLog(artifact.manifest).map((e) => (e.id === editId ? { ...e, ...change } : e));
  await writeLog(workspaceRoot, outputDir, entryPath, artifact.manifest, log);
}

/** The edit folder's copy of the screen's own data file, taken when the edit was prepared. */
export const BEFORE_DATA_FILE = 'before.data.json';

/** The screen's own sample data file (`orders.html` → `orders.data.json`), absolute. Shared `_shared/data.json` is found by any page in the folder. */
export function screenDataFile(workspaceRoot: string, entryPath: string): string {
  return assertWorkspaceRelative(workspaceRoot, entryPath).replace(/\.html?$/i, '') + '.data.json';
}

export async function readEditRecord(workspaceRoot: string, outputDir: string, entryPath: string, editId: string): Promise<{ record: EditRecord; before: string; dir: string } | undefined> {
  if (!/^[a-z]+-[a-z0-9]+$/.test(editId)) return undefined;
  const dir = editDir(outputDir, entryPath, editId);
  try {
    const record = JSON.parse(await fs.readFile(path.join(workspaceRoot, dir, 'edit.json'), 'utf8')) as EditRecord;
    const before = await fs.readFile(path.join(workspaceRoot, dir, 'before.html'), 'utf8');
    return { record, before, dir };
  } catch {
    return undefined;
  }
}

/** The verb's section of steering-verbs.md ("## bolder" to the next heading). */
export function verbDefinition(doc: string | undefined, verb: SteeringVerb): string | undefined {
  if (!doc) return undefined;
  const match = new RegExp(`^## ${verb}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(doc);
  return match ? match[1].trim() : undefined;
}

/** The opening paragraph of steering-verbs.md, shared by every verb. */
function verbsPreamble(doc: string | undefined): string | undefined {
  if (!doc) return undefined;
  const body = doc.replace(/<!--[\s\S]*?-->/g, '').replace(/^# .*$/m, '');
  const end = body.search(/^## /m);
  return (end >= 0 ? body.slice(0, end) : body).trim() || undefined;
}

export interface PrepareEditInput {
  workspaceRoot: string;
  outputDir: string;
  entryPath: string;
  verb?: unknown;
  scope?: unknown;
  notes?: unknown;
  /** Restore this edit's snapshot instead of preparing a new one. */
  undo?: unknown;
  /** steering-verbs.md from the content index. */
  verbsDoc?: string;
  /** True on the hosted server, where files are written with write_open_design_file. */
  managedWorkspace?: boolean;
}

export type PrepareEditResult =
  | { status: 'prepared'; editId: string; verb: SteeringVerb; scope: EditScopeRecord; stamped: boolean; instructions: string; snapshot: string }
  | { status: 'undone'; editId: string; message: string }
  | { status: 'error'; error: string };

function parseScope(raw: unknown): EditScopeInput | undefined {
  if (typeof raw === 'string' && raw.trim()) {
    const s = raw.trim();
    if (s === 'page' || (NAMED_REGIONS as readonly string[]).includes(s)) return { region: s as NamedRegion | 'page' };
    return { heading: s };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: EditScopeInput = {};
  for (const key of ['id', 'commentId', 'selector', 'region', 'heading'] as const) {
    if (typeof r[key] === 'string' && (r[key] as string).trim()) (out as Record<string, string>)[key] = (r[key] as string).trim();
  }
  return out;
}

/** prepare_open_design_edit: resolves and stamps the scope, snapshots the design, logs the edit and returns the instructions; or undoes an edit. */
export async function prepareEdit(input: PrepareEditInput): Promise<PrepareEditResult> {
  const { workspaceRoot, outputDir } = input;
  const entryPath = input.entryPath.replace(/\\/g, '/').replace(/^\.\//, '');
  const artifact = await readArtifact({ workspaceRoot, entryPath }).catch(() => null);
  if (!artifact) return { status: 'error', error: `No design at ${entryPath}.` };
  if (!artifact.manifest) return { status: 'error', error: `${entryPath} isn't registered yet. Call register_open_design_artifact first, then prepare the edit.` };
  const renderer = typeof artifact.manifest.renderer === 'string' ? artifact.manifest.renderer : 'html';
  if (!['html', 'mini-app', 'deck-html', 'diagram'].includes(renderer)) return { status: 'error', error: `Steering edits work on HTML designs; ${entryPath} is rendered as "${renderer}".` };

  if (typeof input.undo === 'string' && input.undo.trim()) return undoEdit(workspaceRoot, outputDir, entryPath, artifact.manifest, input.undo.trim());

  if (!isSteeringVerb(input.verb)) return { status: 'error', error: `verb must be one of ${STEERING_VERBS.join(', ')}.` };
  const verb = input.verb;
  const scope = parseScope(input.scope);
  if (!scope) return { status: 'error', error: 'scope is required: { id }, { commentId }, { selector }, { region: "header" | "hero" | "main" | "footer" | "page" } or { heading: "Pricing" }.' };
  const comment = scope.commentId ? (await readArtifactComments(workspaceRoot, entryPath)).find((c) => c.id === scope.commentId) : undefined;

  const html = artifact.entryContent;
  const resolved = resolveEditScope(html, scope, verb, comment);
  if (!resolved.ok) return { status: 'error', error: resolved.error };

  let stampedHtml = html;
  let scopeId: string | undefined;
  if (!resolved.page && resolved.element) {
    scopeId = resolved.existingId;
    if (!scopeId) {
      const startOffset = resolved.element.sourceCodeLocation?.startOffset;
      if (startOffset === undefined) return { status: 'error', error: "Couldn't locate the scope in the source to mark it." };
      const base = scope.heading ? `edit-${slug(scope.heading)}` : scope.region ? `edit-${scope.region}` : `edit-${slug(resolved.element.tagName + '-' + (load(html)(resolved.element).text().trim().split(/\s+/).slice(0, 3).join(' ') || 'part'))}`;
      scopeId = uniqueScopeId(html, base);
      stampedHtml = stampScope(html, { tagName: resolved.element.tagName, startOffset }, scopeId);
    }
  }
  const stamped = stampedHtml !== html;
  if (stamped) await fs.writeFile(assertWorkspaceRelative(workspaceRoot, entryPath), stampedHtml);

  const editId = `${verb}-${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
  const dir = editDir(outputDir, entryPath, editId);
  const absDir = assertWorkspaceRelative(workspaceRoot, dir);
  await fs.mkdir(absDir, { recursive: true });
  const notes = typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim().slice(0, 500) : undefined;
  const scopeRecord: EditScopeRecord = { ...(scopeId ? { id: scopeId } : {}), label: resolved.label.replace(/^The /, 'the '), ...(resolved.page ? { page: true } : {}) };
  const record: EditRecord = { id: editId, entryPath, verb, scope: scopeRecord, ...(notes ? { notes } : {}), createdAt: new Date().toISOString(), beforeHash: hashHtml(stampedHtml) };
  await fs.writeFile(path.join(absDir, 'before.html'), stampedHtml);
  // A screen's own sample data (`orders.html` → `orders.data.json`) belongs to its before state too.
  await fs.copyFile(screenDataFile(workspaceRoot, entryPath), path.join(absDir, BEFORE_DATA_FILE)).catch(() => undefined);
  await fs.writeFile(path.join(absDir, 'edit.json'), `${JSON.stringify(record, null, 2)}\n`);

  const fresh = (await readArtifact({ workspaceRoot, entryPath }))?.manifest ?? artifact.manifest;
  const log = readLog(fresh);
  // An edit prepared and then left untouched (the agent re-scoped instead) isn't pending any more.
  for (const [i, entry] of log.entries()) {
    if (entry.status !== 'prepared') continue;
    const earlier = await readEditRecord(workspaceRoot, outputDir, entryPath, entry.id);
    if (earlier && earlier.record.beforeHash === hashHtml(html)) log[i] = { ...entry, status: 'dropped' };
  }
  log.push({ id: editId, verb, scope: scopeRecord.label, ...(scopeId ? { scopeId } : {}), at: record.createdAt, status: 'prepared' });
  await writeLog(workspaceRoot, outputDir, entryPath, fresh, log);

  const scopeHtml = scopeId ? load(stampedHtml)(`[data-od-id="${scopeId}"]`).first().toString() : '';
  const instructions = composeEditInstructions({ entryPath, verb, scope: scopeRecord, scopeHtml, tokens: extractRootTokens(stampedHtml), notes, verbsDoc: input.verbsDoc, editId, stamped, managedWorkspace: input.managedWorkspace, commentId: comment?.id });
  return { status: 'prepared', editId, verb, scope: scopeRecord, stamped, instructions, snapshot: `${dir}/before.html` };
}

async function undoEdit(workspaceRoot: string, outputDir: string, entryPath: string, manifest: JsonRecord, editId: string): Promise<PrepareEditResult> {
  const log = readLog(manifest);
  const index = log.findIndex((e) => e.id === editId);
  if (index < 0) return { status: 'error', error: `No edit "${editId}" in this design's log.` };
  if (log[index].status === 'undone') return { status: 'error', error: `Edit ${editId} was already undone.` };
  const later = log.slice(index + 1).filter((e) => e.status !== 'undone' && e.status !== 'dropped');
  if (later.length > 0) {
    return { status: 'error', error: `Edit ${later.at(-1)!.id} (${later.at(-1)!.verb} on ${later.at(-1)!.scope}) was made after ${editId}. Undo it first, newest first.` };
  }
  const saved = await readEditRecord(workspaceRoot, outputDir, entryPath, editId);
  if (!saved) return { status: 'error', error: `The snapshot for ${editId} is gone, so it can't be undone.` };
  await fs.writeFile(assertWorkspaceRelative(workspaceRoot, entryPath), saved.before);
  await fs.copyFile(path.join(workspaceRoot, saved.dir, BEFORE_DATA_FILE), screenDataFile(workspaceRoot, entryPath)).catch(() => undefined);
  log[index] = { ...log[index], status: 'undone' };
  await writeLog(workspaceRoot, outputDir, entryPath, manifest, log);
  return {
    status: 'undone',
    editId,
    message: `Undid ${log[index].verb} on ${log[index].scope}: ${entryPath} is back to how it was before that edit. Previews that show it update by themselves; nothing else needs registering.`,
  };
}

function tokenLines(tokens: Map<string, string>): string {
  const entries = [...tokens.entries()].slice(0, MAX_TOKENS_LISTED);
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `- \`${k}: ${v}\``).join('\n') + (tokens.size > MAX_TOKENS_LISTED ? `\n- …and ${tokens.size - MAX_TOKENS_LISTED} more in :root` : '');
}

export function composeEditInstructions(input: {
  entryPath: string;
  verb: SteeringVerb;
  scope: EditScopeRecord;
  scopeHtml: string;
  tokens: Map<string, string>;
  notes?: string;
  verbsDoc?: string;
  editId: string;
  stamped: boolean;
  managedWorkspace?: boolean;
  commentId?: string;
}): string {
  const { entryPath, verb, scope, editId } = input;
  const definition = verbDefinition(input.verbsDoc, verb);
  const preamble = verbsPreamble(input.verbsDoc);
  const target = scope.page ? 'the whole page' : `${scope.label}, the element with \`data-od-id="${scope.id}"\``;
  const parts: string[] = [];
  parts.push(`# Steering edit: ${verb} on ${scope.page ? 'the whole page' : scope.label}\n\nMake ${target} in \`${entryPath}\` **${verb}**, and change nothing else. Edit id: \`${editId}\`.`);
  if (input.notes) parts.push(`## What the user said\n\n${input.notes}`);
  if (preamble) parts.push(`## Steering edits\n\n${preamble}`);
  parts.push(`## What "${verb}" means\n\n${definition ?? `Make it ${verb}, within the design system.`}`);
  const rules = scope.page
    ? [
        '- Keep every section, its order and its copy; this is a finish, not a redesign.',
        '- Keep every `data-od-*` attribute exactly as it is.',
      ]
    : [
        `- Change only the element with \`data-od-id="${scope.id}"\` and what is inside it. Everything outside it must look and read exactly as before: the check compares the rest of the page with a snapshot, in the markup and on screen.`,
        `- Keep that element itself and its \`data-od-id\`, so the check can find it. Keep every other \`data-od-*\` attribute inside it.`,
        `- Put new or changed CSS in rules that only match inside it, e.g. \`[data-od-id="${scope.id}"] h2 { … }\`. Don't change shared rules (\`h2\`, \`.btn\`, \`:root\`) that other parts of the page use; that moves them too.`,
        '- The part may grow or shrink in height; content after it moving up or down is fine.',
      ];
  rules.push(verb === 'distill' ? '- Copy may be shortened or removed where it doesn’t serve the purpose; keep every fact.' : '- Keep the copy word for word.');
  parts.push(`## Rules\n\n${rules.join('\n')}`);
  const tokens = tokenLines(input.tokens);
  if (tokens) parts.push(`## The design's tokens\n\nUse these \`:root\` values; when the step you need isn't there, take the nearest one that is.\n\n${tokens}`);
  if (input.scopeHtml) {
    const cut = input.scopeHtml.length > SCOPE_HTML_LIMIT;
    parts.push(`## The part as it is now\n\n\`\`\`html\n${cut ? `${input.scopeHtml.slice(0, SCOPE_HTML_LIMIT)}\n<!-- …cut here; read the file for the rest -->` : input.scopeHtml}\n\`\`\``);
  }
  const write = input.managedWorkspace ? 'Read the file and write the whole file back with write_open_design_file' : 'Edit the file with your own file tools';
  const steps = [
    `1. ${write}. ${input.stamped ? `The element now carries \`data-od-id="${scope.id}"\` (added for this edit); keep it.` : ''}`.trim(),
    `2. Call check_open_design_artifact with entryPath "${entryPath}" and editId "${editId}". Fix every \`edit-out-of-scope\` and \`edit-regression\` finding. If it reports \`edit-no-effect\`, the change was too timid: go one step further, once.`,
    `3. Show the user the before and after image from the check, in a sentence on what changed. Offer to undo it (prepare_open_design_edit with undo "${editId}") or to steer it again.`,
  ];
  if (input.commentId) steps.push(`4. Re-register the design with resolvedCommentIds ["${input.commentId}"] so the comment is marked done.`);
  parts.push(`## Steps\n\n${steps.join('\n')}`);
  return parts.join('\n\n');
}

export function formatPrepareEditResult(result: PrepareEditResult): string {
  if (result.status === 'error') return result.error;
  if (result.status === 'undone') return result.message;
  return `${JSON.stringify({ editId: result.editId, verb: result.verb, scope: result.scope, snapshot: result.snapshot }, null, 2)}\n\n${result.instructions}`;
}
