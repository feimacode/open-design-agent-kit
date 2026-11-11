// Comments from outside the kit, merged into a design's comment sidecar
// (openspec add-artifact-comment-review and add-portfolio-share-and-review):
// threads on its Claude artifact ("claude-artifact") or feedback the designer
// pastes from a community critique ("community"). Nothing is fetched: the
// agent passes what it read or was given. Each comment is merged by its
// externalId, so importing again keeps the status the agent set; new ones
// arrive open, ready for the usual resolve flow (resolvedCommentIds).
import { createHash, randomBytes } from 'node:crypto';
import * as path from 'node:path';
import { readArtifact } from '../vendored/artifactCreate';
import { updateArtifactComments } from './artifactComments';
import type { ArtifactComment } from './artifactCommentTypes';
import { commentTextExcerpt } from './artifactCommentTypes';
import { findCollectionArtifacts } from './collectionScan';

export const COMMENT_SOURCES = ['claude-artifact', 'community'] as const;
export type CommentSource = (typeof COMMENT_SOURCES)[number];
export const MAX_IMPORTED_COMMENTS = 100;

export interface ImportedCommentInput {
  externalId?: string;
  text: string;
  author?: string;
  /** community: the page it is about (an entry path in the design's collection). */
  page?: string;
  anchor?: { selector?: string; text?: string; odId?: string };
  createdAt?: string;
  threadUrl?: string;
}

export interface ImportCommentsResult {
  ok: boolean;
  text: string;
  /** Per page: comments added and already known. */
  pages?: Array<{ entryPath: string; added: number; known: number }>;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function parse(raw: unknown, source: CommentSource): { ok: true; value: ImportedCommentInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'comments lists at least one { text, externalId?, author?, page?, anchor?, createdAt?, threadUrl? }.' };
  if (raw.length > MAX_IMPORTED_COMMENTS) return { ok: false, error: `At most ${MAX_IMPORTED_COMMENTS} comments per call.` };
  const out: ImportedCommentInput[] = [];
  for (const [i, c] of raw.entries()) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return { ok: false, error: `comments[${i}] must be an object with text.` };
    const o = c as Record<string, unknown>;
    const text = str(o.text);
    if (!text) return { ok: false, error: `comments[${i}].text is empty.` };
    if (text.length > 4000) return { ok: false, error: `comments[${i}].text is over 4,000 characters; paste one point per comment.` };
    const externalId = str(o.externalId);
    if (source === 'claude-artifact' && !externalId) return { ok: false, error: `comments[${i}].externalId is required for claude-artifact comments (the thread's comment id).` };
    let anchor: ImportedCommentInput['anchor'];
    if (o.anchor !== undefined) {
      if (!o.anchor || typeof o.anchor !== 'object' || Array.isArray(o.anchor)) return { ok: false, error: `comments[${i}].anchor is { selector?, text?, odId? }.` };
      const a = o.anchor as Record<string, unknown>;
      anchor = { ...(str(a.selector) ? { selector: str(a.selector) } : {}), ...(str(a.text) ? { text: str(a.text) } : {}), ...(str(a.odId) ? { odId: str(a.odId) } : {}) };
    }
    const createdAt = str(o.createdAt);
    if (createdAt && Number.isNaN(Date.parse(createdAt))) return { ok: false, error: `comments[${i}].createdAt is an ISO time.` };
    out.push({ text, ...(externalId ? { externalId } : {}), ...(str(o.author) ? { author: str(o.author) } : {}), ...(str(o.page) ? { page: str(o.page)!.replace(/\\/g, '/') } : {}), ...(anchor ? { anchor } : {}), ...(createdAt ? { createdAt } : {}), ...(str(o.threadUrl) ? { threadUrl: str(o.threadUrl) } : {}) });
  }
  return { ok: true, value: out };
}

/** The pages a community point can attach to: the entry's collection in its folder, home page first. */
async function pagesOf(workspaceRoot: string, outputDir: string, entryPath: string): Promise<{ home: string; pages: Set<string> }> {
  const artifact = await readArtifact({ workspaceRoot, entryPath }).catch(() => null);
  const collectionId = typeof artifact?.manifest?.collectionId === 'string' ? artifact.manifest.collectionId : undefined;
  const pages = new Set<string>([entryPath]);
  let home = entryPath;
  if (collectionId) {
    const dir = path.posix.dirname(entryPath);
    const members = (await findCollectionArtifacts(workspaceRoot, outputDir, collectionId).catch(() => [])).filter((m) => path.posix.dirname(m.entryPath) === dir);
    for (const m of members) pages.add(m.entryPath);
    const index = members.find((m) => m.screenRole === 'index') ?? members.find((m) => path.posix.basename(m.entryPath) === 'index.html');
    if (index) home = index.entryPath;
  }
  return { home, pages };
}

