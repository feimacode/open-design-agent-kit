import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { parse } from 'smol-toml';
import { writeSkillTree } from './skillWriter';

/** Writes the bundled Codex skill content into `<targetPath>/.agents/skills/`. */
export async function writeCodexSkills(targetPath: string, assetRoot: string): Promise<{ writtenCount: number }> {
  return writeSkillTree(path.join(targetPath, '.agents', 'skills'), assetRoot);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export const CODEX_CONFIG_SNIPPET = `[mcp_servers.open-design]
command = "npx"
args = ["-y", "@feimacode/open-design-agent-kit-mcp"]
`;

export type CodexConfigOutcome =
  | { outcome: 'created' }
  | { outcome: 'already-registered'; configPath: string }
  | { outcome: 'needs-manual-edit'; configPath: string };

/**
 * Writes `<targetPath>/.codex/config.toml` with the open-design MCP server
 * registration ONLY when that file doesn't already exist. When it does,
 * this NEVER parses-and-rewrites it — every JS TOML library re-serializes
 * from a plain data structure on write, with no guarantee of preserving the
 * user's original comments/formatting, and this file may be hand-curated.
 * It's parsed read-only, purely to report whether open-design is already
 * registered there or still needs to be added by hand.
 */
export async function ensureCodexMcpConfig(targetPath: string): Promise<CodexConfigOutcome> {
  const configPath = path.join(targetPath, '.codex', 'config.toml');

  if (!(await pathExists(configPath))) {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, CODEX_CONFIG_SNIPPET, 'utf8');
    return { outcome: 'created' };
  }

  const raw = await fs.readFile(configPath, 'utf8');
  try {
    const parsed = parse(raw) as { mcp_servers?: Record<string, unknown> };
    if (parsed.mcp_servers && Object.prototype.hasOwnProperty.call(parsed.mcp_servers, 'open-design')) {
      return { outcome: 'already-registered', configPath };
    }
  } catch {
    // Malformed existing TOML: still never rewritten — fall through to
    // "needs-manual-edit" so the user gets the snippet either way.
  }
  return { outcome: 'needs-manual-edit', configPath };
}
