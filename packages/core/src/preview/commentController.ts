/// <reference lib="dom" />
// Comment mode for a preview shell (openspec add-browser-preview): the
// comment list, the input panel, pins, and status changes. Shared by the VS
// Code Artifact Preview and the browser preview; each shell supplies how
// comments are persisted (its host transport) and owns the panel element,
// the selection highlight and the bridge.
import type { ArtifactComment } from '../workspace/artifactCommentTypes';
import { STEERING_VERB_HINTS, STEERING_VERB_LABELS, STEERING_VERBS, verbCommentNote, type SteeringVerb } from '../generation/steeringVerbs';
import { escapeHtml, hostRectOf } from './overlays';
import type { BridgeRect, ElementSnapshot, ToBridge } from './protocol';

export interface CommentControllerOptions {
  /** The shell's floating panel; the controller fills it for the comment input and pin details. */
  panel: HTMLElement;
  iframe: HTMLIFrameElement;
  host: NonNullable<ArtifactComment['host']>;
  /** Persists changed comments and deletions (merged by id on the host side). */
  persist(changed: ArtifactComment[], deletedIds: string[]): void;
  /** Hides the panel and clears the selection (the shell owns both). */
  closePanel(): void;
  /** The list changed: the shell refreshes its send button and tells the bridge. */
  onListChanged(): void;
  /** Called once a new comment is saved, e.g. to capture its crop. */
  onAdded?(comment: ArtifactComment, target: ElementSnapshot): void;
  /** Clicking a pin opens its details with Resolve and Delete (the browser preview). */
  pinDetails?: boolean;
  /**
   * Shows the steering verbs in the comment panel (openspec add-steering-edits):
   * a verb saves a comment with that verb and hands it here to send at once.
   */
  sendVerb?(comment: ArtifactComment): void;
}

export interface CommentController {
  setComments(comments: ArtifactComment[]): void;
  all(): ArtifactComment[];
  /** Comments with status `open`. */
  open(): ArtifactComment[];
  openInput(target: ElementSnapshot): void;
  /** The fields the bridge needs to report pin rects. */
  forBridge(): Extract<ToBridge, { type: 'set-comments' }>['comments'];
  /** Pin elements for every unresolved comment, placed from the bridge's pin rects. */
  pins(pinRects: { commentId: string; rect: BridgeRect | null }[]): HTMLElement[];
  /** Marks every open comment sent and persists them; returns them. */
  markOpenSent(): ArtifactComment[];
  /** Applies a change to one comment and persists it. */
  patch(id: string, change: Partial<ArtifactComment>): void;
  /** Replaces one comment locally with the host's copy (e.g. after the host saved its crop); nothing is persisted. */
  upsertLocal(comment: ArtifactComment): void;
}

function newCommentId(): string {
  return `c-${Math.random().toString(36).slice(2, 10)}`;
}

/** A new comment for the clicked element: the robust selector, text excerpt, document rect and viewport; never an invented id. */
export function commentFromSnapshot(target: ElementSnapshot, note: string, host: NonNullable<ArtifactComment['host']>, now = new Date().toISOString(), verb?: SteeringVerb): ArtifactComment {
  return {
    ...(verb ? { verb } : {}),
    id: newCommentId(),
    ...(target.sourceElementId ? { elementId: target.sourceElementId } : {}),
    selector: target.selector,
    htmlHint: target.htmlHint,
    note,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    text: target.textExcerpt || undefined,
    rect: { x: Math.round(target.docRect.left), y: Math.round(target.docRect.top), width: Math.round(target.docRect.width), height: Math.round(target.docRect.height) },
    viewport: target.viewport,
    host,
  };
}

