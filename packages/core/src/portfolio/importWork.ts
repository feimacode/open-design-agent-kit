// import_open_design_work (openspec add-work-library): brings a designer's own
// work into a library project from workspace files, pasted image data, live
// URLs (desktop and phone captures), kit designs and Figma frames. Every image
// loses its camera and location metadata, keeps one original, and gets WebP
// widths for the site and the share formats when a browser is available.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Browser } from 'puppeteer-core';
import { findBrowser, openHeadlessBrowser, type HeadlessBrowser } from '../export/browserDiscovery';
import { gotoPage, hideConsentBanners, launchLiveBrowser, validateLiveUrls } from '../export/livePage';
import { startStaticServer } from '../export/staticServer';
import { fetchFigmaFrameImage, parseFigmaUrl } from '../generation/figmaPull';
import {
  ASSET_DEVICES,
  ASSET_KINDS,
  ASSETS_DIR,
  libraryPaths,
  PRIVACY_LEVELS,
  privacyRank,
  readProject,
  writeProject,
  type AssetDevice,
  type AssetKind,
  type AssetOrigin,
  type PrivacyLevel,
  type Project,
  type ProjectAsset,
  type Redaction,
} from './library';
import { DRIBBBLE_MIN_WIDTH, extensionFor, imageSize, isMp4, processImage, sniffImage, stripImageMetadata } from './images';

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_IMPORT_SOURCES = 20;
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

interface SourceCommon {
  /** The agent's draft alt text; stays a draft until the designer confirms it. */
  alt?: string;
  caption?: string;
  assetKind?: AssetKind;
  device?: AssetDevice;
  privacy?: PrivacyLevel;
  /** A short name for the asset id, e.g. "checkout-before". */
  name?: string;
}

export type WorkSource =
  | (SourceCommon & { kind: 'file'; path: string })
  | (SourceCommon & { kind: 'data'; data: string; name: string })
  | (SourceCommon & { kind: 'url'; url: string; fullPage?: boolean })
  | (SourceCommon & { kind: 'design'; entryPath: string; fullPage?: boolean })
  | (SourceCommon & { kind: 'figma'; url: string; data?: string });

export interface ImportWorkInput {
  workspaceRoot: string;
  outputDir: string;
  project: string;
  sources: unknown[];
  browserPath?: string;
  figmaToken?: string;
  /** Hosts allowed despite resolving to private addresses (evals on 127.0.0.1). */
  allowHostsForTesting?: string[];
  fetchImpl?: typeof fetch;
}

export interface ImportedAsset {
  asset: ProjectAsset;
  warnings: string[];
  /** A small copy for the agent to look at while drafting alt text. */
  preview?: { data: Buffer; mime: string };
}

export interface ImportWorkResult {
  ok: boolean;
  error?: string;
  project?: string;
  imported: ImportedAsset[];
  failed: Array<{ source: string; error: string }>;
  /** Steps for sources the tool can't read itself (a Figma frame with no token or data). */
  steps: string[];
  notes: string[];
}

function describe(source: unknown): string {
  const s = (source ?? {}) as Record<string, unknown>;
  return String(s.path ?? s.url ?? s.entryPath ?? s.name ?? s.kind ?? 'source');
}

function idStem(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'asset'
  );
}

function uniqueId(project: Project, stem: string, taken: Set<string>): string {
  let id = stem;
  for (let n = 2; taken.has(id) || project.assets.some((a) => a.id === id); n++) id = `${stem}-${n}`;
  taken.add(id);
  return id;
}

