// Where an artifact has been published: `metadata.shares` in its manifest,
// one record per (provider, siteRef), newest last. Written only when the
// model reports a successful deploy back through publish_open_design_artifact.
// openspec: add-artifact-sharing.
import type { JsonRecord } from '../vendored/artifactManifest';

export const PUBLISH_PROVIDERS = [
  'netlify-temporary',
  'cloudflare-temporary',
  'netlify',
  'vercel',
  'cloudflare-pages',
  'github-pages',
] as const;
export type PublishProvider = (typeof PUBLISH_PROVIDERS)[number];

export const MAX_SHARE_RECORDS = 20;

export function isPublishProvider(value: unknown): value is PublishProvider {
  return typeof value === 'string' && (PUBLISH_PROVIDERS as readonly string[]).includes(value);
}

export interface ShareRecord {
  provider: PublishProvider;
  url: string;
  claimUrl?: string;
  /** ISO timestamp after which a temporary link stops working. */
  expiresAt?: string;
  /** Provider-side identity to redeploy to: site id, project name, repo path. */
  siteRef?: string;
  publishedAt: string;
}

export interface PublishedInput {
  provider: string;
  url: string;
  claimUrl?: string;
  expiresAt?: string;
  siteRef?: string;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Validates what the model reports after a deploy; returns an error message or the record to store. */
export function validatePublished(input: PublishedInput, now = new Date()): { ok: true; record: ShareRecord } | { ok: false; error: string } {
  if (!isPublishProvider(input.provider)) return { ok: false, error: `published.provider must be one of ${PUBLISH_PROVIDERS.join(', ')}.` };
  if (!isHttpsUrl(input.url)) return { ok: false, error: `published.url must be an https URL (got "${input.url}").` };
  if (input.claimUrl !== undefined && !isHttpsUrl(input.claimUrl)) return { ok: false, error: 'published.claimUrl must be an https URL.' };
  if (input.expiresAt !== undefined && Number.isNaN(Date.parse(input.expiresAt))) {
    return { ok: false, error: 'published.expiresAt must be an ISO date-time.' };
  }
  if (input.siteRef !== undefined && (typeof input.siteRef !== 'string' || input.siteRef.length === 0 || input.siteRef.length > 200)) {
    return { ok: false, error: 'published.siteRef must be a non-empty string of at most 200 characters.' };
  }
  const record: ShareRecord = { provider: input.provider, url: input.url, publishedAt: now.toISOString() };
  if (input.claimUrl) record.claimUrl = input.claimUrl;
  if (input.expiresAt) record.expiresAt = new Date(input.expiresAt).toISOString();
  if (input.siteRef) record.siteRef = input.siteRef;
  return { ok: true, record };
}

function isShareRecord(value: unknown): value is ShareRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as JsonRecord;
  return isPublishProvider(r.provider) && typeof r.url === 'string' && typeof r.publishedAt === 'string';
}

/** The manifest's share records, oldest first; malformed entries are skipped. */
export function readShareRecords(manifest: JsonRecord | null | undefined): ShareRecord[] {
  const metadata = manifest?.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const shares = (metadata as JsonRecord).shares;
  return Array.isArray(shares) ? shares.filter(isShareRecord) : [];
}

/** Metadata with the record added, replacing one for the same provider and siteRef, keeping the newest MAX_SHARE_RECORDS. */
export function upsertShareRecord(metadata: unknown, record: ShareRecord): JsonRecord {
  const base: JsonRecord = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...(metadata as JsonRecord) } : {};
  const existing = Array.isArray(base.shares) ? (base.shares as unknown[]).filter(isShareRecord) : [];
  const kept = existing.filter((r) => !(r.provider === record.provider && (r.siteRef ?? '') === (record.siteRef ?? '')));
  base.shares = [...kept, record].slice(-MAX_SHARE_RECORDS);
  return base;
}

export function isExpired(record: ShareRecord, now = new Date()): boolean {
  return record.expiresAt !== undefined && Date.parse(record.expiresAt) <= now.getTime();
}

/** The newest record for a provider (any siteRef), or undefined. */
export function latestShareFor(records: ShareRecord[], provider: PublishProvider): ShareRecord | undefined {
  for (let i = records.length - 1; i >= 0; i--) if (records[i]!.provider === provider) return records[i];
  return undefined;
}

/** Records whose links still work, newest first. */
export function liveShareRecords(records: ShareRecord[], now = new Date()): ShareRecord[] {
  return records.filter((r) => !isExpired(r, now)).reverse();
}
