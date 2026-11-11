// A folder the server keeps for a Claude Desktop chat with no folder, and the
// one tool that writes design files on the agent's behalf there
// (openspec add-folderless-chat-support). Everywhere else the agent writes
// with its own tools; here its only files are in a cloud sandbox this server
// can't see, so the server performs the write. It writes the agent's bytes
// unchanged, only under the output directory, only design file types, and
// never a file another tool owns.
import { createHash } from 'node:crypto';
import { promises as fs, statSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getDefaultWorkspace, settingFromEnv } from './env';

/**
 * Where managed folders live: OPEN_DESIGN_MANAGED_ROOT, else the desktop
 * extension's default design folder (OPEN_DESIGN_DEFAULT_WORKSPACE), else
 * "Open Design" in the user's Documents folder (where Finder and File Explorer
 * show it), else ~/Open Design when there is no Documents folder.
 */
export function getManagedRoot(env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string {
  const explicit = settingFromEnv(env.OPEN_DESIGN_MANAGED_ROOT);
  if (explicit && path.isAbsolute(explicit)) return path.resolve(explicit);
  const configured = getDefaultWorkspace(env);
  if (configured) return configured;
  const documents = path.join(home, 'Documents');
  try {
    if (statSync(documents).isDirectory()) return path.join(documents, 'Open Design');
  } catch {
    // no Documents folder
  }
  return LEGACY_MANAGED_ROOT(home);
}

/** The managed root before openspec desktop-visible-design-folder: one workspace per design under ~/Open Design. */
const LEGACY_MANAGED_ROOT = (home: string): string => path.join(home, 'Open Design');

/** The folder name for a design name: lower-case words joined by hyphens. */
export function managedFolderName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim()) throw new Error('name is required: a short name for the design or project, e.g. "Coffee poster"');
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  if (!slug) throw new Error(`"${name}" has no letters or digits to name a folder with; pass a name such as "Coffee poster"`);
  return slug;
}

/** Whether `dir` holds a registered artifact (a *.artifact.json), looking a few levels down. */
export async function holdsRegisteredArtifact(dir: string, depth = 4): Promise<boolean> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.artifact.json')) return true;
  }
  if (depth <= 0) return false;
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== 'node_modules' && (await holdsRegisteredArtifact(path.join(dir, entry.name), depth - 1))) return true;
  }
  return false;
}

export interface ManagedWorkspace {
  /** The workspace root: the managed root, or a legacy per-design folder. */
  root: string;
  /** The design's own folder, absolute. */
  designFolder: string;
  /** The design folder's name, which the first design's files should use. */
  slug: string;
  created: boolean;
  /** A per-design folder from an earlier release, reopened as its own workspace in the classic layout. */
  legacy: boolean;
}

/**
 * Opens the design folder for `name` (openspec desktop-visible-design-folder):
 * the managed root is the workspace and each design gets `<root>/<slug>/`.
 * A folder made by an earlier release, whose `.open-design/` already holds
 * designs, is reopened where it is as its own workspace, including one under
 * the old default root ~/Open Design.
 */