function parseCommon(s: Record<string, unknown>, project: Project): { ok: true; value: SourceCommon } | { ok: false; error: string } {
  const assetKind = s.assetKind;
  if (assetKind !== undefined && !(ASSET_KINDS as readonly unknown[]).includes(assetKind)) return { ok: false, error: `assetKind must be one of ${ASSET_KINDS.join(', ')}.` };
  const device = s.device;
  if (device !== undefined && !(ASSET_DEVICES as readonly unknown[]).includes(device)) return { ok: false, error: `device must be one of ${ASSET_DEVICES.join(', ')}.` };
  const privacy = s.privacy;
  if (privacy !== undefined && !(PRIVACY_LEVELS as readonly unknown[]).includes(privacy)) return { ok: false, error: `privacy must be one of ${PRIVACY_LEVELS.join(', ')}.` };
  if (privacy !== undefined && privacyRank(privacy as PrivacyLevel) < privacyRank(project.privacy)) {
    return { ok: false, error: `privacy "${privacy}" is looser than the project's "${project.privacy}"; an asset can't be looser than its project.` };
  }
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return { ok: true, value: { alt: text(s.alt), caption: text(s.caption), assetKind: assetKind as AssetKind | undefined, device: device as AssetDevice | undefined, privacy: privacy as PrivacyLevel | undefined, name: text(s.name) } };
}

function insideWorkspace(workspaceRoot: string, rel: string): string | undefined {
  const abs = path.resolve(workspaceRoot, rel);
  const within = path.relative(path.resolve(workspaceRoot), abs);
  return within.startsWith('..') || path.isAbsolute(within) ? undefined : abs;
}

function decodeBase64(data: string): Buffer | undefined {
  const compact = data.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 === 1) return undefined;
  return Buffer.from(compact, 'base64');
}

interface Raw {
  data: Buffer;
  stem: string;
  origin: AssetOrigin;
  common: SourceCommon;
  defaultKind: AssetKind;
  device?: AssetDevice;
}

/** Lazily opened browsers, shared by every source of one call. */
class Browsers {
  private plain?: HeadlessBrowser;
  private live?: Awaited<ReturnType<typeof launchLiveBrowser>>;
  private path?: string | null;
  constructor(private readonly explicit?: string, private readonly allowHosts: string[] = []) {}
  async executable(): Promise<string | undefined> {
    if (this.path === undefined) {
      const found = await findBrowser({ explicitPath: this.explicit });
      this.path = found.ok ? found.executablePath : null;
    }
    return this.path ?? undefined;
  }
  async available(): Promise<boolean> {
    if (process.env.OPEN_DESIGN_BROWSER_URL?.trim()) return true;
    return (await this.executable()) !== undefined;
  }
  async image(): Promise<Browser | undefined> {
    if (!this.plain) {
      if (!(await this.available())) return undefined;
      this.plain = await openHeadlessBrowser({ executablePath: await this.executable() });
    }
    return this.plain.browser;
  }
  async liveBrowser() {
    if (!this.live) {
      if (!(await this.available())) return undefined;
      this.live = await launchLiveBrowser((await this.executable()) ?? '', this.allowHosts);
    }
    return this.live;
  }
  async close(): Promise<void> {
    await this.plain?.close();
    await this.live?.close();
  }
}

async function captureUrl(browsers: Browsers, url: string, fullPage: boolean): Promise<{ desktop: Buffer; phone: Buffer } | { error: string }> {
  const live = await browsers.liveBrowser();
  if (!live) return { error: 'capturing a page needs Chrome, Edge or Chromium, and none was found. Take screenshots and import them as files instead.' };
  const page = live.page;
  try {
    await page.setViewport({ ...DESKTOP, deviceScaleFactor: 2 });
    await gotoPage(page, url);
    await page.evaluate(hideConsentBanners);
    const desktop = Buffer.from(await page.screenshot({ type: 'png', fullPage }));
    // The phone pass sets the width only: mobile emulation zooms out and hides sideways scroll (see the site audit).
    await page.setViewport({ ...PHONE, hasTouch: true, deviceScaleFactor: 3 });
    await gotoPage(page, url);
    await page.evaluate(hideConsentBanners);
    const phone = Buffer.from(await page.screenshot({ type: 'png', fullPage }));
    return { desktop, phone };
  } catch (err) {
    return { error: `couldn't capture ${url}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}` };
  }
}

