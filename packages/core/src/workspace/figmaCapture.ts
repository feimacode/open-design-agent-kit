// The ".od-figma.json" capture format, types mirrored from open-design's own
// canonical contract (/home/iven/tools/open-design/figma-plugin/IR.md) — the
// JSON node-tree its "OD Figma Import" Figma plugin rebuilds into real,
// editable layers. This module only carries the *document shape* plus the
// host-agnostic "resolve local image references to inline data URIs" step;
// the actual DOM walk that PRODUCES a capture from a live-rendered artifact
// happens in the VS Code webview (browser context, not this package — core
// stays fs-only/DOM-free), which then posts the raw capture (image fills
// still carrying a `url` placeholder) to the extension host for this
// resolution + write step.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export type {
  FigmaCaptureSource,
  FigmaCaptureFont,
  FigmaCaptureSolidPaint,
  FigmaCaptureImagePaint,
  FigmaCapturePaint,
  FigmaCaptureEffect,
  FigmaCaptureCornerRadii,
  FigmaCaptureFrameNode,
  FigmaCaptureRectangleNode,
  FigmaCaptureTextNode,
  FigmaCaptureNode,
  FigmaCaptureDocument,
} from '../figma/captureTypes';
import type { FigmaCaptureDocument, FigmaCaptureFrameNode, FigmaCaptureNode, FigmaCapturePaint, FigmaCaptureRectangleNode } from '../figma/captureTypes';

export interface FigmaCaptureAssetReader {
  /** Resolves a captured image reference (a relative workspace path or a data/http URL already present) to inline bytes. Returns undefined if unresolvable. */
  read(reference: string): Promise<{ base64: string; mimeType: string } | undefined>;
}

async function resolvePaints(paints: FigmaCapturePaint[] | undefined, reader: FigmaCaptureAssetReader): Promise<FigmaCapturePaint[] | undefined> {
  if (!paints) return paints;
  const resolved: FigmaCapturePaint[] = [];
  for (const paint of paints) {
    if (paint.type === 'IMAGE' && !paint.dataUri && paint.url) {
      const asset = await reader.read(paint.url);
      if (asset) {
        resolved.push({ type: 'IMAGE', scaleMode: paint.scaleMode, dataUri: `data:${asset.mimeType};base64,${asset.base64}` });
      }
      // else: drop this fill — matches the plugin's own documented posture
      // ("a fill whose bytes can't be decoded is dropped rather than
      // aborting the import"), applied here on the read side instead.
    } else {
      resolved.push(paint);
    }
  }
  return resolved;
}

async function resolveNode(node: FigmaCaptureNode, reader: FigmaCaptureAssetReader): Promise<FigmaCaptureNode> {
  if (node.type === 'TEXT') return node;
  const fills = await resolvePaints(node.fills, reader);
  const strokes = await resolvePaints(node.strokes, reader);
  const base = { ...node, fills, strokes };
  if (node.type === 'FRAME') {
    const children = node.children ? await Promise.all(node.children.map((c) => resolveNode(c, reader))) : undefined;
    return { ...base, children } as FigmaCaptureFrameNode;
  }
  return base as FigmaCaptureRectangleNode;
}

/** Rewrites every IMAGE fill's `url` placeholder to an inline `dataUri`, dropping any that can't be resolved. */
export async function resolveFigmaCaptureAssets(capture: FigmaCaptureDocument, reader: FigmaCaptureAssetReader): Promise<FigmaCaptureDocument> {
  const root = (await resolveNode(capture.root, reader)) as FigmaCaptureFrameNode;
  return { ...capture, root };
}

export function figmaCaptureSidecarPath(entryPath: string): string {
  return `${entryPath}.od-figma.json`;
}

// See the identical comment in vendored/artifactCreate.ts: an absolute
// entryPath must be used as-is, not re-joined onto workspaceRoot, or it
// silently resolves to a bogus nested path instead of the real file.
function assertWorkspaceRelative(workspaceRoot: string, entryPath: string): string {
  const abs = path.isAbsolute(entryPath) ? entryPath : path.join(workspaceRoot, entryPath);
  const rel = path.relative(workspaceRoot, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`entryPath escapes the workspace: ${entryPath}`);
  }
  return abs;
}

/** Writes the capture sidecar (`<entryPath>.od-figma.json`) and returns its absolute path. */
export async function writeFigmaCapture(workspaceRoot: string, entryPath: string, capture: FigmaCaptureDocument): Promise<string> {
  const absSidecar = assertWorkspaceRelative(workspaceRoot, figmaCaptureSidecarPath(entryPath));
  await fs.mkdir(path.dirname(absSidecar), { recursive: true });
  await fs.writeFile(absSidecar, JSON.stringify(capture, null, 2) + '\n', 'utf8');
  return absSidecar;
}
