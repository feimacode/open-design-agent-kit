// Hosted projects (openspec add-mcp-gateway, add-gateway-sign-in): a folder
// per project, named by an unguessable handle, holding everything the kit
// keeps for a design. No database: the file tree is the store.
//
// <data>/anon/<handle>/            anonymous projects (no sign-in)
// <data>/users/<user key>/<handle>/ a signed-in user's projects
//   project.json   title, times, the open design folder, files ref, view ids
//   usage.json     exports made
//   files/         the workspace the kit's tools work in
//   jobs/<id>.json export jobs
// <data>/refs/<files ref>.json      download-link ref -> project folder
// <data>/views/<view id>/           read-only viewer copies (viewer.ts)
import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { MinuteRateLimiter, type RemoteLimits } from '@feimacode/open-design-agent-kit-mcp/src/remote';

export const PROJECT_HANDLE = /^odp_[0-9a-f]{32}$/;
const USER_KEY = /^[0-9a-f]{32}$/;

export interface ProjectMeta {
  id: string;
  title?: string;
  createdAt: string;
  lastUsedAt: string;
  /** The signed-in owner's user key; absent for anonymous projects. */
  owner?: string;
  designSlug?: string;
  filesRef: string;
  views: string[];
}

export interface ProjectRef {
  dir: string;
  meta: ProjectMeta;
}

export interface GatewayUser {
  /** The token's subject. */
  sub: string;
  /** A filesystem-safe key for the user: a hash of issuer and subject. */
  key: string;
}