async function captureDesign(browsers: Browsers, workspaceRoot: string, entryPath: string, fullPage: boolean): Promise<{ desktop: Buffer; phone: Buffer } | { error: string }> {
  const browser = await browsers.image();
  if (!browser) return { error: 'capturing a design needs Chrome, Edge or Chromium, and none was found.' };
  const server = await startStaticServer(workspaceRoot);
  const page = await browser.newPage();
  try {
    const url = new URL(entryPath.split('/').map(encodeURIComponent).join('/'), server.baseUrl).toString();
    await page.setViewport({ ...DESKTOP, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 });
    const desktop = Buffer.from(await page.screenshot({ type: 'png', fullPage }));
    await page.setViewport({ ...PHONE, hasTouch: true, deviceScaleFactor: 3 });
    await page.reload({ waitUntil: 'networkidle0', timeout: 30_000 });
    const phone = Buffer.from(await page.screenshot({ type: 'png', fullPage }));
    return { desktop, phone };
  } catch (err) {
    return { error: `couldn't capture ${entryPath}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}` };
  } finally {
    await page.close().catch(() => undefined);
    await server.close();
  }
}

/** Writes one image or video as an asset (original, variants, redacted copy) and returns it. */
async function storeAsset(
  input: { workspaceRoot: string; outputDir: string },
  project: Project,
  raw: Raw,
  id: string,
  browsers: Browsers,
  redactions: Redaction[] = [],
): Promise<ImportedAsset | { error: string }> {
  const warnings: string[] = [];
  const projectDir = path.join(input.workspaceRoot, libraryPaths(input.outputDir).projectDir(project.slug));
  const assetsDir = path.join(projectDir, ASSETS_DIR);
  await fs.mkdir(assetsDir, { recursive: true });
  const kind = raw.common.assetKind ?? raw.defaultKind;
  const now = raw.origin;
  if (isMp4(raw.data)) {
    if (raw.data.length > MAX_VIDEO_BYTES) return { error: `the video is ${(raw.data.length / 1048576).toFixed(1)} MB; the limit is ${MAX_VIDEO_BYTES / 1048576} MB.` };
    const file = `${ASSETS_DIR}/${id}.mp4`;
    await fs.writeFile(path.join(projectDir, file), raw.data);
    warnings.push('Videos keep their own metadata: export it from your editor without location data if the clip was filmed on a phone.');
    return {
      asset: { id, file, mime: 'video/mp4', bytes: raw.data.length, kind: raw.common.assetKind ?? 'video', device: raw.common.device ?? raw.device, caption: raw.common.caption, privacy: raw.common.privacy, origin: now },
      warnings,
    };
  }
  const mime = sniffImage(raw.data);
  if (!mime) return { error: 'it is not a PNG, JPEG, WebP or GIF image, or an MP4 video.' };
  if (raw.data.length > MAX_IMPORT_BYTES) return { error: `the image is ${(raw.data.length / 1048576).toFixed(1)} MB; the limit is ${MAX_IMPORT_BYTES / 1048576} MB.` };
  const stripped = stripImageMetadata(raw.data);
  if (stripped.removed) warnings.push(`Removed ${stripped.removed} metadata block${stripped.removed === 1 ? '' : 's'} (camera, location or editing data).`);
  const size = imageSize(stripped.data);
  const file = `${ASSETS_DIR}/${id}${extensionFor(mime)}`;
  await fs.writeFile(path.join(projectDir, file), stripped.data);
  const asset: ProjectAsset = {
    id,
    file,
    mime,
    width: size?.width,
    height: size?.height,
    bytes: stripped.data.length,
    kind,
    device: raw.common.device ?? raw.device,
    alt: raw.common.alt,
    altDraft: raw.common.alt ? true : undefined,
    caption: raw.common.caption,
    privacy: raw.common.privacy,
    redactions: redactions.length ? redactions : undefined,
    origin: now,
  };
  if (size && size.width < DRIBBBLE_MIN_WIDTH) warnings.push(`It is ${size.width} px wide, under the 1600 px Dribbble minimum; Dribbble and Behance will show it small.`);
  let preview: ImportedAsset['preview'];
  if (mime === 'image/gif') {
    warnings.push('GIFs are kept as they are (no WebP widths), so their animation survives.');
  } else {
    const browser = await browsers.image();
    if (browser) {
      const processed = await processImage(browser, stripped.data, mime, redactions);
      asset.width = processed.width;
      asset.height = processed.height;
      asset.variants = [];
      for (const v of processed.variants) {
        const vf = `${ASSETS_DIR}/${id}-${v.width}.webp`;
        await fs.writeFile(path.join(projectDir, vf), v.data);
        asset.variants.push({ width: v.width, file: vf });
      }
      if (processed.redacted) {
        const rf = `${ASSETS_DIR}/${id}-redacted.png`;
        await fs.writeFile(path.join(projectDir, rf), processed.redacted);
        asset.redactedFile = rf;
      }
      preview = { data: processed.variants[0].data, mime: 'image/webp' };
    } else {
      warnings.push('No browser was found, so the WebP widths weren\'t made; outputs use the original until the asset is imported again with a browser.');
      if (stripped.data.length <= 1_500_000) preview = { data: stripped.data, mime };
    }
  }
  return { asset, warnings, preview };
}