export async function openManagedWorkspace(name: unknown, managedRoot: string = getManagedRoot(), legacyRoots: string[] = defaultLegacyRoots(managedRoot)): Promise<ManagedWorkspace> {
  const slug = managedFolderName(name);
  for (const base of [managedRoot, ...legacyRoots]) {
    const candidate = path.join(base, slug);
    if (await holdsRegisteredArtifact(path.join(candidate, '.open-design'))) return { root: candidate, designFolder: candidate, slug, created: false, legacy: true };
  }
  const designFolder = path.join(managedRoot, slug);
  let created = false;
  try {
    const stat = await fs.stat(designFolder);
    if (!stat.isDirectory()) throw new Error(`${designFolder} exists and is not a folder; pass another name`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    await fs.mkdir(designFolder, { recursive: true });
    created = true;
  }
  return { root: managedRoot, designFolder, slug, created, legacy: false };
}

function defaultLegacyRoots(managedRoot: string): string[] {
  const legacy = LEGACY_MANAGED_ROOT(os.homedir());
  return path.resolve(legacy) === path.resolve(managedRoot) ? [] : [legacy];
}

export const TEXT_EXTENSIONS = ['.html', '.htm', '.css', '.js', '.mjs', '.json', '.svg', '.md', '.txt', '.csv'];
export const BINARY_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.woff', '.woff2'];
export const MAX_WRITE_BYTES = 5 * 1024 * 1024;

export interface WriteManagedFileInput {
  workspaceRoot: string;
  outputDir: string;
  path: unknown;
  content: unknown;
  encoding?: unknown;
}

export interface WrittenFile {
  /** Workspace-relative, with forward slashes. */
  path: string;
  absolutePath: string;
  bytes: number;
  sha256: string;
}

/** Why a file belongs to another tool, or undefined when the agent may write it. */
function serverOwned(relativeToOutput: string): string | undefined {
  const segments = relativeToOutput.split('/');
  const base = segments[segments.length - 1];
  if (base.endsWith('.artifact.json')) return 'it is an artifact manifest; register_open_design_artifact writes it';
  if (base.endsWith('.comments.json')) return 'it holds the user\'s comments; the preview writes it';
  if (base === 'config.json') return 'it is Open Design\'s settings file; set_active_design_system writes it';
  if (segments.includes('exports')) return 'it is in an exports/ folder; export_open_design_artifact writes those';
  if (segments.includes('.checks')) return 'it is a check screenshot; check_open_design_artifact writes those';
  if (segments[0] === 'portfolio') return 'it is in the work library; save_open_design_project, save_open_design_portfolio_target and import_open_design_work write it';
  return undefined;
}

/** The nearest existing ancestor of `p` (or `p` itself), resolved through symlinks. */
async function realpathOfExisting(p: string): Promise<{ real: string; rest: string[] }> {
  const rest: string[] = [];
  let current = p;
  for (;;) {
    try {
      return { real: await fs.realpath(current), rest };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      const parent = path.dirname(current);
      if (parent === current) throw err;
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * write_open_design_file: checks the path, type and size, then writes the
 * content exactly as given. Throws a message the agent can act on, having
 * written nothing.
 */
export async function writeManagedFile(input: WriteManagedFileInput): Promise<WrittenFile> {
  if (typeof input.path !== 'string' || !input.path.trim()) throw new Error('path is required: a workspace-relative path under ' + `${input.outputDir}/, e.g. "${input.outputDir}/coffee-poster/coffee-poster.html"`);
  if (typeof input.content !== 'string') throw new Error('content is required: the whole file, as text (or base64 with encoding "base64")');
  if (input.encoding !== undefined && input.encoding !== 'base64' && input.encoding !== 'utf8') throw new Error('encoding must be "base64" (for images and fonts) or left out');
  const requested = input.path.trim().replace(/\\/g, '/');
  if (path.posix.isAbsolute(requested) || path.win32.isAbsolute(requested)) throw new Error(`"${requested}" is absolute; pass a path relative to the workspace, under ${input.outputDir}/`);

  const outputRoot = path.resolve(input.workspaceRoot, input.outputDir);
  const target = path.resolve(input.workspaceRoot, requested);
  if (!isInside(target, outputRoot)) throw new Error(`"${requested}" is outside ${input.outputDir}/; design files go under ${input.outputDir}/<design>/`);
  const relativeToOutput = path.relative(outputRoot, target).split(path.sep).join('/');

  const owned = serverOwned(relativeToOutput);
  if (owned) throw new Error(`"${requested}" can't be written with this tool: ${owned}.`);

  const ext = path.extname(target).toLowerCase();
  const binary = BINARY_EXTENSIONS.includes(ext);
  if (!binary && !TEXT_EXTENSIONS.includes(ext)) {
    throw new Error(`"${ext || path.basename(target)}" isn't a design file type. Allowed: ${[...TEXT_EXTENSIONS, ...BINARY_EXTENSIONS].join(' ')}`);
  }
  if (binary && input.encoding !== 'base64') throw new Error(`${ext} is a binary type: send its bytes as base64 with encoding "base64"`);

  let data: Buffer;
  if (input.encoding === 'base64') {
    const compact = input.content.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 === 1) throw new Error('content is not valid base64');
    data = Buffer.from(compact, 'base64');
  } else {
    data = Buffer.from(input.content, 'utf8');
  }
  if (data.length > MAX_WRITE_BYTES) {
    throw new Error(`the file is ${(data.length / 1024 / 1024).toFixed(1)} MiB; the limit is 5 MiB per file. Split it into smaller files (move large images or data into their own files).`);
  }

  // A symlink anywhere on the way must not lead out of the output directory.
  await fs.mkdir(outputRoot, { recursive: true });
  const realOutput = await fs.realpath(outputRoot);
  const { real, rest } = await realpathOfExisting(target);
  const resolvedTarget = path.join(real, ...rest);
  if (!isInside(resolvedTarget, realOutput)) throw new Error(`"${requested}" leads outside ${input.outputDir}/ through a link; nothing was written`);

  await fs.mkdir(path.dirname(resolvedTarget), { recursive: true });
  await fs.writeFile(resolvedTarget, data);
  return {
    path: path.relative(input.workspaceRoot, target).split(path.sep).join('/'),
    absolutePath: target,
    bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}
