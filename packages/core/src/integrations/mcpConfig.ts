// Reads which MCP servers are configured, for the "installed, not connected"
// status (openspec add-integrations-list). Lenient on purpose: files are JSONC
// (comments, trailing commas), may be missing or malformed, and come in two
// shapes — VS Code's `{ servers: {...} }` and the portable `{ mcpServers: {...} }`.
// A failure just means "nothing configured here".
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { ConfiguredServer } from './status';

/** Parses JSON with // and /* comments and trailing commas; undefined when it still isn't JSON. */
export function parseJsonc(text: string): unknown {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i++;
      } else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else out += ch;
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return undefined;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Servers declared in one parsed config object (either shape). */
export function serversFromConfig(config: unknown): ConfiguredServer[] {
  if (!isRecord(config)) return [];
  const map = isRecord(config.servers) ? config.servers : isRecord(config.mcpServers) ? config.mcpServers : undefined;
  if (!map) return [];
  return Object.entries(map).map(([name, def]) => ({
    name,
    url: isRecord(def) && typeof def.url === 'string' ? def.url : undefined,
  }));
}

/** Reads every existing file among `files` and returns the servers they declare. */
export async function readConfiguredMcpServers(files: readonly string[]): Promise<ConfiguredServer[]> {
  const out: ConfiguredServer[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }
    out.push(...serversFromConfig(parseJsonc(text)));
  }
  return out;
}

/**
 * VS Code's MCP config locations: the user `mcp.json` in the user data folder
 * (and each profile's), plus each workspace folder's `.vscode/mcp.json` and
 * root `.mcp.json`. `userDir` is the `User` folder.
 */
export async function vscodeMcpConfigFiles(userDir: string | undefined, workspaceFolders: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  if (userDir) {
    files.push(path.join(userDir, 'mcp.json'));
    try {
      for (const p of await fs.readdir(path.join(userDir, 'profiles'))) files.push(path.join(userDir, 'profiles', p, 'mcp.json'));
    } catch {
      // no profiles
    }
  }
  for (const folder of workspaceFolders) files.push(path.join(folder, '.vscode', 'mcp.json'), path.join(folder, '.mcp.json'));
  return files;
}