export function userKey(issuer: string, sub: string): string {
  return createHash('sha256').update(`${issuer}\n${sub}`).digest('hex').slice(0, 32);
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString('hex')}`;
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, file);
}

export class ProjectStore {
  private readonly limiters = new Map<string, MinuteRateLimiter>();
  private readonly newProjectsByIp = new Map<string, number[]>();

  constructor(
    readonly dataDir: string,
    private readonly limits: RemoteLimits,
    private readonly now: () => number = Date.now,
  ) {}

  async init(): Promise<void> {
    for (const d of ['anon', 'users', 'refs', 'views']) await fs.mkdir(path.join(this.dataDir, d), { recursive: true });
  }

  /** The folder the kit's tools work in. */
  filesRoot(ref: ProjectRef): string {
    return path.join(ref.dir, 'files');
  }

  /** True when this client IP may start another anonymous project this hour; records the start. */
  allowNewProject(ip: string): boolean {
    const hourAgo = this.now() - 60 * 60 * 1000;
    const recent = (this.newProjectsByIp.get(ip) ?? []).filter((t) => t > hourAgo);
    if (recent.length >= this.limits.projectsPerHour) {
      this.newProjectsByIp.set(ip, recent);
      return false;
    }
    recent.push(this.now());
    this.newProjectsByIp.set(ip, recent);
    return true;
  }

  async create(input: { title?: string; user?: GatewayUser }): Promise<ProjectRef> {
    const id = newId('odp');
    const dir = input.user ? path.join(this.dataDir, 'users', input.user.key, id) : path.join(this.dataDir, 'anon', id);
    await fs.mkdir(path.join(dir, 'files'), { recursive: true });
    const at = new Date(this.now()).toISOString();
    const meta: ProjectMeta = {
      id,
      ...(input.title?.trim() ? { title: input.title.trim().slice(0, 120) } : {}),
      createdAt: at,
      lastUsedAt: at,
      ...(input.user ? { owner: input.user.key } : {}),
      filesRef: newId('odf'),
      views: [],
    };
    await writeJson(path.join(dir, 'project.json'), meta);
    await writeJson(path.join(this.dataDir, 'refs', `${meta.filesRef}.json`), { dir: path.relative(this.dataDir, dir) });
    return { dir, meta };
  }

  /** The project a handle names, for this caller: their own projects, or any anonymous one. */
  async find(handle: unknown, user?: GatewayUser): Promise<ProjectRef | undefined> {
    if (typeof handle !== 'string' || !PROJECT_HANDLE.test(handle)) return undefined;
    const candidates = [...(user ? [path.join(this.dataDir, 'users', user.key, handle)] : []), path.join(this.dataDir, 'anon', handle)];
    for (const dir of candidates) {
      const meta = await readJson<ProjectMeta>(path.join(dir, 'project.json'));
      if (meta && meta.id === handle) return { dir, meta };
    }
    return undefined;
  }

  async update(ref: ProjectRef, change: Partial<ProjectMeta>): Promise<void> {
    const current = (await readJson<ProjectMeta>(path.join(ref.dir, 'project.json'))) ?? ref.meta;
    ref.meta = { ...current, ...change };
    await writeJson(path.join(ref.dir, 'project.json'), ref.meta);
  }

  async touch(ref: ProjectRef): Promise<void> {
    await this.update(ref, { lastUsedAt: new Date(this.now()).toISOString() });
  }

  /** The project folder behind a download-link ref. */
  async dirForFilesRef(ref: string): Promise<string | undefined> {
    const entry = await readJson<{ dir: string }>(path.join(this.dataDir, 'refs', `${ref}.json`));
    if (!entry || typeof entry.dir !== 'string') return undefined;
    const dir = path.resolve(this.dataDir, entry.dir);
    if (!dir.startsWith(this.dataDir + path.sep)) return undefined;
    return dir;
  }

  takeCall(id: string): boolean {
    let limiter = this.limiters.get(id);
    if (!limiter) {
      limiter = new MinuteRateLimiter(this.limits.callsPerMinute, this.now);
      this.limiters.set(id, limiter);
    }
    return limiter.take();
  }

  /** Records one export; false when the project is already at its limit. */
  async countExport(ref: ProjectRef): Promise<boolean> {
    const file = path.join(ref.dir, 'usage.json');
    const usage = (await readJson<{ exports?: number }>(file)) ?? {};
    const made = usage.exports ?? 0;
    if (made >= this.limits.maxExports) return false;
    await writeJson(file, { ...usage, exports: made + 1 });
    return true;
  }

  async list(user: GatewayUser): Promise<ProjectMeta[]> {
    const base = path.join(this.dataDir, 'users', user.key);
    let names: string[];
    try {
      names = await fs.readdir(base);
    } catch {
      return [];
    }
    const out: ProjectMeta[] = [];
    for (const name of names) {
      if (!PROJECT_HANDLE.test(name)) continue;
      const meta = await readJson<ProjectMeta>(path.join(base, name, 'project.json'));
      if (meta) out.push(meta);
    }
    return out.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  }

  /** Moves an anonymous project into a user's projects; its anonymous handle stops working. */
  async claim(handle: unknown, user: GatewayUser): Promise<ProjectRef | undefined> {
    if (typeof handle !== 'string' || !PROJECT_HANDLE.test(handle) || !USER_KEY.test(user.key)) return undefined;
    const from = path.join(this.dataDir, 'anon', handle);
    const meta = await readJson<ProjectMeta>(path.join(from, 'project.json'));
    if (!meta) return undefined;
    const to = path.join(this.dataDir, 'users', user.key, handle);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.rename(from, to);
    const ref = { dir: to, meta };
    await this.update(ref, { owner: user.key, lastUsedAt: new Date(this.now()).toISOString() });
    await writeJson(path.join(this.dataDir, 'refs', `${meta.filesRef}.json`), { dir: path.relative(this.dataDir, to) });
    return ref;
  }

  /** Deletes a project, its download ref and its viewer copies. */
  async remove(ref: ProjectRef): Promise<void> {
    const meta = (await readJson<ProjectMeta>(path.join(ref.dir, 'project.json'))) ?? ref.meta;
    for (const view of meta.views ?? []) {
      if (/^odv_[0-9a-f]{32}$/.test(view)) await fs.rm(path.join(this.dataDir, 'views', view), { recursive: true, force: true });
    }
    if (meta.filesRef) await fs.rm(path.join(this.dataDir, 'refs', `${meta.filesRef}.json`), { force: true });
    await fs.rm(ref.dir, { recursive: true, force: true });
    this.limiters.delete(meta.id);
  }

  /** Deletes anonymous projects idle for sessionDays and account projects idle for accountProjectDays. Returns the ids removed. */
  async sweep(): Promise<string[]> {
    const removed: string[] = [];
    const day = 24 * 60 * 60 * 1000;
    const check = async (dir: string, maxDays: number): Promise<void> => {
      const meta = await readJson<ProjectMeta>(path.join(dir, 'project.json'));
      const last = meta ? Date.parse(meta.lastUsedAt) : (await fs.stat(dir)).mtimeMs;
      if (this.now() - last > maxDays * day) {
        await this.remove({ dir, meta: meta ?? ({ id: path.basename(dir), views: [], filesRef: '' } as unknown as ProjectMeta) });
        removed.push(path.basename(dir));
      }
    };
    const anon = path.join(this.dataDir, 'anon');
    for (const name of await fs.readdir(anon).catch(() => [] as string[])) {
      if (PROJECT_HANDLE.test(name)) await check(path.join(anon, name), this.limits.sessionDays);
    }
    const users = path.join(this.dataDir, 'users');
    for (const key of await fs.readdir(users).catch(() => [] as string[])) {
      if (!USER_KEY.test(key)) continue;
      for (const name of await fs.readdir(path.join(users, key)).catch(() => [] as string[])) {
        if (PROJECT_HANDLE.test(name)) await check(path.join(users, key, name), this.limits.accountProjectDays);
      }
    }
    return removed;
  }
}
