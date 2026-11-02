// The app screen templates share one seed shell (openspec add-app-screens):
// every local skill whose SKILL.md carries an od:app-shell block must carry
// the same one as app-shell's, so a fix to the shell reaches every pattern.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const START = '<!-- od:app-shell:start -->';
const END = '<!-- od:app-shell:end -->';
export const CANONICAL_SHELL_SKILL = 'app-shell';

/** The text between the shell markers, or undefined when the file has none. */
export function extractShellBlock(text) {
  const start = text.indexOf(START);
  if (start < 0) return undefined;
  const end = text.indexOf(END, start);
  if (end < 0) return undefined;
  return text.slice(start + START.length, end).trim();
}

/** Problems with the shared shell, as human-readable strings (empty when fine). */
export async function checkAppShellBlocks(localRoot) {
  const skillsDir = path.join(localRoot, 'skills');
  let ids;
  try {
    ids = (await fs.readdir(skillsDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  const blocks = new Map();
  for (const id of ids) {
    let text;
    try {
      text = await fs.readFile(path.join(skillsDir, id, 'SKILL.md'), 'utf8');
    } catch {
      continue;
    }
    const block = extractShellBlock(text);
    if (block !== undefined) blocks.set(id, block);
    else if (text.includes(START)) blocks.set(id, null);
  }
  if (blocks.size === 0) return [];
  const canonical = blocks.get(CANONICAL_SHELL_SKILL);
  if (!canonical) return [`${CANONICAL_SHELL_SKILL}: has no complete od:app-shell block, so the other app screen templates have nothing to match`];
  const problems = [];
  for (const [id, block] of blocks) {
    if (id === CANONICAL_SHELL_SKILL) continue;
    if (block === null) problems.push(`${id}: od:app-shell block has no end marker`);
    else if (block !== canonical) problems.push(`${id}: its od:app-shell block differs from ${CANONICAL_SHELL_SKILL}'s; copy the shell from skills/${CANONICAL_SHELL_SKILL}/SKILL.md`);
  }
  return problems;
}
