// Upload limits of the platforms designers share work on (openspec
// add-portfolio-share-and-review): one data file with each value's source page
// and the day it was checked, so a rule change is one edit. Values marked
// unverified (not confirmed on the platform's own page) only ever warn.
import type { Finding } from './preflight';
import data from './share-platforms.json';

export interface PlatformLimits {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  width?: number;
  height?: number;
  ratio?: string;
  maxBytes?: number;
  /** Refused outright above this (Behance: 10 MB recommended, 50 MB refused). */
  hardMaxBytes?: number;
  maxPages?: number;
  maxCards?: number;
  types?: string[];
}

export interface SharePlatform {
  id: string;
  label: string;
  formats: string[];
  image?: PlatformLimits;
  video?: PlatformLimits;
  document?: PlatformLimits;
  source: string;
  checked: string;
  unverified?: boolean;
  notes?: string;
}

export const SHARE_PLATFORMS: readonly SharePlatform[] = (data as { platforms: SharePlatform[] }).platforms;

export function sharePlatform(id: string | undefined): SharePlatform | undefined {
  return id ? SHARE_PLATFORMS.find((p) => p.id === id) : undefined;
}

/** The platforms that take a format, e.g. marketplace-cover: Upwork, Contra and Fiverr. */
export function platformsForFormat(formatId: string | undefined): SharePlatform[] {
  return formatId ? SHARE_PLATFORMS.filter((p) => p.formats.includes(formatId)) : [];
}

export type ExportedKind = 'image' | 'video' | 'document';

const mb = (n: number) => `${Math.round((n / 1_000_000) * 10) / 10} MB`;

/**
 * Findings for one exported file against the platforms its format is for: an
 * error over a confirmed byte limit, a warning over an unverified one or over a
 * recommended size that the platform still accepts.
 */
export function platformLimitFindings(formatId: string | undefined, file: { path: string; kind: ExportedKind; bytes: number; width?: number; height?: number; pages?: number }): Finding[] {
  const out: Finding[] = [];
  for (const p of platformsForFormat(formatId)) {
    const limits = p[file.kind];
    if (!limits) continue;
    const where = `${file.path} for ${p.label}`;
    const cite = `(${p.source}, checked ${p.checked}${p.unverified ? ', unverified' : ''})`;
    if (limits.hardMaxBytes !== undefined && file.bytes > limits.hardMaxBytes) {
      out.push({ check: 'platform-limit', severity: p.unverified ? 'warning' : 'error', message: `${where}: ${mb(file.bytes)} is over the ${mb(limits.hardMaxBytes)} the platform accepts ${cite}.` });
    } else if (limits.maxBytes !== undefined && file.bytes > limits.maxBytes) {
      const hard = limits.hardMaxBytes === undefined && !p.unverified;
      out.push({ check: 'platform-limit', severity: hard ? 'error' : 'warning', message: `${where}: ${mb(file.bytes)} is over the ${mb(limits.maxBytes)} limit ${cite}. ${file.kind === 'video' ? 'Shorten it or export at a lower fps or width.' : 'Use fewer or smaller photos, or JPEG.'}` });
    }
    if (file.width !== undefined && limits.minWidth !== undefined && file.width < limits.minWidth) {
      out.push({ check: 'platform-limit', severity: 'warning', message: `${where}: ${file.width} px wide is under the ${limits.minWidth} px the platform asks for ${cite}.` });
    }
    if (file.pages !== undefined && limits.maxPages !== undefined && file.pages > limits.maxPages) {
      out.push({ check: 'platform-limit', severity: p.unverified ? 'warning' : 'error', message: `${where}: ${file.pages} pages is over the ${limits.maxPages}-page limit ${cite}.` });
    }
  }
  return out;
}
