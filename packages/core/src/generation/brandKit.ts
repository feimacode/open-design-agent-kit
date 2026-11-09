// brand.json: the machine-readable side of a brand design system (openspec
// connect-brand-design-systems, add-brand-kit-capture). DESIGN.md stays the
// prose agents read; brand.json holds the facts code needs: whether the
// system is the person's own brand or a reference, where it came from, the
// recommender descriptor, and (from the brand-kit capture) marks, fonts,
// component specs, voice and imagery. Optional everywhere: bundled systems
// and hand-written custom ones have none.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { CanvaSourceRecord } from './canvaLink';
import type { FigmaSourceRecord } from './figmaSource';

export const BRAND_FILE = 'brand.json';
/** The site screenshot an extracted brand keeps beside DESIGN.md, for the critic and the review. */
export const BRAND_REFERENCE_FILE = 'reference.png';

export type BrandKind = 'own' | 'reference';

export interface BrandMark {
  role: 'logo' | 'logo-dark' | 'logo-on-dark' | 'icon' | 'touch-icon' | 'manifest-icon' | 'social';
  /** Relative to the design system folder (own brands) or the evidence bundle. */
  path: string;
  width?: number;
  height?: number;
  format?: string;
  /** The background colour it was seen on, `#rrggbb`. */
  seenOn?: string;
}

export interface BrandFont {
  family: string;
  weights: string[];
  source: 'google' | 'adobe' | 'self-hosted' | 'system';
  /** A stylesheet link for Google families. */
  stylesheet?: string;
  /** Self-hosted faces may be licensed: `unknown` until the person says they hold a licence. */
  licence?: 'free' | 'unknown' | 'confirmed';
  /** A free family close to it, for a self-hosted face. */
  freeMatch?: string;
  /** Font files copied into the design system's assets/fonts/ (own brands, licence confirmed). */
  files?: string[];
}

export interface ComponentSpec {
  selector: string;
  crop?: string;
  height?: number;
  paddingY?: number;
  paddingX?: number;
  fontWeight?: number;
  fontSize?: number;
  textTransform?: string;
  borderWidth?: number;
  borderColor?: string;
  radius?: number;
  background?: string;
  color?: string;
  shadow?: string;
  gap?: number;
  /** Inputs: the focus style. */
  focus?: string;
  /** Nav: whether it sticks to the top. */
  sticky?: boolean;
  /** px, as rendered. */
  width?: number;
  /** The visible text (or an input's placeholder), at most 40 characters. */
  label?: string;
  fontFamily?: string;
  /** px. */
  letterSpacing?: number;
  textAlign?: string;
}

export interface BrandComponents {
  button?: { primary?: ComponentSpec; secondary?: ComponentSpec; ghost?: ComponentSpec };
  input?: ComponentSpec;
  card?: ComponentSpec;
  nav?: ComponentSpec;
  badge?: ComponentSpec;
}

export interface BrandVoice {
  samples: Array<{ page: string; kind: 'title' | 'description' | 'h1' | 'h2' | 'cta' | 'nav' | 'paragraph'; text: string }>;
  headingCase?: 'sentence' | 'title' | 'upper' | 'mixed';
  avgSentenceWords?: number;
  person?: 'first-plural' | 'second' | 'third' | 'mixed';
  exclamations?: number;
  emoji?: number;
}

export interface BrandImagery {
  hero?: 'photo' | 'illustration' | '3d' | 'video' | 'none';
  imageRadius?: number;
  aspectRatios?: string[];
  icons?: { set: string; style?: 'outline' | 'filled'; strokeWidth?: number };
}

