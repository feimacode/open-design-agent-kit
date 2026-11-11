// The comment record stored in `<entry>.comments.json`. Kept free of node:
// imports so the browser-target preview modules (src/preview) can share it
// with the fs side (artifactComments.ts).
import type { SteeringVerb } from '../generation/steeringVerbs';

export type ArtifactCommentStatus = 'open' | 'sent' | 'resolved';

export interface ArtifactCommentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArtifactComment {
  id: string;
  /** The element's `data-od-id`, only when that attribute exists in the source. */
  elementId?: string;
  selector: string;
  htmlHint: string;
  note: string;
  status: ArtifactCommentStatus;
  createdAt: string;
  updatedAt: string;
  /** The element's whitespace-collapsed text, at most 120 characters. */
  text?: string;
  /** The element's box in document coordinates (scroll included), CSS px. */
  rect?: ArtifactCommentRect;
  /** The preview viewport when the comment was made. */
  viewport?: { width: number; height: number };
  /** The crop's path relative to the entry's folder, e.g. "index.html.comments/c-ab12.png". */
  screenshot?: string;
  /** True when the crop was re-rendered headless rather than taken from the window the user saw. */
  screenshotRerendered?: boolean;
  host?: 'vscode' | 'browser' | 'mcp-app';
  /** Set by a preview verb button: the comment asks for a steering edit with this verb (openspec add-steering-edits). */
  verb?: SteeringVerb;
  /** Imported from outside the kit (import_open_design_comments): a Claude artifact thread or pasted community feedback. */
  source?: 'claude-artifact' | 'community';
  /** The id it has where it came from; imports merge by it. */
  externalId?: string;
  author?: string;
  threadUrl?: string;
}

/** Unaddressed comments: not yet resolved by the agent. */
export function isUnaddressed(comment: Pick<ArtifactComment, 'status'>): boolean {
  return comment.status === 'open' || comment.status === 'sent';
}

/**
 * `incoming` merged into `current` by id: for a comment present in both, the
 * one with the later `updatedAt` wins, field by field, so a writer that never
 * saw a field (a crop added by another preview) doesn't drop it. Comments
 * listed in `deletedIds` are dropped. Order: current's order, then new
 * comments in incoming's order.
 */
export function mergeComments(current: ArtifactComment[], incoming: ArtifactComment[], deletedIds: readonly string[] = []): ArtifactComment[] {
  const deleted = new Set(deletedIds);
  const byId = new Map(current.map((c) => [c.id, c]));
  for (const c of incoming) {
    const existing = byId.get(c.id);
    if (!existing) byId.set(c.id, c);
    else if (c.updatedAt >= existing.updatedAt) byId.set(c.id, { ...existing, ...c });
  }
  return [...byId.values()].filter((c) => !deleted.has(c.id));
}

/** The text excerpt stored on a comment: whitespace collapsed, at most 120 characters. */
export function commentTextExcerpt(text: string | null | undefined): string {
  const collapsed = (text ?? '').replace(/\s+/g, ' ').trim();
  return collapsed.length > 120 ? `${collapsed.slice(0, 119)}…` : collapsed;
}