export async function importComments(input: { workspaceRoot: string; outputDir: string; entryPath: string; source: unknown; artifactUrl?: unknown; comments: unknown; now?: Date }): Promise<ImportCommentsResult> {
  const entryPath = input.entryPath.replace(/\\/g, '/');
  const source = input.source;
  if (!(COMMENT_SOURCES as readonly unknown[]).includes(source)) return { ok: false, text: `source is one of ${COMMENT_SOURCES.join(', ')}.` };
  const src = source as CommentSource;
  const artifact = await readArtifact({ workspaceRoot: input.workspaceRoot, entryPath }).catch(() => null);
  if (!artifact) return { ok: false, text: `No artifact at ${entryPath}. Pass the entry path of a registered design.` };
  const artifactUrl = str(input.artifactUrl);
  if (src === 'claude-artifact' && !artifactUrl) return { ok: false, text: 'artifactUrl is required for claude-artifact comments: the artifact the threads are on.' };
  const parsed = parse(input.comments, src);
  if (!parsed.ok) return { ok: false, text: parsed.error };

  const { home, pages } = src === 'community' ? await pagesOf(input.workspaceRoot, input.outputDir, entryPath) : { home: entryPath, pages: new Set([entryPath]) };
  const byPage = new Map<string, ImportedCommentInput[]>();
  const misplaced: string[] = [];
  for (const c of parsed.value) {
    let page = entryPath;
    if (src === 'community') {
      page = c.page && pages.has(c.page) ? c.page : home;
      if (c.page && !pages.has(c.page)) misplaced.push(c.page);
    }
    byPage.set(page, [...(byPage.get(page) ?? []), c]);
  }

  const now = (input.now ?? new Date()).toISOString();
  const summary: Array<{ entryPath: string; added: number; known: number }> = [];
  for (const [page, list] of byPage) {
    let added = 0;
    let known = 0;
    await updateArtifactComments(input.workspaceRoot, page, (current) => {
      const next = [...current];
      for (const c of list) {
        const externalId = c.externalId ?? `community-${createHash('sha1').update(`${page}\n${c.text}`).digest('hex').slice(0, 12)}`;
        const existing = next.findIndex((x) => x.externalId === externalId && x.source === src);
        const anchorSelector = c.anchor?.odId ? `[data-od-id="${c.anchor.odId}"]` : c.anchor?.selector;
        if (existing >= 0) {
          known++;
          // Keep the status the agent set; refresh the text and author.
          next[existing] = { ...next[existing], note: c.text, ...(c.author ? { author: c.author } : {}), updatedAt: next[existing].updatedAt };
          continue;
        }
        added++;
        const comment: ArtifactComment = {
          id: `c-${randomBytes(4).toString('hex')}`,
          ...(c.anchor?.odId ? { elementId: c.anchor.odId } : {}),
          selector: anchorSelector ?? 'body',
          htmlHint: '',
          note: c.text,
          status: 'open',
          createdAt: c.createdAt ?? now,
          updatedAt: now,
          ...(c.anchor?.text ? { text: commentTextExcerpt(c.anchor.text) } : {}),
          source: src,
          externalId,
          ...(c.author ? { author: c.author } : {}),
          ...(c.threadUrl ?? artifactUrl ? { threadUrl: c.threadUrl ?? artifactUrl } : {}),
        };
        next.push(comment);
      }
      return next;
    });
    summary.push({ entryPath: page, added, known });
  }
  const lines = [`Imported ${parsed.value.length} ${src === 'community' ? 'community feedback point' : 'artifact comment'}${parsed.value.length === 1 ? '' : 's'}:`];
  for (const s of summary) lines.push(`- ${s.entryPath}: ${s.added} new (open)${s.known ? `, ${s.known} already imported (status kept)` : ''}`);
  if (misplaced.length) lines.push('', `Not pages of this design, so attached to the home page (${home}): ${[...new Set(misplaced)].join(', ')}.`);
  lines.push('', 'They now appear in get_open_design_artifact\'s openComments for each page. Apply the changes, then resolve each with resolvedCommentIds when you register again.');
  if (src === 'community') lines.push('After revising, compare the posted version with the revised one on a before/after page and draft the follow-up post: one line per resolved point, saying what changed.');
  return { ok: true, text: lines.join('\n'), pages: summary };
}