/** What moves on the site, observed in the browser (add-runtime-motion). A trigger that moved nothing is `none`. */
export interface BrandMotion {
  /** What changes when the pointer is over the primary control and the first card. */
  hover?: MotionChange[] | 'none';
  /** What changes when the primary control takes keyboard focus. */
  focus?: MotionChange[] | 'none';
  /** How sections and cards enter as they scroll into view. */
  entrance?: { kind: 'fade' | 'rise' | 'scale' | 'slide'; distance?: number; duration: number; stagger?: number; easing?: string; targets: string[] } | 'none';
  /** Whether something animates in the first seconds after load, and what. */
  load?: { duration: number; targets: string[] } | 'none';
  /** A motion library found on the page (gsap, framer-motion, aos, lenis, lottie…). */
  library?: string;
  /** True when the page's load and entrance animations stop under prefers-reduced-motion: reduce; absent when nothing moved to test. */
  reducedMotion?: boolean;
}

export interface MotionChange {
  /** button, card, link, input or other. */
  target: string;
  /** Animated properties with their start and end values, as `transform: none → translateY(-2px)`. */
  changes: string[];
  /** ms */
  duration: number;
  easing?: string;
}

export interface BrandRecord {
  version: 1;
  kind: BrandKind;
  name?: string;
  sources?: {
    urls?: string[];
    extractedAt?: string;
    bundleDir?: string;
    /** A draft built from a Figma file (openspec add-design-system-from-figma). */
    source?: 'figma' | 'canva';
    figma?: FigmaSourceRecord;
    /** A draft built from Canva exports (openspec add-design-system-from-canva): the design link, pages and date. */
    canva?: CanvaSourceRecord;
  };
  /** Recommender descriptor, as for bundled systems (design-system-descriptors.json). */
  descriptor?: { moods?: string[]; industries?: string[]; surfaces?: string[] };
  /** Site screenshot beside DESIGN.md (BRAND_REFERENCE_FILE), when one was kept. */
  reference?: string;
  marks?: BrandMark[];
  fonts?: BrandFont[];
  components?: BrandComponents;
  voice?: BrandVoice;
  imagery?: BrandImagery;
  motion?: BrandMotion;
}

const strings = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined);

/** A parsed brand.json, or undefined when it is missing, unreadable or not a brand record. */
export function parseBrandRecord(raw: string | undefined): BrandRecord | undefined {
  if (!raw) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  if (d.kind !== 'own' && d.kind !== 'reference') return undefined;
  const descriptor = d.descriptor && typeof d.descriptor === 'object' ? (d.descriptor as Record<string, unknown>) : undefined;
  return {
    ...(d as unknown as BrandRecord),
    version: 1,
    kind: d.kind,
    descriptor: descriptor ? { moods: strings(descriptor.moods), industries: strings(descriptor.industries), surfaces: strings(descriptor.surfaces) } : undefined,
    marks: Array.isArray(d.marks) ? (d.marks as BrandMark[]).filter((m) => m && typeof m.path === 'string' && typeof m.role === 'string') : undefined,
  };
}

export async function readBrandRecord(designSystemDir: string): Promise<BrandRecord | undefined> {
  try {
    return parseBrandRecord(await fs.readFile(path.join(designSystemDir, BRAND_FILE), 'utf8'));
  } catch {
    return undefined;
  }
}

/** Writes brand.json, merging into an existing record so later steps (the brand-kit capture) keep what earlier ones wrote. */
export async function writeBrandRecord(designSystemDir: string, update: Partial<BrandRecord> & { kind: BrandKind }): Promise<BrandRecord> {
  const existing = await readBrandRecord(designSystemDir);
  const record: BrandRecord = { ...(existing ?? {}), ...stripUndefined(update), version: 1 } as BrandRecord;
  await fs.mkdir(designSystemDir, { recursive: true });
  await fs.writeFile(path.join(designSystemDir, BRAND_FILE), JSON.stringify(record, null, 2) + '\n');
  return record;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** `# Acme Design System` for an own brand, `# Design System Inspired by Acme` for a reference. */
export function designMdHeading(name: string, kind: BrandKind | undefined): string {
  const base = name.replace(/[\s-]+inspired$/i, '').trim();
  if (kind === 'own') return /design system$/i.test(base) ? `# ${base}` : `# ${base} Design System`;
  return `# Design System Inspired by ${base}`;
}
