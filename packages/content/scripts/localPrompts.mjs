// Host-agnostic hand-written prompts from local/prompts/ (copied into
// assets/open-design/prompts/ by apply-local-overlay.mjs). One source file per
// prompt; each host renders it with its own way of passing the user's brief,
// substituted for the `{{brief}}` placeholder. Used by every host's generator
// (and at runtime by the MCP server), so the prompt text lives in one place.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export const BRIEF_PLACEHOLDER = '{{brief}}';

/** Every prompt under `<assetsRoot>/prompts/`, sorted by name. */
export async function loadLocalPrompts(assetsRoot) {
  const dir = path.join(assetsRoot, 'prompts');
  let names;
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.md'));
  } catch {
    return [];
  }
  const prompts = [];
  for (const file of names.sort()) {
    const { data, content } = matter(await fs.readFile(path.join(dir, file), 'utf8'));
    if (typeof data.name !== 'string' || typeof data.description !== 'string') {
      throw new Error(`prompts/${file} needs string "name" and "description" frontmatter.`);
    }
    if (!content.includes(BRIEF_PLACEHOLDER)) throw new Error(`prompts/${file} must contain ${BRIEF_PLACEHOLDER}.`);
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

export function renderPromptBody(prompt, briefText) {
  return prompt.body.split(BRIEF_PLACEHOLDER).join(briefText);
}
