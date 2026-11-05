// Wiring for the style vector (openspec add-nearest-design-system): the
// nearest bundled systems for an extraction's draft, and the tokens `like`
// names for the recommender (a design system id or an extraction bundle).

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { ContentIndex } from './contentIndex';
import type { ExtractSiteResult } from '../generation/siteExtraction';

/** The extraction result with `nearest` and `distinctive` added (or a note saying why not). */
export async function withNearestDesignSystems<T extends ExtractSiteResult>(result: T, index: ContentIndex): Promise<T> {
  if (result.status === 'invalid-args' || !result.draft || Object.keys(result.draft.tokens).length === 0) return result;
  const near = await index.nearestDesignSystems(result.draft.tokens);
  if (!near.nearest) return { ...result, notes: [...result.notes, near.note!] };
  return { ...result, nearest: near.nearest, distinctive: near.distinctive };
}

/** The tokens `like` points at: a design system id, or an extraction's bundleDir under <outputDir>/.extract/. */
export async function resolveLike(index: ContentIndex, workspaceRoot: string, outputDir: string, like: string): Promise<{ ok: true; tokens: Map<string, string> | Record<string, string>; id?: string } | { ok: false; error: string }> {
  const value = like.trim();
  const tokens = await index.designSystemTokens(value);
  if (tokens) return { ok: true, tokens, id: value };
  const extractRoot = path.posix.join(outputDir.split(path.sep).join('/'), '.extract') + '/';
  const rel = path.posix.normalize(value.replace(/\\/g, '/')).replace(/\/$/, '');
  if (!(rel + '/').startsWith(extractRoot) || rel.includes('..')) return { ok: false, error: `"like" must be a design system id or an extraction's bundleDir under ${extractRoot} (got "${value}").` };
  try {
    const ev = JSON.parse(await fs.readFile(path.join(workspaceRoot, rel, 'evidence.json'), 'utf8')) as { draft?: { tokens?: Record<string, string> } };
    if (!ev.draft?.tokens || Object.keys(ev.draft.tokens).length === 0) return { ok: false, error: `${rel} has no drafted tokens to compare.` };
    return { ok: true, tokens: ev.draft.tokens };
  } catch {
    return { ok: false, error: `No evidence.json in ${rel}. Pass the bundleDir that extract_open_design_design_system returned.` };
  }
}
