// Saving a new design system's brand.json, and its review page when it comes
// from an extraction (openspec connect-brand-design-systems). Shared by the
// MCP and VS Code create_open_design_design_system tools.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { BRAND_REVIEW_FILE, renderBrandReviewPage } from '../export/brandReview';
import { writeArtifactManifest } from '../vendored/artifactCreate';
import { BRAND_REFERENCE_FILE, writeBrandRecord, type BrandKind, type BrandMark, type BrandRecord } from './brandKit';
import type { CapturedBrandKit } from './siteExtraction';

export interface SaveNewBrandInput {
  workspaceRoot: string;
  outputDir: string;
  /** Workspace-relative design system folder. */
  dirRel: string;
  name: string;
  kind: BrandKind;
  descriptor?: unknown;
  /** The extraction's bundle (under <outputDir>/.extract/). */
  evidenceDir?: string;
  /** Own brands: the user confirmed they hold the licence for the self-hosted fonts, so their files are copied. */
  fontLicence?: 'confirmed';
}

/**
 * brand.json for a new design system: kind, descriptor and, from an
 * extraction, its sources and the site screenshot as reference.png; then a
 * registered review.html comparing the site with a sample styled by tokens.css.
 */
export async function saveNewBrand(input: SaveNewBrandInput): Promise<{ brand: BrandRecord; review?: string }> {
  const dir = path.join(input.workspaceRoot, input.dirRel);
  const d = input.descriptor && typeof input.descriptor === 'object' ? (input.descriptor as Record<string, unknown>) : {};
  const list = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 8) : undefined);
  const update: Partial<BrandRecord> & { kind: BrandKind } = {
    kind: input.kind,
    name: input.name,
    descriptor: input.descriptor ? { moods: list(d.moods), industries: list(d.industries), surfaces: list(d.surfaces) } : undefined,
  };
  if (input.evidenceDir) {
    const extractRoot = path.posix.join(input.outputDir.split(path.sep).join('/'), '.extract') + '/';
    const rel = path.posix.normalize(input.evidenceDir.replace(/\\/g, '/')).replace(/\/$/, '');
    if (!(rel + '/').startsWith(extractRoot) || rel.includes('..')) throw new Error(`"evidenceDir" must be an evidence bundle under ${extractRoot}.`);
    const bundle = path.join(input.workspaceRoot, rel);
    let urls: string[] | undefined;
    let measuredAt: string | undefined;
    let kit: CapturedBrandKit | undefined;
    try {
      const ev = JSON.parse(await fs.readFile(path.join(bundle, 'evidence.json'), 'utf8')) as { url?: string; measuredAt?: string; pages?: Array<{ url?: string }>; brandKit?: CapturedBrandKit };
      urls = ev.pages?.map((p) => p.url).filter((u): u is string => typeof u === 'string') ?? (ev.url ? [ev.url] : undefined);
      measuredAt = ev.measuredAt;
      kit = ev.brandKit;
    } catch {
      throw new Error(`No evidence.json in ${rel}. Pass the bundleDir that extract_open_design_design_system returned.`);
    }
    update.sources = { urls, extractedAt: measuredAt, bundleDir: rel };
    if (kit) Object.assign(update, await brandKitRecord(kit, bundle, dir, input.kind, input.fontLicence === 'confirmed'));
    const shot = await fs.readFile(path.join(bundle, 'desktop.png')).catch(() => fs.readFile(path.join(bundle, 'page-1-desktop.png')).catch(() => undefined));
    if (shot) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, BRAND_REFERENCE_FILE), shot);
      update.reference = BRAND_REFERENCE_FILE;
    }
  }
  const brand = await writeBrandRecord(dir, update);
  if (!brand.sources?.bundleDir) return { brand };
  const review = path.posix.join(input.dirRel, BRAND_REVIEW_FILE);
  const evidence = path.posix.relative(input.dirRel, path.posix.join(brand.sources.bundleDir, 'evidence.json'));
  await fs.writeFile(path.join(input.workspaceRoot, review), renderBrandReviewPage({ name: input.name, evidence, reference: brand.reference }));
  await writeArtifactManifest({ workspaceRoot: input.workspaceRoot, entryPath: review, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: `${input.name}: review` } });
  return { brand, review };
}

/**
 * The brand-kit part of brand.json from an extraction. An own brand's marks
 * are copied into assets/ (paths relative to the design system); a reference
 * keeps no marks, no font files and no copied lines of the site's text, only
 * the counted voice facts.
 */
export async function brandKitRecord(kit: CapturedBrandKit, bundle: string, dir: string, kind: BrandKind, fontsConfirmed: boolean): Promise<Partial<BrandRecord>> {
  const own = kind === 'own';
  const marks: BrandMark[] = [];
  if (own) {
    for (const m of kit.marks) {
      const name = path.posix.basename(m.path);
      const from = path.join(bundle, m.path);
      const to = path.join(dir, 'assets', name);
      try {
        await fs.mkdir(path.dirname(to), { recursive: true });
        await fs.copyFile(from, to);
        marks.push({ ...m, path: `assets/${name}` });
      } catch {
        // A mark whose file is gone is left out.
      }
    }
  }
  const fonts = [];
  for (const f of kit.fonts) {
    if (own && fontsConfirmed && f.source === 'self-hosted' && f.files?.length) {
      const files: string[] = [];
      for (const file of f.files) {
        const to = path.join(dir, 'assets', 'fonts', path.posix.basename(file));
        try {
          await fs.mkdir(path.dirname(to), { recursive: true });
          await fs.copyFile(path.join(bundle, file), to);
          files.push(`assets/fonts/${path.posix.basename(file)}`);
        } catch {
          // Skipped.
        }
      }
      fonts.push({ ...f, licence: 'confirmed' as const, files });
    } else {
      const rest = { ...f };
      delete rest.files;
      fonts.push(rest);
    }
  }
  const { samples, ...facts } = kit.voice;
  return {
    marks: own ? marks : undefined,
    fonts,
    components: kit.components,
    voice: own ? { samples, ...facts } : { samples: [], ...facts },
    imagery: kit.imagery,
  };
}
