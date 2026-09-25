// Runtime reader for the hand-written, host-agnostic prompts that
// packages/content's apply-local-overlay.mjs copies into
// `<assetsRoot>/prompts/` (e.g. open-design-social-post). Mirrors
// packages/content/scripts/localPrompts.mjs, which the build-time
// generators use (they have no TS build step to import this through).
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';

export const BRIEF_PLACEHOLDER = '{{brief}}';

export interface LocalPrompt {
  name: string;
  description: string;
  argumentHint?: string;
  placeholder: string;
  body: string;
}

/** Every well-formed prompt under `<assetsRoot>/prompts/`, sorted by file name. Malformed files are skipped. */
export async function loadLocalPrompts(assetsRoot: string): Promise<LocalPrompt[]> {
  const dir = path.join(assetsRoot, 'prompts');
  let names: string[];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.md')).sort();
  } catch {
    return [];
  }
  const prompts: LocalPrompt[] = [];
  for (const file of names) {
    const { data, content } = matter(await fs.readFile(path.join(dir, file), 'utf8'));
    if (typeof data.name !== 'string' || typeof data.description !== 'string' || !content.includes(BRIEF_PLACEHOLDER)) continue;
    prompts.push({
      name: data.name,
      description: data.description,
      argumentHint: typeof data.argument_hint === 'string' ? data.argument_hint : undefined,
      placeholder: typeof data.placeholder === 'string' ? data.placeholder : 'Describe what you want.',
      body: content.trim(),
    });
  }
  return prompts;
}

export function renderLocalPrompt(prompt: LocalPrompt, briefText: string): string {
  return prompt.body.split(BRIEF_PLACEHOLDER).join(briefText);
}
