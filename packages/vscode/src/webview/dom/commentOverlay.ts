// Pin rendering + anchor lookup for the Comment mode overlay. Anchor
// resolution here is a deliberately simplified version of open-design's
// apps/web/src/comments.ts drift ladder (exact elementId match, else a CSS
// selector match, else "lost") rather than upstream's fuzzy htmlHint/text
// similarity matching — see openspec design notes.
import { findElementByDataOdId, findElementBySelector } from './elementTargeting';

// Mirrors @feimacode/open-design-agent-kit-core's workspace/artifactComments.ts
// ArtifactComment shape. Duplicated (not imported) because that module
// pulls in node:fs, which can't go into this browser-target bundle.
export interface ArtifactComment {
  id: string;
  elementId?: string;
  selector: string;
  htmlHint: string;
  note: string;
  status: 'open' | 'sent' | 'resolved';
  createdAt: string;
  updatedAt: string;
}

export interface PinPosition {
  x: number;
  y: number;
  anchored: boolean;
}

export function resolveCommentAnchor(doc: Document, comment: ArtifactComment): Element | null {
  if (comment.elementId) {
    const byId = findElementByDataOdId(doc, comment.elementId);
    if (byId) return byId;
  }
  if (comment.selector) {
    const bySelector = findElementBySelector(doc, comment.selector);
    if (bySelector) return bySelector;
  }
  return null;
}

export function computePinPosition(iframe: HTMLIFrameElement, doc: Document, comment: ArtifactComment): PinPosition | null {
  const el = resolveCommentAnchor(doc, comment);
  if (!el) return null;
  const iframeRect = iframe.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return {
    x: iframeRect.left + elRect.left + elRect.width / 2,
    y: iframeRect.top + elRect.top,
    anchored: true,
  };
}
