import { promises as fs } from 'node:fs';
import * as path from 'node:path';

// Same marker generate-claude-skills.mjs/generate-codex-skills.mjs stamp
// into every skill they generate — reused here so this CLI's own
// regeneration can tell "a directory we wrote last time" from "a skill the
// user added by hand" in the target project, without ever risking deleting
// the latter.
const GENERATED_MARKER = '<!-- generated:open-design-agent-kit -->';

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function isGeneratedSkillDir(dir: string): Promise<boolean> {
  const skillMd = path.join(dir, 'SKILL.md');
  if (!(await pathExists(skillMd))) return false;
  return (await fs.readFile(skillMd, 'utf8')).includes(GENERATED_MARKER);
}

/**
 * Writes a bundled skill-directory tree (each top-level entry a
 * `<id>/SKILL.md`, optionally with sibling files like `agents/openai.yaml`)
 * into `skillsDir`. Fully regenerates every run — the content is ours, not
 * the user's — but only ever removes a stale directory that carries our own
 * generated marker; a skill the user created by hand under the same
 * location is left untouched.
 */
export async function writeSkillTree(skillsDir: string, assetRoot: string): Promise<{ writtenCount: number }> {
  await fs.mkdir(skillsDir, { recursive: true });

  const existing = await fs.readdir(skillsDir, { withFileTypes: true }).catch(() => []);
  for (const entry of existing) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(skillsDir, entry.name);
    if (await isGeneratedSkillDir(dir)) await fs.rm(dir, { recursive: true, force: true });
  }

  const sourceDirs = await fs.readdir(assetRoot, { withFileTypes: true });
  let writtenCount = 0;
  for (const entry of sourceDirs) {
    if (!entry.isDirectory()) continue;
    await fs.cp(path.join(assetRoot, entry.name), path.join(skillsDir, entry.name), { recursive: true });
    writtenCount++;
  }

  return { writtenCount };
}