export async function importWork(input: ImportWorkInput): Promise<ImportWorkResult> {
  const result: ImportWorkResult = { ok: false, imported: [], failed: [], steps: [], notes: [] };
  const project = await readProject(input.workspaceRoot, input.outputDir, input.project);
  if (!project) {
    result.error = `There is no project "${input.project}" in the work library. Save it first with save_open_design_project (a title, role and privacy level are enough).`;
    return result;
  }
  result.project = project.slug;
  if (!Array.isArray(input.sources) || input.sources.length === 0) {
    result.error = 'sources is required: a list of { kind: "file" | "data" | "url" | "design" | "figma", ... }.';
    return result;
  }
  if (input.sources.length > MAX_IMPORT_SOURCES) {
    result.error = `At most ${MAX_IMPORT_SOURCES} sources per call (got ${input.sources.length}); import the rest in another call.`;
    return result;
  }
  const browsers = new Browsers(input.browserPath, input.allowHostsForTesting);
  const taken = new Set<string>();
  const capturedAt = new Date().toISOString();
  try {
    for (const source of input.sources) {
      const label = describe(source);
      const s = (source ?? {}) as Record<string, unknown>;
      const common = parseCommon(s, project);
      if (!common.ok) {
        result.failed.push({ source: label, error: common.error });
        continue;
      }
      const raws: Raw[] = [];
      if (s.kind === 'file') {
        const rel = typeof s.path === 'string' ? s.path.trim() : '';
        const abs = rel ? insideWorkspace(input.workspaceRoot, rel) : undefined;
        if (!abs) {
          result.failed.push({ source: label, error: 'path must be a file inside the workspace.' });
          continue;
        }
        let data: Buffer;
        try {
          data = await fs.readFile(abs);
        } catch {
          result.failed.push({ source: label, error: "the file doesn't exist." });
          continue;
        }
        raws.push({ data, stem: common.value.name ?? path.basename(rel), origin: { kind: 'file', from: rel.replace(/\\/g, '/'), capturedAt }, common: common.value, defaultKind: 'screen' });
      } else if (s.kind === 'data' || (s.kind === 'figma' && typeof s.data === 'string' && s.data)) {
        const data = typeof s.data === 'string' ? decodeBase64(s.data) : undefined;
        if (!data || data.length === 0) {
          result.failed.push({ source: label, error: 'data must be the file as base64.' });
          continue;
        }
        const name = common.value.name ?? (typeof s.name === 'string' ? s.name : s.kind === 'figma' ? 'figma-frame' : 'image');
        const from = s.kind === 'figma' ? String(s.url ?? 'figma') : name;
        raws.push({ data, stem: name, origin: { kind: s.kind === 'figma' ? 'figma' : 'data', from, capturedAt }, common: common.value, defaultKind: 'screen' });
      } else if (s.kind === 'figma') {
        const url = typeof s.url === 'string' ? s.url.trim() : '';
        const ref = parseFigmaUrl(url);
        if (!ref || !ref.nodeId) {
          result.failed.push({ source: label, error: 'url must be a Figma frame link with a node-id (Figma\'s "Copy link to selection").' });
          continue;
        }
        const imageUrl = input.figmaToken ? await fetchFigmaFrameImage(input.figmaToken, ref.fileKey, ref.nodeId, input.fetchImpl) : undefined;
        if (!imageUrl) {
          result.steps.push(
            `Figma frame ${url}: ${input.figmaToken ? "the Figma API didn't return an image for it" : 'no Figma token is set'}. If the Figma connector is connected, call its get_screenshot for this frame (fileKey ${ref.fileKey}, nodeId ${ref.nodeId}), then call import_open_design_work again with { kind: "figma", url, data: <the image as base64> }. Otherwise ask the designer to export the frame as a PNG at 2x and import the file.`,
          );
          continue;
        }
        try {
          const response = await (input.fetchImpl ?? fetch)(imageUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          raws.push({ data: Buffer.from(await response.arrayBuffer()), stem: common.value.name ?? 'figma-frame', origin: { kind: 'figma', from: url, capturedAt }, common: common.value, defaultKind: 'screen' });
        } catch (err) {
          result.failed.push({ source: label, error: `couldn't download the frame image: ${err instanceof Error ? err.message : String(err)}` });
          continue;
        }
      } else if (s.kind === 'url') {
        const url = typeof s.url === 'string' ? s.url.trim() : '';
        const valid = await validateLiveUrls(url, [], undefined, input.allowHostsForTesting ?? []);
        if (!valid.ok) {
          result.failed.push({ source: label, error: valid.error });
          continue;
        }
        const shots = await captureUrl(browsers, valid.urls[0].toString(), s.fullPage === true);
        if ('error' in shots) {
          result.failed.push({ source: label, error: shots.error });
          continue;
        }
        const stem = common.value.name ?? valid.urls[0].hostname.replace(/^www\./, '') + (valid.urls[0].pathname.length > 1 ? valid.urls[0].pathname : '');
        raws.push({ data: shots.desktop, stem: `${stem}-desktop`, origin: { kind: 'url', from: valid.urls[0].toString(), capturedAt }, common: common.value, defaultKind: 'screen', device: common.value.device ?? 'browser' });
        raws.push({ data: shots.phone, stem: `${stem}-phone`, origin: { kind: 'url', from: valid.urls[0].toString(), capturedAt }, common: { ...common.value, device: undefined }, defaultKind: 'screen' });
      } else if (s.kind === 'design') {
        const entryPath = typeof s.entryPath === 'string' ? s.entryPath.trim().replace(/\\/g, '/') : '';
        if (!entryPath || !insideWorkspace(input.workspaceRoot, entryPath) || !/\.html?$/i.test(entryPath)) {
          result.failed.push({ source: label, error: 'entryPath must be a design\'s HTML entry file in the workspace.' });
          continue;
        }
        const shots = await captureDesign(browsers, input.workspaceRoot, entryPath, s.fullPage === true);
        if ('error' in shots) {
          result.failed.push({ source: label, error: shots.error });
          continue;
        }
        const stem = common.value.name ?? path.posix.basename(entryPath);
        raws.push({ data: shots.desktop, stem: `${stem}-desktop`, origin: { kind: 'design', from: entryPath, capturedAt }, common: common.value, defaultKind: 'design' });
        raws.push({ data: shots.phone, stem: `${stem}-phone`, origin: { kind: 'design', from: entryPath, capturedAt }, common: common.value, defaultKind: 'design' });
        if (!project.designs?.includes(entryPath)) project.designs = [...(project.designs ?? []), entryPath];
      } else {
        result.failed.push({ source: label, error: 'kind must be one of file, data, url, design, figma.' });
        continue;
      }
      for (const raw of raws) {
        const id = uniqueId(project, idStem(raw.stem), taken);
        const stored = await storeAsset(input, project, raw, id, browsers);
        if ('error' in stored) result.failed.push({ source: label, error: stored.error });
        else {
          project.assets.push(stored.asset);
          result.imported.push(stored);
        }
      }
    }
  } finally {
    await browsers.close();
  }
  await writeProject(input.workspaceRoot, input.outputDir, project);
  result.ok = result.imported.length > 0 || (result.failed.length === 0 && result.steps.length > 0);
  if (result.imported.some((i) => !i.asset.alt && i.asset.mime !== 'video/mp4')) {
    result.notes.push('Look at each image and save a short alt text draft with save_open_design_project (assets: [{ id, alt }]); ask the designer to confirm it (confirmAlt: true).');
  }
  return result;
}

/** Re-renders an asset's WebP widths and redacted copy after its redaction boxes changed. */
export async function rebuildAssetCopies(input: { workspaceRoot: string; outputDir: string; project: Project; asset: ProjectAsset; browserPath?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const { project, asset } = input;
  if (asset.mime === 'video/mp4' || asset.mime === 'image/gif') {
    return asset.redactions?.length ? { ok: false, error: `${asset.id} is a ${asset.mime === 'image/gif' ? 'GIF' : 'video'}, which can't be redacted; replace it with a still image or edit it in your own tool.` } : { ok: true };
  }
  const projectDir = path.join(input.workspaceRoot, libraryPaths(input.outputDir).projectDir(project.slug));
  const browsers = new Browsers(input.browserPath);
  try {
    const browser = await browsers.image();
    if (!browser) return { ok: false, error: 'redacting an image needs Chrome, Edge or Chromium, and none was found.' };
    const data = await fs.readFile(path.join(projectDir, asset.file));
    const processed = await processImage(browser, data, asset.mime, asset.redactions ?? []);
    asset.variants = [];
    for (const v of processed.variants) {
      const vf = `${ASSETS_DIR}/${asset.id}-${v.width}.webp`;
      await fs.writeFile(path.join(projectDir, vf), v.data);
      asset.variants.push({ width: v.width, file: vf });
    }
    const rf = `${ASSETS_DIR}/${asset.id}-redacted.png`;
    if (processed.redacted) {
      await fs.writeFile(path.join(projectDir, rf), processed.redacted);
      asset.redactedFile = rf;
    } else {
      await fs.rm(path.join(projectDir, rf), { force: true });
      delete asset.redactedFile;
    }
    delete asset.copiesStale;
    return { ok: true };
  } finally {
    await browsers.close();
  }
}

export function formatImportWorkResult(result: ImportWorkResult): string {
  if (result.error) return result.error;
  const lines: string[] = [];
  lines.push(`Imported ${result.imported.length} asset${result.imported.length === 1 ? '' : 's'} into "${result.project}".`);
  for (const i of result.imported) {
    const a = i.asset;
    const size = a.width && a.height ? `${a.width}×${a.height}` : a.mime;
    const widths = a.variants?.length ? `, WebP ${a.variants.map((v) => v.width).join('/')}` : '';
    lines.push(`- ${a.id}: ${size}${widths}, ${a.kind}${a.device ? ` (${a.device})` : ''}, from ${a.origin.kind} ${a.origin.from}${a.alt ? `, alt draft "${a.alt}"` : ', no alt text yet'}`);
    for (const w of i.warnings) lines.push(`  - ${w}`);
  }
  if (result.failed.length) {
    lines.push('', 'Not imported:');
    for (const f of result.failed) lines.push(`- ${f.source}: ${f.error}`);
  }
  if (result.steps.length) lines.push('', 'To do:', ...result.steps.map((s) => `- ${s}`));
  if (result.notes.length) lines.push('', ...result.notes);
  return lines.join('\n');
}