export function createCommentController(options: CommentControllerOptions): CommentController {
  const { panel, iframe } = options;
  let comments: ArtifactComment[] = [];

  const changed = (list: ArtifactComment[], deletedIds: string[] = []): void => {
    options.persist(list, deletedIds);
    options.onListChanged();
  };

  const openInput = (target: ElementSnapshot): void => {
    panel.hidden = false;
    panel.innerHTML = `
    <div class="od-panel-header">
      <span class="od-panel-header-title">Add comment</span>
      <button id="od-comment-close" class="od-panel-close" aria-label="Close">×</button>
    </div>
    <div class="od-panel-body">
      <textarea id="od-comment-text" class="od-textarea" rows="3" placeholder="What should change here?"></textarea>
      ${
        options.sendVerb
          ? `<div class="od-verbs" role="group" aria-label="Or steer this part">${STEERING_VERBS.map(
              (v) => `<button type="button" class="od-btn od-verb" data-od-verb="${v}" title="${escapeHtml(STEERING_VERB_HINTS[v])}">${STEERING_VERB_LABELS[v]}</button>`,
            ).join('')}</div>`
          : ''
      }
    </div>
    <div class="od-panel-footer">
      <span class="od-spacer"></span>
      <button id="od-comment-cancel" class="od-btn">Cancel</button>
      <button id="od-comment-save" class="od-btn od-btn-primary">Add</button>
    </div>
  `;
    panel.querySelectorAll<HTMLButtonElement>('[data-od-verb]').forEach((button) => {
      button.addEventListener('click', () => {
        const verb = button.dataset.odVerb as SteeringVerb;
        const comment = commentFromSnapshot(target, verbCommentNote(verb), options.host, undefined, verb);
        comments.push(comment);
        changed([comment]);
        options.closePanel();
        options.onAdded?.(comment, target);
        options.sendVerb?.(comment);
      });
    });
    const textarea = document.getElementById('od-comment-text') as HTMLTextAreaElement;
    textarea.focus();
    const save = (): void => {
      const text = textarea.value.trim();
      if (!text) return;
      const comment = commentFromSnapshot(target, text, options.host);
      comments.push(comment);
      changed([comment]);
      // Close first: a crop must not show the panel or the selection highlight.
      options.closePanel();
      options.onAdded?.(comment, target);
    };
    document.getElementById('od-comment-close')!.addEventListener('click', options.closePanel);
    document.getElementById('od-comment-cancel')!.addEventListener('click', options.closePanel);
    document.getElementById('od-comment-save')!.addEventListener('click', save);
    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) save();
      if (event.key === 'Escape') options.closePanel();
    });
  };

  const openDetails = (comment: ArtifactComment): void => {
    panel.hidden = false;
    const status = comment.status === 'sent' ? 'Sent to the agent' : 'Open';
    panel.innerHTML = `
    <div class="od-panel-header">
      <span class="od-panel-header-title">Comment · ${escapeHtml(status)}</span>
      <button id="od-pin-close" class="od-panel-close" aria-label="Close">×</button>
    </div>
    <div class="od-panel-body">
      <p class="od-comment-note">${escapeHtml(comment.note)}</p>
      <code class="od-comment-target">${escapeHtml(comment.selector)}</code>
    </div>
    <div class="od-panel-footer">
      <button id="od-pin-delete" class="od-btn od-btn-danger">Delete</button>
      <span class="od-spacer"></span>
      <button id="od-pin-resolve" class="od-btn">Resolve</button>
    </div>`;
    document.getElementById('od-pin-close')!.addEventListener('click', options.closePanel);
    document.getElementById('od-pin-delete')!.addEventListener('click', () => {
      comments = comments.filter((c) => c.id !== comment.id);
      changed([], [comment.id]);
      options.closePanel();
    });
    document.getElementById('od-pin-resolve')!.addEventListener('click', () => {
      controller.patch(comment.id, { status: 'resolved' });
      options.closePanel();
    });
  };

  const controller: CommentController = {
    setComments(list) {
      comments = Array.isArray(list) ? [...list] : [];
      options.onListChanged();
    },
    all: () => comments,
    open: () => comments.filter((c) => c.status === 'open'),
    openInput,
    forBridge: () => comments.map((c) => ({ id: c.id, elementId: c.elementId, selector: c.selector, status: c.status, text: c.text, htmlHint: c.htmlHint })),
    pins(pinRects) {
      const out: HTMLElement[] = [];
      for (const comment of comments) {
        if (comment.status === 'resolved') continue;
        const anchor = pinRects.find((p) => p.commentId === comment.id)?.rect;
        const host = anchor ? hostRectOf(iframe, anchor) : null;
        const pin = document.createElement('div');
        pin.className = `od-pin ${host ? 'anchored' : 'lost'}${comment.status === 'sent' ? ' sent' : ''}`;
        pin.title = comment.note;
        pin.style.left = host ? `${host.left + host.width / 2}px` : '8px';
        pin.style.top = host ? `${host.top}px` : '8px';
        if (options.pinDetails) {
          pin.style.pointerEvents = 'auto';
          pin.addEventListener('click', (event) => {
            event.stopPropagation();
            openDetails(comment);
          });
        }
        out.push(pin);
      }
      return out;
    },
    markOpenSent() {
      const now = new Date().toISOString();
      const sent: ArtifactComment[] = [];
      comments = comments.map((c) => {
        if (c.status !== 'open') return c;
        const next = { ...c, status: 'sent' as const, updatedAt: now };
        sent.push(next);
        return next;
      });
      if (sent.length) changed(sent);
      return sent;
    },
    patch(id, change) {
      const now = new Date().toISOString();
      let updated: ArtifactComment | undefined;
      comments = comments.map((c) => (c.id === id ? (updated = { ...c, ...change, updatedAt: now }) : c));
      if (updated) changed([updated]);
    },
    upsertLocal(comment) {
      const i = comments.findIndex((c) => c.id === comment.id);
      if (i === -1) comments.push(comment);
      else comments[i] = comment;
      options.onListChanged();
    },
  };
  return controller;
}
