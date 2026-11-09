// Steering verbs (openspec add-steering-edits). Kept free of node: imports so
// the preview shells can show the verb buttons and build the chat message.
import type { ArtifactComment } from '../workspace/artifactCommentTypes';

export const STEERING_VERBS = ['bolder', 'quieter', 'denser', 'roomier', 'distill', 'polish', 'harden'] as const;
export type SteeringVerb = (typeof STEERING_VERBS)[number];

/** Verbs that may take the whole page as their scope; a page-wide "bolder" is a new direction, not an edit. */
export const PAGE_SCOPE_VERBS: readonly SteeringVerb[] = ['polish', 'harden'];

export const STEERING_VERB_LABELS: Record<SteeringVerb, string> = {
  bolder: 'Bolder',
  quieter: 'Quieter',
  denser: 'Denser',
  roomier: 'Roomier',
  distill: 'Distill',
  polish: 'Polish',
  harden: 'Harden',
};

/** One line per verb, for tool descriptions and tooltips. */
export const STEERING_VERB_HINTS: Record<SteeringVerb, string> = {
  bolder: 'more confident: one element leads, stronger size contrast and main action',
  quieter: 'calmer: fewer accents, softer colour, less decoration',
  denser: 'fits more: tighter spacing and rows, same items',
  roomier: 'more space: larger gaps and padding, fewer items per row',
  distill: 'removes what doesn’t serve the purpose: filler, badges, ornaments',
  polish: 'finished: alignment, spacing on the scale, consistent styles and states',
  harden: 'holds up: long and missing content, empty, loading and error states',
};

export function isSteeringVerb(value: unknown): value is SteeringVerb {
  return typeof value === 'string' && (STEERING_VERBS as readonly string[]).includes(value);
}

/** The note a verb button saves on its comment. */
export function verbCommentNote(verb: SteeringVerb): string {
  return verb === 'polish' || verb === 'harden' || verb === 'distill' ? `${STEERING_VERB_LABELS[verb]} this` : `Make this ${verb}`;
}

/** The chat message a verb comment sends: a scoped edit through prepare_open_design_edit, with the comment as its scope. */
export function steerCommentMessage(entryPath: string, comment: Pick<ArtifactComment, 'id' | 'verb' | 'note' | 'text'>): string {
  const verb = comment.verb ?? 'polish';
  const where = comment.text ? ` (the part that reads "${comment.text.slice(0, 60)}")` : '';
  return `${comment.note} on the Open Design artifact "${entryPath}"${where}: call prepare_open_design_edit with verb "${verb}" and scope { "commentId": "${comment.id}" }, follow its instructions, then check it with the editId and pass "${comment.id}" in resolvedCommentIds when you re-register it.`;
}
