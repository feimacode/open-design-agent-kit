// Resolves `prepare_open_design_brief`'s `sources` argument into the source
// context composeInstructions() renders, for every host. Extracts each source
// (cached by hash) and fails on the first unreadable one, naming it.

import * as path from 'node:path';
import type { SkillMode } from '../content/contentIndex';
import { readSource } from '../workspace/sourceStore';
import { isDeckSkill, type SourceContext } from './sourceInstructions';

export const MAX_BRIEF_SOURCES = 10;

export async function resolveBriefSources(options: {
  workspaceRoot: string | undefined;
  outputDir: string;
  sourcePaths: string[] | undefined;
  skillId: string;
  skillMode: SkillMode;
  suggestedEntryPath: string;
}): Promise<{ ok: true; context?: SourceContext } | { ok: false; error: string }> {
  const paths = (options.sourcePaths ?? []).map((p) => p.trim()).filter(Boolean);
  if (paths.length === 0) return { ok: true };
  if (!options.workspaceRoot) return { ok: false, error: 'No workspace folder is open. Open a folder before generating from source documents.' };
  if (paths.length > MAX_BRIEF_SOURCES) return { ok: false, error: `At most ${MAX_BRIEF_SOURCES} sources can be used at once (${paths.length} given).` };

  const sources = [];
  for (const p of paths) {
    const result = await readSource(options.workspaceRoot, options.outputDir, p);
    if (!result.ok) return { ok: false, error: `Couldn't read source "${p}": ${result.error}` };
    sources.push(result.record);
  }
  return {
    ok: true,
    context: {
      sources,
      isDeck: isDeckSkill(options.skillId, options.skillMode),
      outlinePath: path.posix.join(path.posix.dirname(options.suggestedEntryPath), 'outline.md'),
    },
  };
}
