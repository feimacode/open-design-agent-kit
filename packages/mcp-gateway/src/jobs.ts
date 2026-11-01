// Export jobs (openspec add-mcp-gateway, "Asynchronous Long Exports"): every
// hosted export runs through one small queue so Chromium can't starve the
// other services on the VM. A call waits up to a budget (20 s by default, well
// under Cloudflare's idle limit for proxied requests); an export still running
// then becomes a job the agent polls with get_open_design_export_status.
// Video and PowerPoint skip the wait: they always run as jobs.
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { ToolResult } from '@feimacode/open-design-agent-kit-mcp/src/session';

export const JOB_ID = /^odj_[0-9a-f]{16}$/;

/** Formats that take long enough to always run as a job. */
const SLOW_FORMATS = new Set(['pptx', 'mp4', 'webm', 'gif']);

export function alwaysAJob(args: Record<string, unknown>): boolean {
  return (typeof args.format === 'string' && SLOW_FORMATS.has(args.format)) || args.data !== undefined || Array.isArray(args.presets);
}

export interface JobRecord {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  createdAt: string;
  finishedAt?: string;
  result?: ToolResult;
}

/** A FIFO queue with a fixed number of slots. */
export class Slots {
  private running = 0;
  private readonly waiting: Array<() => void> = [];
  constructor(private readonly size: number) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.running >= this.size) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.running += 1;
    try {
      return await work();
    } finally {
      this.running -= 1;
      this.waiting.shift()?.();
    }
  }

  get busy(): number {
    return this.running;
  }
}

export class ExportJobs {
  private readonly slots: Slots;

  constructor(
    concurrency: number,
    private readonly waitMs: number,
  ) {
    this.slots = new Slots(concurrency);
  }

  private static file(projectDir: string, id: string): string {
    return path.join(projectDir, 'jobs', `${id}.json`);
  }

  private static async save(projectDir: string, job: JobRecord): Promise<void> {
    await fs.mkdir(path.join(projectDir, 'jobs'), { recursive: true });
    await fs.writeFile(ExportJobs.file(projectDir, job.id), JSON.stringify(job));
  }

  /** Runs an export: its result when it finishes within the wait (and isn't always a job), else a job id. */
  async start(projectDir: string, args: Record<string, unknown>, run: () => Promise<ToolResult>): Promise<{ result: ToolResult } | { jobId: string }> {
    const job: JobRecord = { id: `odj_${randomBytes(8).toString('hex')}`, status: 'queued', createdAt: new Date().toISOString() };
    const work = this.slots
      .run(async () => {
        job.status = 'running';
        return run();
      })
      .then(
        (result) => ({ ...job, status: result.isError ? ('failed' as const) : ('done' as const), finishedAt: new Date().toISOString(), result }),
        (err: unknown) => ({
          ...job,
          status: 'failed' as const,
          finishedAt: new Date().toISOString(),
          result: { content: [{ type: 'text' as const, text: `The export failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true },
        }),
      );
    if (!alwaysAJob(args)) {
      let timer: NodeJS.Timeout | undefined;
      const waited = await Promise.race([work, new Promise<undefined>((resolve) => (timer = setTimeout(() => resolve(undefined), this.waitMs)))]);
      if (timer) clearTimeout(timer);
      if (waited) return { result: waited.result! };
    }
    await ExportJobs.save(projectDir, job);
    void work.then((done) => ExportJobs.save(projectDir, done)).catch(() => undefined);
    return { jobId: job.id };
  }

  async status(projectDir: string, id: unknown): Promise<JobRecord | undefined> {
    if (typeof id !== 'string' || !JOB_ID.test(id)) return undefined;
    try {
      return JSON.parse(await fs.readFile(ExportJobs.file(projectDir, id), 'utf8')) as JobRecord;
    } catch {
      return undefined;
    }
  }
}
