/// <reference lib="dom" />
// Messages between a preview shell (the VS Code webview's main.ts, or the
// browser preview's shell/main.ts) and the preview bridge running inside the
// previewed page (bridge.ts; openspec add-preview-bridge, add-browser-preview). The page may be served from its own origin, so
// the preview never touches its DOM: everything Comment, Edit and Figma
// capture need goes through these messages. Every message carries
// `od: 'bridge'`.
import type { DeviceSpec } from './deviceShell';
import type { ArtifactComment } from '../workspace/artifactCommentTypes';
import type { ManualEditPatch } from './dom/sourcePatches';

export const BRIDGE_TAG = 'bridge';

export type BridgeMode = 'view' | 'comment' | 'edit';

/** A rect in the previewed page's viewport coordinates. */
export interface BridgeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The computed values the Edit panel shows (same names as CSSStyleDeclaration). */
export interface StyleSnapshot {
  color: string;
  backgroundColor: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  textAlign: string;
  borderTopLeftRadius: string;
  opacity: string;
  borderColor: string;
  borderTopWidth: string;
  borderTopStyle: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
}

/** Everything the preview needs about a clicked element, as plain data. */
export interface ElementSnapshot {
  /** The element's `data-od-id` in the live page (may be one the bridge invented, for Edit patches). */
  elementId: string;
  /** The `data-od-id` that came from the source, if any: what a comment stores. */
  sourceElementId?: string;
  /** The robust selector (dom/elementTargeting.ts selectorFor). */
  selector: string;
  /** Whitespace-collapsed text, at most 120 characters. */
  textExcerpt: string;
  /** The element's box in document coordinates (scroll included). */
  docRect: BridgeRect;
  /** The page's viewport size. */
  viewport: { width: number; height: number };
  htmlHint: string;
  tag: string;
  childCount: number;
  text: string;
  outerHTML: string;
  attrs: { src: string | null; alt: string | null; href: string | null };
  rect: BridgeRect;
  styles: StyleSnapshot;
}

/** Preview → page. */
export type ToBridge =
  | { od: typeof BRIDGE_TAG; type: 'hello' }
  | { od: typeof BRIDGE_TAG; type: 'set-mode'; mode: BridgeMode }
  | { od: typeof BRIDGE_TAG; type: 'clear-selection' }
  | { od: typeof BRIDGE_TAG; type: 'set-comments'; comments: Pick<ArtifactComment, 'id' | 'elementId' | 'selector' | 'status' | 'text' | 'htmlHint'>[] }
  | { od: typeof BRIDGE_TAG; type: 'apply-patches'; requestId: string; patches: ManualEditPatch[] }
  | { od: typeof BRIDGE_TAG; type: 'capture-figma'; requestId: string }
  | { od: typeof BRIDGE_TAG; type: 'scroll-to'; x: number; y: number };

/** Page → preview. */
export type FromBridge =
  | { od: typeof BRIDGE_TAG; type: 'ready'; title: string; device?: DeviceSpec }
  | { od: typeof BRIDGE_TAG; type: 'select'; element: ElementSnapshot }
  | { od: typeof BRIDGE_TAG; type: 'rects'; hover: BridgeRect | null; selection: BridgeRect | null; pins: { commentId: string; rect: BridgeRect | null }[] }
  | { od: typeof BRIDGE_TAG; type: 'patched'; requestId: string; ok: boolean; newSource?: string }
  | { od: typeof BRIDGE_TAG; type: 'figma-capture'; requestId: string; capture: unknown; truncated: boolean }
  | { od: typeof BRIDGE_TAG; type: 'open-local-link'; href: string }
  | { od: typeof BRIDGE_TAG; type: 'scroll'; x: number; y: number };

/** A message without its `od` tag, distributed over the union. */
export type Untagged<T> = T extends unknown ? Omit<T, 'od'> : never;

export function isBridgeMessage(data: unknown): data is { od: typeof BRIDGE_TAG; type: string } {
  return typeof data === 'object' && data !== null && (data as { od?: unknown }).od === BRIDGE_TAG && typeof (data as { type?: unknown }).type === 'string';
}
