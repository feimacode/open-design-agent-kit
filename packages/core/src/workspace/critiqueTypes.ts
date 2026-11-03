// `metadata.critique` (openspec add-design-critic): the record's shape and
// validation, free of Node APIs so the browser preview's shell can import it.
// critique.ts adds what reads the workspace.

type JsonRecord = Record<string, unknown>;

export const CRITIQUE_VERDICTS = ['ship', 'polish', 'rework'] as const;
export type CritiqueVerdict = (typeof CRITIQUE_VERDICTS)[number];

/** The rubric's areas, in the order the critique skill lists them. */
export const CRITIQUE_AREAS = ['purpose-hierarchy', 'typography', 'colour-contrast', 'layout-rhythm', 'copy', 'states', 'task', 'fit'] as const;
export type CritiqueArea = (typeof CRITIQUE_AREAS)[number];

export const MAX_CRITIQUE_FINDINGS = 5;
/** Serialized size limit for `metadata.critique`, inside the manifest's 16 KB metadata limit. */
export const MAX_CRITIQUE_BYTES = 4096;

export interface CritiqueFinding {
  area: CritiqueArea;
  /** Where on the design: a section, element, slide or viewport. */
  where?: string;
  /** What is wrong. */
  problem?: string;
  /** The change to make. */
  fix: string;
}

export interface CritiqueRecord {
  verdict: CritiqueVerdict;
  findings: CritiqueFinding[];
  /** The check run the critic judged (a folder under .checks/<entry>/). */
  checkRunId?: string;
  /** ISO time the critique was recorded. */
  at: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`critique.${field} must be a string`);
  return value.trim() || undefined;
}

/**
 * A `critique` input checked and normalized into the record to store: a known
 * verdict, at most five findings each with a known area and a fix, and at most
 * 4 KB serialized. `at` defaults to now and `checkRunId` to the given latest run.
 */
export function validateCritique(input: unknown, defaults: { now?: Date; checkRunId?: string } = {}): { ok: true; record: CritiqueRecord } | { ok: false; error: string } {
  try {
    if (!isRecord(input)) throw new Error('critique must be an object with verdict and findings');
    if (typeof input.verdict !== 'string' || !(CRITIQUE_VERDICTS as readonly string[]).includes(input.verdict)) {
      throw new Error(`critique.verdict must be one of ${CRITIQUE_VERDICTS.join(', ')}`);
    }
    const rawFindings = input.findings ?? [];
    if (!Array.isArray(rawFindings)) throw new Error('critique.findings must be an array');
    if (rawFindings.length > MAX_CRITIQUE_FINDINGS) throw new Error(`critique.findings has ${rawFindings.length} findings; at most ${MAX_CRITIQUE_FINDINGS}`);
    const findings = rawFindings.map((f, i): CritiqueFinding => {
      if (!isRecord(f)) throw new Error(`critique.findings[${i}] must be an object`);
      if (typeof f.area !== 'string' || !(CRITIQUE_AREAS as readonly string[]).includes(f.area)) {
        throw new Error(`critique.findings[${i}].area must be one of ${CRITIQUE_AREAS.join(', ')}`);
      }
      const fix = optionalString(f.fix, `findings[${i}].fix`);
      if (!fix) throw new Error(`critique.findings[${i}].fix is required`);
      const finding: CritiqueFinding = { area: f.area as CritiqueArea, fix };
      const where = optionalString(f.where, `findings[${i}].where`);
      const problem = optionalString(f.problem, `findings[${i}].problem`);
      if (where) finding.where = where;
      if (problem) finding.problem = problem;
      return finding;
    });
    const record: CritiqueRecord = { verdict: input.verdict as CritiqueVerdict, findings, at: optionalString(input.at, 'at') ?? (defaults.now ?? new Date()).toISOString() };
    const checkRunId = optionalString(input.checkRunId, 'checkRunId') ?? defaults.checkRunId;
    if (checkRunId) record.checkRunId = checkRunId;
    const bytes = new TextEncoder().encode(JSON.stringify(record)).length;
    if (bytes > MAX_CRITIQUE_BYTES) throw new Error(`critique is ${bytes} bytes; the limit is ${MAX_CRITIQUE_BYTES} bytes (4 KB). Shorten the findings.`);
    return { ok: true, record };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** The manifest's `metadata.critique`, when it holds a valid record. */
export function readCritique(manifest: unknown): CritiqueRecord | undefined {
  if (!isRecord(manifest) || !isRecord(manifest.metadata)) return undefined;
  const raw = manifest.metadata.critique;
  if (raw === undefined) return undefined;
  const checked = validateCritique(raw);
  return checked.ok ? checked.record : undefined;
}

/** `metadata` with its critique replaced by `record` (only the latest is kept). */
export function withCritique(metadata: Record<string, unknown> | undefined, record: CritiqueRecord): Record<string, unknown> {
  return { ...(metadata ?? {}), critique: record };
}

/** One line for the preview: "Second look: polish, 2 fixes". */
export function critiqueSummary(record: CritiqueRecord): string {
  const n = record.findings.length;
  if (n === 0) return `Second look: ${record.verdict}`;
  const noun = record.verdict === 'ship' ? (n === 1 ? 'note' : 'notes') : n === 1 ? 'fix' : 'fixes';
  return `Second look: ${record.verdict}, ${n} ${noun}`;
}
