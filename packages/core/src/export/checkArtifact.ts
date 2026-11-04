// The visual check (openspec add-visual-check, "artifact-visual-check"):
// renders a registered artifact in the export browser and returns what the
// agent needs to judge it — size-capped JPEG screenshots plus preflight
// findings — without writing any file or touching the manifest. Pages are
// checked at several viewports, card designs at their format size, and decks
// slide by slide. Host-agnostic: the VS Code tool, the MCP tool and the CLI
// all call checkArtifact().
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Browser, Page } from 'puppeteer-core';
import { readArtifact } from '../vendored/artifactCreate';
import type { JsonRecord } from '../vendored/artifactManifest';
import { openArtifactPage, type ArtifactPageSession } from './artifactPage';
import { VIRTUAL_CLOCK_SCRIPT } from './motion/virtualClock';
import { extractRootTokens, isStyleTileSkill, missingTileTokens } from '../generation/styleTiles';
import { findBrowser } from './browserDiscovery';
import { formatSavedCheckRun, saveCheckRun, type SavedCheckRun } from './checkHistory';
import { captureDeckSlides, countSlides, validateSlideNumbers } from './deck/captureDeck';
import { collectDiagramFindings, waitForDiagrams } from './diagramPageScripts';
import { EMAIL_MAX_WIDTH } from './inlineExport';
import { collectEmailFindings } from './inlinePageScripts';
import { findStaleSources, recordedSources } from '../generation/sourceNumberCheck';
import { indexCheckSlides, markCheckSlide } from './deck/pageScripts';
import { PRESENTER_CLONE_SELECTOR, SLIDE_SELECTOR } from './deck/selectors';
import { fitFindings, loadPage, type ExportErrorCode } from './exportArtifact';
import { usesWebgl, webglFindings } from './webgl';
import { captureReviewViews, composeReviewSheet, formatSceneEvidence, measureHero, probeScene, REVIEW_VIEWS, reviewUnavailableNote, sceneSpecFindings, type ReviewView, type SceneEvidence } from './sceneReview';
import { ELEMENT_LAYOUT_VIEWPORT, isValidDimension, resolveExportSize } from './exportSize';
import { getFormat, isFluidHtml } from '../poster/formats';
import { applyShape, collectHorizontalScroll, collectRunningMotion, collectStateTargets, collectTapTargets, compareStateStyles, fitBoundText, type ShapeCss, type StateLook } from '../poster/pageScripts';
import { formatPreflight, runPreflight, type Finding } from '../poster/preflight';
import { renderShapeSheetHtml, type ShapeThumbnail } from '../poster/shapeSheet';
import { isAppScreen, runScreenChecks } from './screenChecks';
import { deviceViewports, drawsOwnFrame, parseDevice } from '../preview/deviceShell';
import { hasDataBinds, resolveSampleData, sampleDataFindings, thinStaticTables } from './sampleData';
import { findBaseScreen } from '../generation/baseScreen';
import { redesignFindings } from './redesignChecks';
import { applyBrandChecks, loadOwnBrandContext } from './brandChecks';
import { BRAND_REVIEW_ATTR, brandReviewFindings } from './brandReview';
import { appDesignSystemStaleness, parseAppComponentsFile, tokenFindings } from '../generation/appDesignSystem';

export interface CheckViewport {
  name: string;
  width: number;
  height: number;
  /** Checked always, but its screenshot is attached only when it has findings (the tablet widths of app screens). */
  captureOnFindings?: boolean;
}

export const DEFAULT_CHECK_VIEWPORTS: readonly CheckViewport[] = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

/** App screens with no device are also checked at tablet widths. */
export const TABLET_CHECK_VIEWPORTS: readonly CheckViewport[] = [
  { name: 'tablet-1024', width: 1024, height: 768, captureOnFindings: true },
  { name: 'tablet-768', width: 768, height: 1024, captureOnFindings: true },
];

export interface CheckArtifactOptions {
  workspaceRoot: string;
  /** Workspace-relative path to the artifact's entry file. */
  entryPath: string;
  /** Pages without a card: the viewports to check (default desktop 1440×900 and mobile 390×844). */
  viewports?: CheckViewport[];
  /** Decks: 1-based slide numbers to check (default every slide). */
  slides?: number[];
  /** Screenshots to return, 0–6 (default 3). 0 returns findings only. */
  maxImages?: number;
  /** Explicit browser executable (setting/flag); falls back to discovery. */
  browserPath?: string;
  /** Resolves a manifest's sourceSkillId to that skill's aspect_hint (card designs). */
  lookupAspectHint?: (sourceSkillId: string) => Promise<string | undefined>;
  /** Upper bound for page load + font readiness, ms. Default 15000. */
  readyTimeoutMs?: number;
  /** Extra settle time after load for entrance animations, ms. Default 500. */
  settleMs?: number;
  /** The workspace's Open Design output directory, for resolving recorded sources. Default ".open-design". */
  outputDir?: string;
  /** Up to 6 times in seconds: also capture the artifact at those moments on a virtual clock (animations). */
  at?: number[];
  /** 3D pages exposing odScene handles: the review views on the sheet (default all four), or false for none. */
  views?: ReviewView[] | false;
  /** Save the run's images and findings under <outputDir>/.checks/ for the user (default true; openspec add-browser-preview). */
  saveRun?: boolean;
  /** Pages: also run the states pass (hover, focus), tap targets, reflow at 320 px and reduced motion (default true; openspec add-state-accessibility-checks). */
  states?: boolean;
  /** App screens: also fill a copy with long and extreme content (stress-overflow, stress-truncation). Default true (openspec add-states-board). */
  stress?: boolean;
}

export interface CheckImage {
  /** What the image shows, e.g. "mobile", "desktop 2/3", "slides 1–12". */
  label: string;
  mime: 'image/jpeg';
  data: Buffer;
  width: number;
  height: number;
}

export type CheckMode = 'page' | 'cards' | 'deck';

export type CheckArtifactResult =
  | {
      ok: true;
      mode: CheckMode;
      findings: Finding[];
      images: CheckImage[];
      /** Views that were rendered or could have been, but weren't returned because of maxImages. */
      omitted: string[];
      /** Slides in the deck (deck mode only). */
      slideCount?: number;
      /** The slides checked (deck mode only). */
      slidesChecked?: number[];
      /** The viewports checked (page mode only). */
      viewports?: CheckViewport[];
      /** 3D pages: the review views rendered, pixel metrics and renderer statistics, or why there are none. */
      scene3d?: SceneEvidence;
      warnings: string[];
      browserPath: string;
      /** Where the run's images and findings were saved, and the run before it. */
      savedRun?: SavedCheckRun;
    }
  | { ok: false; code: ExportErrorCode; error: string };

const CHECKABLE_RENDERERS = new Set(['html', 'deck-html', 'mini-app', 'svg', 'diagram']);
const CARD_SELECTOR = '[data-od-card]';
const SLIDE_CARD_SELECTOR = '[data-od-check-slide]';
/** Longer edges are downsampled by vision models anyway. */
export const MAX_IMAGE_EDGE = 1568;
const JPEG_QUALITY = 80;
const DEFAULT_MAX_IMAGES = 3;
/** Diagrams are wide by nature: checked at desktop width only unless viewports are given. */
const DIAGRAM_VIEWPORTS: readonly CheckViewport[] = [{ name: 'desktop', width: 1440, height: 900 }];
const DIAGRAM_READY_MS = 3000;
const MAX_IMAGES_CAP = 6;
const MAX_VIEWPORTS = 4;
/** Screens considered below the first one, per viewport. */
const MAX_TILES_PER_VIEWPORT = 8;
const SHEET_SLIDES = 12;
/** Viewports up to this wide get horizontal-scroll as an error, wider ones as a warning. */
const PHONE_MAX_WIDTH = 480;
/** States pass: at most this many interactive elements get :hover and :focus-visible forced. */
const MAX_STATE_TARGETS = 60;
/** WCAG 1.4.10 Reflow: content must work at 320 CSS px wide. */
const REFLOW_WIDTH = 320;
const REFLOW_HEIGHT = 800;
/** Reduced motion: wait this long after load, then report motion longer than REDUCED_MOTION_MIN_MS still running. */
const REDUCED_MOTION_WAIT_MS = 500;
const REDUCED_MOTION_MIN_MS = 200;
/** State-check findings are grouped per code, listing this many selectors. */
const GROUP_SELECTORS = 5;
const STATE_CODES = new Set(['state-contrast', 'focus-visible', 'tap-target', 'reflow', 'reduced-motion']);

function fail(code: ExportErrorCode, error: string): CheckArtifactResult {
  return { ok: false, code, error };
}

function validateOptions(o: CheckArtifactOptions): string | undefined {
  if (o.maxImages !== undefined && !(Number.isInteger(o.maxImages) && o.maxImages >= 0 && o.maxImages <= MAX_IMAGES_CAP)) {
    return `maxImages must be an integer between 0 and ${MAX_IMAGES_CAP}.`;
  }
  if (o.states !== undefined && typeof o.states !== 'boolean') return 'states must be true or false.';
  if (o.slides !== undefined && (!Array.isArray(o.slides) || o.slides.length === 0 || !o.slides.every((n) => Number.isInteger(n) && n >= 1))) {
    return 'slides must be a non-empty list of 1-based slide numbers.';
  }
  if (o.at !== undefined && (!Array.isArray(o.at) || o.at.length === 0 || o.at.length > 6 || !o.at.every((t) => typeof t === 'number' && t >= 0 && t <= 60))) {
    return 'at must list 1–6 times in seconds, each between 0 and 60.';
  }
  if (o.views !== undefined && o.views !== false) {
    if (!Array.isArray(o.views) || o.views.length === 0 || o.views.length > REVIEW_VIEWS.length) return `views must list 1–${REVIEW_VIEWS.length} of ${REVIEW_VIEWS.join(', ')}, or be false.`;
    const unknown = o.views.filter((v) => !(REVIEW_VIEWS as readonly string[]).includes(v));
    if (unknown.length > 0) return `Unknown view(s): ${unknown.join(', ')}. Use ${REVIEW_VIEWS.join(', ')}.`;
    if (new Set(o.views).size !== o.views.length) return 'views must not repeat a view.';
  }
  if (o.viewports !== undefined) {
    if (!Array.isArray(o.viewports) || o.viewports.length === 0 || o.viewports.length > MAX_VIEWPORTS) return `viewports must list 1–${MAX_VIEWPORTS} viewports.`;
    const names = new Set<string>();
    for (const v of o.viewports) {
      if (!v || typeof v.name !== 'string' || v.name.trim() === '') return 'Each viewport needs a name.';
      if (!isValidDimension(v.width) || !isValidDimension(v.height)) return `Viewport "${v.name}": width and height must be integers between 16 and 8192.`;
      if (names.has(v.name)) return `Viewport name "${v.name}" is used twice.`;
      names.add(v.name);
    }
  }
  return undefined;
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Downscales (never upscales) a PNG to a long edge of at most MAX_IMAGE_EDGE and re-encodes it as JPEG, in the same browser. */
async function toCheckImage(browser: Browser, label: string, png: Buffer): Promise<CheckImage> {
  const src = pngSize(png);
  const k = Math.min(1, MAX_IMAGE_EDGE / Math.max(src.width, src.height));
  const width = Math.max(1, Math.round(src.width * k));
  const height = Math.max(1, Math.round(src.height * k));
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#fff"><img src="data:image/png;base64,${png.toString('base64')}" style="display:block;width:${width}px;height:${height}px"></body></html>`,
      { waitUntil: 'load' },
    );
    const data = Buffer.from(await page.screenshot({ type: 'jpeg', quality: JPEG_QUALITY, clip: { x: 0, y: 0, width, height } }));
    return { label, mime: 'image/jpeg', data, width, height };
  } finally {
    await page.close();
  }
}

/** The shape sheet's layout (labels, red dots for errors), cropped to its content so thumbnails stay as large as possible. */
async function composeSheet(browser: Browser, thumbnails: ShapeThumbnail[]): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 2448, height: 600, deviceScaleFactor: 1 });
    await page.setContent(renderShapeSheetHtml(thumbnails), { waitUntil: 'load' });
    const body = await page.$('body');
    return Buffer.from(await body!.screenshot({ type: 'png' }));
  } finally {
    await page.close();
  }
}

async function settle(page: Page, ms = 150): Promise<void> {
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

/** Failed loads, as findings, so the agent sees them with everything else to fix. */
function brokenAssetFindings(warnings: string[]): Finding[] {
  return warnings.filter((w) => w.startsWith('Failed to load: ')).map((w) => ({ check: 'broken-asset', severity: 'warning' as const, message: w.slice('Failed to load: '.length) }));
}

export async function checkArtifact(options: CheckArtifactOptions): Promise<CheckArtifactResult> {
  const result = await runCheck(options);
  if (!result.ok || options.saveRun === false) return result;
  try {
    const entryPath = path.relative(options.workspaceRoot, path.resolve(options.workspaceRoot, options.entryPath)).split(path.sep).join('/');
    result.savedRun = await saveCheckRun(options.workspaceRoot, options.outputDir ?? '.open-design', entryPath, result);
  } catch (err) {
    result.warnings.push(`The check's screenshots couldn't be saved for the user: ${err instanceof Error ? err.message : String(err)}`);
  }
  return result;
}

async function runCheck(options: CheckArtifactOptions): Promise<CheckArtifactResult> {
  const invalid = validateOptions(options);
  if (invalid) return fail('invalid-args', invalid);

  let artifact;
  try {
    artifact = await readArtifact({ workspaceRoot: options.workspaceRoot, entryPath: options.entryPath });
  } catch (err) {
    return fail('invalid-args', err instanceof Error ? err.message : String(err));
  }
  if (!artifact) return fail('not-found', `No artifact entry file found at ${options.entryPath}.`);
  if (!artifact.manifest) {
    return fail('not-registered', `${options.entryPath} exists but isn't registered (no .artifact.json sidecar). Call register_open_design_artifact first.`);
  }
  const manifest = artifact.manifest;
  const renderer = typeof manifest.renderer === 'string' ? manifest.renderer : 'html';
  if (!CHECKABLE_RENDERERS.has(renderer)) {
    return fail('unsupported-kind', `Artifacts rendered as "${renderer}" can't be checked visually — only HTML-based artifacts (html, deck-html, mini-app, svg, diagram).`);
  }
  const kind = typeof manifest.kind === 'string' ? manifest.kind : undefined;
  const sourceSkillId = typeof manifest.sourceSkillId === 'string' ? manifest.sourceSkillId : undefined;
  const maxImages = options.maxImages ?? DEFAULT_MAX_IMAGES;
  const isDiagram = renderer === 'diagram' || /\bdata-od-diagram\b/.test(artifact.entryContent);
  // A device screen is checked at its device's size; other app screens at tablet widths too (openspec add-platform-shells).
  const device = isDiagram ? undefined : parseDevice(artifact.entryContent);
  const viewports =
    options.viewports ??
    (isDiagram
      ? [...DIAGRAM_VIEWPORTS]
      : device
        ? deviceViewports(device)
        : isAppScreen(sourceSkillId, artifact.entryContent)
          ? [...DEFAULT_CHECK_VIEWPORTS, ...TABLET_CHECK_VIEWPORTS]
          : [...DEFAULT_CHECK_VIEWPORTS]);
  const deviceFindings: Finding[] = drawsOwnFrame(artifact.entryContent)
    ? [
        {
          check: 'device-double-frame',
          severity: 'warning',
          message: `The page sets data-od-device="${device?.device}", so the kit draws the frame, status bar and home indicator around it; the page draws its own too. Remove the page's frame, status bar, notch or title bar and keep only the app.`,
        },
      ]
    : [];
  // Sample data (openspec add-sample-data): binds that miss, thin lists, fewer items than the brief promised.
  const appForData = isAppScreen(sourceSkillId, artifact.entryContent);
  const dataFindings: Finding[] = [];
  if (hasDataBinds(artifact.entryContent)) {
    const absRoot = path.resolve(options.workspaceRoot);
    const applied = await resolveSampleData(artifact.entryContent, path.resolve(absRoot, options.entryPath), absRoot);
    dataFindings.push(...sampleDataFindings(applied, promisedTexts(manifest)));
  }
  if (appForData && !isDiagram) dataFindings.push(...thinStaticTables(artifact.entryContent));
  dataFindings.push(...redesignFindings(artifact.entryContent));
  const recorded = recordedSources(manifest);
  const stale = recorded.length > 0 ? await findStaleSources(options.workspaceRoot, options.outputDir ?? '.open-design', recorded) : [];
  // Style tiles must declare the design-token contract, so a chosen tile saves as a design system with no loss.
  const tileFindings: Finding[] =
    isStyleTileSkill(sourceSkillId) || /\bdata-od-style-tile\b/.test(artifact.entryContent)
      ? missingTileTokens(extractRootTokens(artifact.entryContent)).map((name) => ({
          check: 'token-missing',
          severity: 'error' as const,
          message: `The tile's :root doesn't declare ${name}, which the design-token contract requires. Add it, and style the tile through it.`,
          selector: name,
        }))
      : [];
  const staleFindings: Finding[] =
    stale.length > 0
      ? [
          {
            check: 'stale-sources',
            severity: 'info',
            message: `Sources changed since this was made: ${stale.map((s) => `${s.path} (${s.reason})`).join(', ')}. Offer to update it.`,
          },
        ]
      : [];

  // Designs on the person's own brand: palette, font and logo checks (openspec connect-brand-design-systems).
  const ownBrand = await loadOwnBrandContext(options.workspaceRoot, options.outputDir ?? '.open-design', typeof manifest.designSystemId === 'string' ? manifest.designSystemId : undefined);

  const browser = await findBrowser({ explicitPath: options.browserPath });
  if (!browser.ok) return fail('no-browser', browser.message);

  const warnings: string[] = [];
  const relEntry = path.relative(options.workspaceRoot, path.resolve(options.workspaceRoot, options.entryPath));
  let session: ArtifactPageSession | undefined;
  let timed: CheckImage[] = [];
  try {
    if (options.at && maxImages > 0) timed = await captureAtTimes(options, browser.executablePath, viewports[0], warnings);
    session = await openArtifactPage({ workspaceRoot: options.workspaceRoot, relEntry, executablePath: browser.executablePath });
    const { browser: instance, page } = session;
    await page.setViewport({ width: viewports[0].width, height: viewports[0].height, deviceScaleFactor: 1 });
    await loadPage(page, session.url, options.readyTimeoutMs ?? 15000, options.settleMs ?? 500, warnings);
    // A 3D scene that couldn't get a WebGL context, or rendered nothing.
    const webgl = usesWebgl(artifact.entryContent) ? await webglFindings(page, warnings) : [];
    // A 3D scene with odScene handles also gets review views (add-3d-critic-loop).
    const probe = usesWebgl(artifact.entryContent) && options.views !== false ? await probeScene(page) : undefined;
    const reviewable = probe !== undefined && reviewUnavailableNote(probe) === undefined;

    const slideCount = await countSlides(page);
    const isDeck = kind === 'deck' || renderer === 'deck-html' || (slideCount >= 2 && (sourceSkillId ?? '').startsWith('od:deck:'));
    if (options.slides !== undefined && !isDeck) return fail('invalid-args', "slides applies to decks, and this artifact isn't one.");
    const branded = async <T extends { findings: Finding[] }>(mode: CheckMode, out: T): Promise<T> => {
      if (!ownBrand) return out;
      try {
        if (mode === 'page') {
          await page.setViewport({ width: viewports[0].width, height: viewports[0].height, deviceScaleFactor: 1 });
          await page.evaluate('window.scrollTo(0, 0)');
        }
        out.findings = await applyBrandChecks(page, ownBrand, out.findings, mode);
      } catch (err) {
        warnings.push(`The brand checks didn't run: ${err instanceof Error ? err.message : String(err)}`);
      }
      return out;
    };
    const done = (mode: CheckMode, out: { findings: Finding[]; images: CheckImage[]; omitted: string[]; slidesChecked?: number[]; scene3d?: SceneEvidence }): CheckArtifactResult => {
      // Timestamped captures (`at`) come first and share the image budget with the regular ones.
      const images = timed.length > 0 ? [...timed, ...out.images].slice(0, maxImages) : out.images;
      const dropped = timed.length > 0 ? [...timed, ...out.images].slice(maxImages).map((i) => i.label) : [];
      return {
      viewports: mode === 'page' ? viewports : undefined,
      ok: true,
      mode,
      findings: [...tileFindings, ...deviceFindings, ...dataFindings, ...webgl, ...sceneSpecFindings(artifact.entryContent, sourceSkillId), ...out.findings, ...brokenAssetFindings(warnings), ...staleFindings],
      images,
      omitted: [...out.omitted, ...dropped],
      slideCount: mode === 'deck' ? slideCount : undefined,
      slidesChecked: out.slidesChecked,
      scene3d: out.scene3d,
      warnings,
      browserPath: browser.executablePath,
      };
    };

    if (isDeck && slideCount > 0) {
      const slideError = validateSlideNumbers(options.slides, slideCount);
      if (slideError) return fail('invalid-args', slideError);
      return done('deck', await branded('deck', await checkDeck(instance, page, slideCount, options.slides, maxImages, warnings)));
    }
    if (isDeck) warnings.push(`No slide elements (${SLIDE_SELECTOR}) were found, so the deck was checked as a single page.`);

    const cardCount = (await page.$$(CARD_SELECTOR)).length;
    if (cardCount > 0) {
      if (options.viewports !== undefined) warnings.push('viewports apply to pages without a [data-od-card]; this design was checked at its card size instead.');
      const aspectHint = sourceSkillId && options.lookupAspectHint ? await options.lookupAspectHint(sourceSkillId) : undefined;
      return done('cards', await branded('cards', await checkCards(instance, page, artifact.entryContent, manifest, aspectHint, sourceSkillId, maxImages)));
    }
    // The review sheet goes second, after the first viewport's first screen; other screens fill the rest of the budget.
    const sheetSlot = reviewable && maxImages > 0 ? 1 : 0;
    // App screens with state frames get a states board, placed second (openspec add-states-board).
    const appScreen = !isDiagram && isAppScreen(sourceSkillId, artifact.entryContent);
    const stateFrameCount = (artifact.entryContent.match(/\bdata-od-state\s*=/g) ?? []).length;
    const boardSlot = appScreen && stateFrameCount > 1 && maxImages - sheetSlot > 1 ? 1 : 0;
    const stateChecks = options.states !== false && !isDiagram ? { url: session.url, readyTimeoutMs: options.readyTimeoutMs ?? 15000, scripted: /requestAnimationFrame/.test(artifact.entryContent) } : undefined;
    const result: { findings: Finding[]; images: CheckImage[]; omitted: string[]; scene3d?: SceneEvidence } = await checkPage(instance, page, viewports, maxImages - sheetSlot - boardSlot, isDiagram, stateChecks, warnings);
    if (appScreen) {
      await page.setViewport({ width: viewports[0].width, height: viewports[0].height, deviceScaleFactor: 1 });
      await page.evaluate('window.scrollTo(0, 0)');
      await settle(page);
      const screen = await runScreenChecks(
        instance,
        page,
        viewports,
        {
          preflight: async (p, viewport) =>
            (await runPreflight(p, { cardSelector: CARD_SELECTOR, viewport })).filter((f) => !(f.check === 'overflow' && / (extends outside|runs past the edge of) the card/.test(f.message))),
          horizontalScroll: async (p) => (await p.evaluate(collectHorizontalScroll, PHONE_MAX_WIDTH)) as Finding[],
          settle,
        },
        { appScreen, stress: options.stress !== false, baseline: result.findings },
      );
      result.findings.push(...mergeAcrossViewports(screen.findings));
      if (screen.shots.length > 1) {
        const label = `states: ${screen.states.join(', ')}`;
        if (boardSlot > 0) result.images.splice(Math.min(1, result.images.length), 0, await toCheckImage(instance, label, await composeReviewSheet(instance, screen.shots)));
        else result.omitted.push(label);
      }
    }
    if (probe && reviewable) {
      await page.setViewport({ width: viewports[0].width, height: viewports[0].height, deviceScaleFactor: 1 });
      await page.evaluate('window.scrollTo(0, 0)');
      await settle(page);
      const review = await captureReviewViews(page, probe, options.views || REVIEW_VIEWS);
      result.findings.push(...review.findings);
      result.scene3d = review.evidence;
      // The hero still as the page frames it, per viewport (improve-3d-light-and-framing).
      const hero = await measureHero(page, viewports);
      result.findings.push(...hero.findings);
      if (hero.lines.length > 0) result.scene3d = { ...result.scene3d, hero: hero.lines };
      if (review.shots.length > 0 && sheetSlot > 0) {
        const label = `3d views: ${review.shots.map((s) => s.label).join(', ')}`;
        result.images.splice(Math.min(1, result.images.length), 0, await toCheckImage(instance, label, await composeReviewSheet(instance, review.shots)));
      }
    } else if (probe) {
      result.scene3d = { views: [], note: reviewUnavailableNote(probe), tier: probe.tier };
    }
    // Designs on a design system saved from an app: token findings (openspec add-design-from-app).
    result.findings.push(...(await appTokenFindings(options.workspaceRoot, options.outputDir ?? '.open-design', manifest, artifact.entryContent)));
    // A redesign's base screen, beside the new design, second (openspec add-design-from-app).
    const basePath = maxImages > 0 ? await findBaseScreen(options.workspaceRoot, options.outputDir ?? '.open-design', options.entryPath) : undefined;
    if (basePath) {
      await page.setViewport({ width: viewports[0].width, height: viewports[0].height, deviceScaleFactor: 1 });
      await page.evaluate('window.scrollTo(0, 0)');
      await settle(page);
      const now = Buffer.from(await page.screenshot({ type: 'png' }));
      const before = await fs.readFile(path.join(options.workspaceRoot, basePath));
      const label = `base vs new (${basePath})`;
      result.images.splice(Math.min(1, result.images.length), 0, await toCheckImage(instance, label, await composeReviewSheet(instance, [{ label: 'base (now)', png: before }, { label: 'new', png: now }])));
      while (result.images.length > maxImages) result.omitted.push(result.images.pop()!.label);
    }
    if (/\bdata-od-email\b/.test(artifact.entryContent)) {
      // Email artifacts (a [data-od-email] column root): the email rules too, measured at a wide client width (local images are a note here; export enforces baseUrl).
      await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
      result.findings.push(...((await page.evaluate(collectEmailFindings, { maxWidth: EMAIL_MAX_WIDTH, hasBaseUrl: false, checkOnly: true })) as Finding[]));
    }
    if (artifact.entryContent.includes(BRAND_REVIEW_ATTR)) {
      // A design system review: the sample against the site's measurements (openspec connect-brand-design-systems).
      await page.setViewport({ width: viewports[0].width, height: viewports[0].height, deviceScaleFactor: 1 });
      result.findings.push(...(await brandReviewFindings(page, options.workspaceRoot, options.entryPath, artifact.entryContent, warnings)));
    }
    return done('page', await branded('page', result));
  } catch (err) {
    return fail('capture-failed', `Check failed using ${browser.executablePath}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await session?.close();
  }
}

/** token-undefined, token-hardcoded and app-design-system-stale for a design on a user design system saved from an app. */
async function appTokenFindings(workspaceRoot: string, outputDir: string, manifest: JsonRecord, html: string): Promise<Finding[]> {
  const id = typeof manifest.designSystemId === 'string' ? manifest.designSystemId : undefined;
  if (!id?.startsWith('user:')) return [];
  const dir = path.join(workspaceRoot, outputDir, 'design-systems', id.slice('user:'.length));
  const file = parseAppComponentsFile(await fs.readFile(path.join(dir, 'components.json'), 'utf8').catch(() => undefined));
  if (!file) return [];
  const tokensCss = await fs.readFile(path.join(dir, 'tokens.css'), 'utf8').catch(() => '');
  return [...tokenFindings(html, file.tokens, tokensCss), ...(await appDesignSystemStaleness(workspaceRoot, id, file))];
}

/** Captures the first viewport (or the card) at each time in `at` on the virtual clock, labelled t=<seconds>s. */
async function captureAtTimes(options: CheckArtifactOptions, executablePath: string, viewport: CheckViewport, warnings: string[]): Promise<CheckImage[]> {
  const relEntry = path.relative(options.workspaceRoot, path.resolve(options.workspaceRoot, options.entryPath));
  const session = await openArtifactPage({ workspaceRoot: options.workspaceRoot, relEntry, executablePath });
  try {
    const { browser, page } = session;
    await page.evaluateOnNewDocument(VIRTUAL_CLOCK_SCRIPT);
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    // Timed captures follow the scene's own clock, turntable included.
    await loadPage(page, session.url, options.readyTimeoutMs ?? 15000, options.settleMs ?? 300, warnings, { still: false });
    const card = await page.$(CARD_SELECTOR);
    const box = card ? await card.boundingBox() : null;
    const clip = box && box.width >= 1 && box.height >= 1 ? { x: box.x, y: box.y, width: box.width, height: box.height } : undefined;
    const images: CheckImage[] = [];
    for (const t of [...options.at!].sort((a, b) => a - b)) {
      await page.evaluate(`window.__odClock.advanceTo(${t * 1000})`);
      await page.evaluate('window.__odClock.painted()');
      const png = Buffer.from(await page.screenshot({ type: 'png', ...(clip ? { clip } : {}) }));
      images.push(await toCheckImage(browser, `t=${t}s`, png));
    }
    return images;
  } finally {
    await session.close();
  }
}

interface StateCheckOptions {
  url: string;
  readyTimeoutMs: number;
  /** The entry calls requestAnimationFrame, so a reduced-motion render is worth it even with no CSS animation running. */
  scripted: boolean;
}

/**
 * Every viewport: preflight + horizontal-scroll (and tap-target at phone widths), its first screen; then the state
 * checks (states pass, reflow, reduced motion), whose error crops come before further screens down the page.
 */
async function checkPage(
  browser: Browser,
  page: Page,
  viewports: CheckViewport[],
  maxImages: number,
  diagram = false,
  states?: StateCheckOptions,
  warnings: string[] = [],
): Promise<{ findings: Finding[]; images: CheckImage[]; omitted: string[] }> {
  const findings: Finding[] = [];
  const screens: Array<{ viewport: CheckViewport; tops: number[] }> = [];
  const images: CheckImage[] = [];
  const omitted: string[] = [];
  const label = (v: CheckViewport, i: number, n: number): string => (n > 1 ? `${v.name} ${i + 1}/${n}` : v.name);
  const shootAt = async (v: CheckViewport, top: number): Promise<Buffer> => {
    await page.evaluate(`window.scrollTo(0, ${top})`);
    await settle(page, 100);
    return Buffer.from(await page.screenshot({ type: 'png' }));
  };
  const useViewport = async (v: CheckViewport): Promise<void> => {
    await page.setViewport({ width: v.width, height: v.height, deviceScaleFactor: 1 });
    await page.evaluate('window.scrollTo(0, 0)');
    await settle(page);
  };

  // Pass 1: checks and first screens, in viewport order (the first screens are the most important images).
  for (const [i, v] of viewports.entries()) {
    if (i > 0) await useViewport(v);
    // With no card, preflight measures against <body>: "outside the card" there is either sideways scroll
    // (reported better by horizontal-scroll, which names the cause) or content below a fixed-height body.
    if (diagram) await page.evaluate(waitForDiagrams, DIAGRAM_READY_MS);
    const preflight = await runPreflight(page, { cardSelector: CARD_SELECTOR, viewport: v.name });
    if (diagram) for (const f of (await page.evaluate(collectDiagramFindings)) as Finding[]) findings.push({ ...f, viewport: v.name });
    findings.push(...preflight.filter((f) => !(f.check === 'overflow' && / (extends outside|runs past the edge of) the card/.test(f.message))));
    for (const f of (await page.evaluate(collectHorizontalScroll, PHONE_MAX_WIDTH)) as Finding[]) findings.push({ ...f, viewport: v.name });
    if (states && v.width <= PHONE_MAX_WIDTH) for (const f of (await page.evaluate(collectTapTargets)) as Finding[]) findings.push({ ...f, viewport: v.name });
    const pageHeight = Number(await page.evaluate('Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)'));
    const count = Math.min(1 + MAX_TILES_PER_VIEWPORT, Math.max(1, Math.ceil(pageHeight / v.height)));
    const tops = Array.from({ length: count }, (_, k) => Math.min(k * v.height, Math.max(0, pageHeight - v.height)));
    if (v.captureOnFindings && !findings.some((f) => f.viewport === v.name)) continue;
    screens.push({ viewport: v, tops: v.captureOnFindings ? [0] : tops });
    if (images.length < maxImages) images.push(await toCheckImage(browser, label(v, 0, v.captureOnFindings ? 1 : count), await shootAt(v, 0)));
    else omitted.push(label(v, 0, v.captureOnFindings ? 1 : count));
  }

  let current: CheckViewport | undefined = viewports[viewports.length - 1];
  if (states) {
    const shoot = async (label: string, take: () => Promise<Buffer>): Promise<void> => {
      if (images.length < maxImages) images.push(await toCheckImage(browser, label, await take()));
      else omitted.push(label);
    };
    const desktop = viewports.find((v) => v.width > PHONE_MAX_WIDTH) ?? viewports[0];
    await useViewport(desktop);
    findings.push(...(await statesPass(page, desktop, shoot, warnings)));
    findings.push(...(await reflowPass(page, findings, shoot)));
    findings.push(...(await reducedMotionPass(browser, page, desktop, states)));
    current = undefined;
  }

  // Pass 2: further screens, round-robin across viewports, while the image budget lasts.
  const extras: Array<{ s: (typeof screens)[number]; k: number }> = [];
  for (let k = 1; k <= MAX_TILES_PER_VIEWPORT; k++) for (const s of screens) if (k < s.tops.length) extras.push({ s, k });
  for (const { s, k } of extras) {
    const name = label(s.viewport, k, s.tops.length);
    if (images.length >= maxImages) {
      omitted.push(name);
      continue;
    }
    if (current !== s.viewport) {
      await useViewport(s.viewport);
      current = s.viewport;
    }
    images.push(await toCheckImage(browser, name, await shootAt(s.viewport, s.tops[k])));
  }
  return { findings: mergeAcrossViewports(groupStateFindings(findings)), images, omitted };
}

/**
 * Forces :hover, then :focus + :focus-visible, on up to MAX_STATE_TARGETS interactive elements through CDP
 * (CSS.forcePseudoState: no events, so computed styles can be read directly), with transitions off so each
 * read is the end state. One crop of the first element with no focus indicator, while it's forced.
 */
async function statesPass(page: Page, viewport: CheckViewport, shoot: (label: string, take: () => Promise<Buffer>) => Promise<void>, warnings: string[]): Promise<Finding[]> {
  const names = (await page.evaluate(collectStateTargets, MAX_STATE_TARGETS)) as string[];
  if (names.length === 0) return [];
  const findings: Finding[] = [];
  const noTransitions = await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
  let cdp: Awaited<ReturnType<Page['createCDPSession']>> | undefined;
  try {
    cdp = await page.createCDPSession();
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-od-state-target]' });
    const force = async (classes: string[]): Promise<void> => {
      for (const nodeId of nodeIds) await cdp!.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: classes });
      await settle(page, 0);
    };
    const base = (await page.evaluate(compareStateStyles, 'default', null)) as { looks: StateLook[] };
    let skipped = 0;
    for (const [state, classes] of [['hover', ['hover']], ['focus-visible', ['focus', 'focus-visible']]] as const) {
      await force([...classes]);
      const run = (await page.evaluate(compareStateStyles, state, base.looks)) as { findings: Finding[]; skipped: number };
      skipped += run.skipped;
      findings.push(...run.findings.map((f) => ({ ...f, viewport: viewport.name })));
      const firstMissing = run.findings.findIndex((f) => f.check === 'focus-visible');
      if (firstMissing >= 0) {
        const index = names.indexOf(run.findings[firstMissing].selector ?? '');
        const handle = index >= 0 ? await page.$(`[data-od-state-target="${index}"]`) : null;
        if (handle) {
          await handle.evaluate((el) => (el as unknown as { scrollIntoView(o: object): void }).scrollIntoView({ block: 'center' }));
          await shoot(`focus: ${run.findings[firstMissing].selector}`, async () => Buffer.from(await handle.screenshot({ type: 'png' })));
        }
      }
      await force([]);
    }
    if (skipped > 0) findings.push({ check: 'state-contrast', severity: 'info', message: `Contrast in hover and focus states not checked for ${skipped} element(s) on gradient, image or translucent backgrounds — check those by eye.` });
  } catch (err) {
    warnings.push(`The hover and focus checks were skipped: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await cdp?.detach().catch(() => undefined);
    await noTransitions.evaluate((el) => (el as unknown as { remove(): void }).remove());
    await page.evaluate("document.querySelectorAll('[data-od-state-target]').forEach((el) => el.removeAttribute('data-od-state-target'))");
    await page.evaluate('window.scrollTo(0, 0)');
  }
  return findings;
}

/** Reflow (WCAG 1.4.10): one render at 320 CSS px; sideways scroll or clipped text there is an error. Skips what the phone viewport already reported. */
async function reflowPass(page: Page, earlier: Finding[], shoot: (label: string, take: () => Promise<Buffer>) => Promise<void>): Promise<Finding[]> {
  await page.setViewport({ width: REFLOW_WIDTH, height: REFLOW_HEIGHT, deviceScaleFactor: 1 });
  await page.evaluate('window.scrollTo(0, 0)');
  await settle(page);
  const findings: Finding[] = [];
  const scrolledOnPhone = earlier.some((f) => f.check === 'horizontal-scroll' && f.severity === 'error');
  if (!scrolledOnPhone) {
    for (const f of (await page.evaluate(collectHorizontalScroll, PHONE_MAX_WIDTH)) as Finding[]) {
      findings.push({ ...f, check: 'reflow', severity: 'error', message: `At ${REFLOW_WIDTH}px wide (WCAG reflow, a phone with large text or a zoomed window): ${f.message}` });
    }
  }
  const clippedBefore = new Set(earlier.filter((f) => f.check === 'overflow').map((f) => f.selector));
  const clipped = (await runPreflight(page, { cardSelector: CARD_SELECTOR })).filter(
    (f) => f.check === 'overflow' && f.selector !== undefined && !/ (extends outside|runs past the edge of) the card/.test(f.message) && !clippedBefore.has(f.selector),
  );
  for (const f of clipped) findings.push({ ...f, check: 'reflow', severity: 'error', message: `At ${REFLOW_WIDTH}px wide (WCAG reflow), ${f.message}` });
  if (findings.length > 0) await shoot(`reflow ${REFLOW_WIDTH}px`, async () => Buffer.from(await page.screenshot({ type: 'png' })));
  return findings.map((f) => ({ ...f, viewport: `${REFLOW_WIDTH}px` }));
}

/** Reduced motion: when the page animates, one more render with prefers-reduced-motion: reduce emulated, in a second tab. */
async function reducedMotionPass(browser: Browser, page: Page, viewport: CheckViewport, states: StateCheckOptions): Promise<Finding[]> {
  const animating = Number(await page.evaluate('document.getAnimations ? document.getAnimations().length : 0')) > 0;
  if (!animating && !states.scripted) return [];
  const reduced = await browser.newPage();
  try {
    await reduced.evaluateOnNewDocument('globalThis.__name = globalThis.__name || ((fn) => fn)');
    await reduced.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await reduced.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    await reduced.goto(states.url, { waitUntil: 'load', timeout: states.readyTimeoutMs }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, REDUCED_MOTION_WAIT_MS));
    return ((await reduced.evaluate(collectRunningMotion, REDUCED_MOTION_MIN_MS)) as Finding[]).map((f) => ({ ...f, viewport: viewport.name }));
  } finally {
    await reduced.close();
  }
}

/** The state checks can fire on dozens of links at once: one finding per code, severity and viewport, listing GROUP_SELECTORS selectors and the count. */
function groupStateFindings(findings: Finding[]): Finding[] {
  const groups = new Map<string, Finding[]>();
  const out: Array<Finding | string> = [];
  for (const f of findings) {
    if (!STATE_CODES.has(f.check) || f.severity === 'info') {
      out.push(f);
      continue;
    }
    const key = `${f.check}|${f.severity}|${f.viewport ?? ''}`;
    const list = groups.get(key);
    if (list) list.push(f);
    else {
      groups.set(key, [f]);
      out.push(key);
    }
  }
  return out.map((entry) => {
    if (typeof entry !== 'string') return entry;
    const list = groups.get(entry)!;
    if (list.length === 1) return list[0];
    const names = list.map((f) => f.selector ?? '').filter(Boolean);
    const more = names.length > GROUP_SELECTORS ? ` and ${names.length - GROUP_SELECTORS} more` : '';
    return { ...list[0], message: `${list.length} elements: ${names.slice(0, GROUP_SELECTORS).join('; ')}${more}. The first: ${list[0].message}` };
  });
}

/** The same finding at several viewports is reported once, tagged with every viewport it appears at. */
function mergeAcrossViewports(findings: Finding[]): Finding[] {
  const byKey = new Map<string, Finding>();
  const out: Finding[] = [];
  for (const f of findings) {
    const key = `${f.check}|${f.severity}|${f.state ?? ''}|${f.message}`;
    const seen = byKey.get(key);
    if (seen && f.viewport && seen.viewport && !seen.viewport.split(', ').includes(f.viewport)) seen.viewport += `, ${f.viewport}`;
    else if (!seen) {
      const copy = { ...f };
      byKey.set(key, copy);
      out.push(copy);
    }
  }
  return out;
}

/** Card designs: each card at its format size (as export lays it out), one image or a contact sheet of all cards. */
async function checkCards(
  browser: Browser,
  page: Page,
  entryContent: string,
  manifest: JsonRecord,
  aspectHint: string | undefined,
  sourceSkillId: string | undefined,
  maxImages: number,
): Promise<{ findings: Finding[]; images: CheckImage[]; omitted: string[] }> {
  const fluid = isFluidHtml(entryContent);
  const recordedId = manifest.metadata && typeof manifest.metadata === 'object' ? (manifest.metadata as JsonRecord).format : undefined;
  const canvas = typeof recordedId === 'string' ? getFormat(recordedId) : undefined;
  const bleed = canvas?.medium === 'print' ? (canvas.bleed ?? 0) : undefined;
  const size = resolveExportSize({ aspectHint, sourceSkillId, selector: CARD_SELECTOR, canvas: canvas ? { format: canvas, source: 'recorded-format', bleed } : undefined });
  // Same roomy layout viewport as export, so a preview wrapper can't squeeze a fixed-size card.
  const layout =
    canvas?.medium === 'screen'
      ? { width: Math.max(Math.ceil(size.viewport.width * 1.25), ELEMENT_LAYOUT_VIEWPORT.width), height: Math.max(size.viewport.height, ELEMENT_LAYOUT_VIEWPORT.height) }
      : size.viewport;
  await page.setViewport({ width: layout.width, height: layout.height, deviceScaleFactor: 1 });
  if (fluid && canvas) {
    const unit = canvas.medium === 'print' ? 'mm' : 'px';
    const shape: ShapeCss = { widthCss: `${canvas.width}${unit}`, heightCss: `${canvas.height}${unit}`, bleedCss: `${bleed ?? 0}mm` };
    await page.evaluate(applyShape, CARD_SELECTOR, shape);
  }
  await settle(page);

  const findings = [...fitFindings(await page.evaluate(fitBoundText, CARD_SELECTOR)), ...(await runPreflight(page, { cardSelector: CARD_SELECTOR, format: canvas, bleed, fluid }))];
  const handles = await page.$$(CARD_SELECTOR);
  const label = handles.length > 1 ? `cards 1–${handles.length}` : canvas ? canvas.label : 'card';
  if (maxImages === 0) return { findings, images: [], omitted: [label] };

  const thumbnails: ShapeThumbnail[] = [];
  for (const [i, handle] of handles.entries()) {
    const box = await handle.boundingBox();
    if (!box || box.width < 1 || box.height < 1) continue;
    const errors = findings.filter((f) => f.severity === 'error' && (handles.length > 1 ? f.card === i + 1 : true)).length;
    thumbnails.push({ label: `Card ${i + 1}`, png: Buffer.from(await handle.screenshot({ type: 'png' })), errors });
  }
  if (thumbnails.length === 0) return { findings, images: [], omitted: [] };
  const png = thumbnails.length === 1 ? thumbnails[0].png : await composeSheet(browser, thumbnails);
  return { findings, images: [await toCheckImage(browser, label, png)], omitted: [] };
}

/** Decks: preflight per slide (the shown slide is the card) and one contact sheet of up to SHEET_SLIDES slides. */
async function checkDeck(
  browser: Browser,
  page: Page,
  slideCount: number,
  slides: number[] | undefined,
  maxImages: number,
  warnings: string[],
): Promise<{ findings: Finding[]; images: CheckImage[]; omitted: string[]; slidesChecked: number[] }> {
  const numbers = slides ?? Array.from({ length: slideCount }, (_, i) => i + 1);
  const onSheet = new Set(numbers.slice(0, SHEET_SLIDES));
  const findings: Finding[] = [];
  const thumbnails: ShapeThumbnail[] = [];
  let k = 0;
  await page.evaluate(indexCheckSlides, SLIDE_SELECTOR, PRESENTER_CLONE_SELECTOR);
  const captured = await captureDeckSlides(page, {
    slideCount,
    slides: numbers,
    scale: 1,
    format: 'png',
    encode: async (shoot) => {
      const n = numbers[k++];
      const marked = await page.evaluate(markCheckSlide, n - 1);
      const slideFindings = marked ? await runPreflight(page, { cardSelector: SLIDE_CARD_SELECTOR, slide: n }) : [];
      findings.push(...slideFindings);
      const buffer = await shoot('png');
      if (onSheet.has(n) && maxImages > 0) thumbnails.push({ label: `Slide ${n}`, png: buffer, errors: slideFindings.filter((f) => f.severity === 'error').length });
      return { buffer, format: 'png' };
    },
  });
  warnings.push(...captured.warnings);
  const sheetLabel = (list: number[]): string => (list.length === 1 ? `slide ${list[0]}` : `slides ${list[0]}–${list[list.length - 1]}`);
  const shown = numbers.filter((n) => onSheet.has(n));
  const omitted: string[] = [];
  const images: CheckImage[] = [];
  if (maxImages > 0 && thumbnails.length > 0) {
    const png = thumbnails.length === 1 ? thumbnails[0].png : await composeSheet(browser, thumbnails);
    images.push(await toCheckImage(browser, sheetLabel(shown), png));
  } else if (shown.length > 0) {
    omitted.push(sheetLabel(shown));
  }
  if (numbers.length > SHEET_SLIDES) {
    const rest = numbers.slice(SHEET_SLIDES);
    omitted.push(`slide${rest.length === 1 ? '' : 's'} ${rest.join(', ')} (pass slides to see them)`);
  }
  return { findings, images, omitted, slidesChecked: numbers };
}

/** Compact, model-friendly text rendering of a check, shared by every host. */
export function formatCheckResult(result: CheckArtifactResult): string {
  if (!result.ok) return `Check failed (${result.code}): ${result.error}`;
  const what =
    result.mode === 'deck'
      ? `the deck (${result.slidesChecked?.length ?? 0} of ${result.slideCount} slide(s))`
      : result.mode === 'cards'
        ? 'the design at its card size'
        : `the page at ${(result.viewports ?? []).map((v) => `${v.name} ${v.width}×${v.height}`).join(' and ')}`;
  const lines = [`Checked ${what}.${result.savedRun ? '' : ' No files were written.'}`];
  lines.push(...formatPreflight(result.findings, 're-check'));
  if (result.images.length > 0) {
    lines.push(`Screenshots (${result.images.length}, attached in this order): ${result.images.map((i) => `${i.label} ${i.width}×${i.height}`).join('; ')}.`);
    lines.push('Look at them for what the checks can\'t measure: balance, hierarchy, crowded or empty areas, text over busy imagery. Each is one moment: animations are captured mid-way.');
  }
  if (result.omitted.length > 0) lines.push(`Not attached: ${result.omitted.join('; ')}.`);
  if (result.savedRun) lines.push(...formatSavedCheckRun(result.savedRun));
  if (result.scene3d) lines.push(...formatSceneEvidence(result.scene3d));
  const warnings = result.warnings.filter((w) => !w.startsWith('Failed to load: '));
  if (warnings.length > 0) lines.push('Warnings:', ...warnings.map((w) => `- ${w}`));
  return lines.join('\n');
}

/** What the brief and the screen's flow plan say, for counts it promised ("6 products"). */
function promisedTexts(manifest: JsonRecord): string[] {
  const meta = manifest.metadata && typeof manifest.metadata === 'object' ? (manifest.metadata as JsonRecord) : {};
  const out: string[] = [];
  const brief = meta.brief && typeof meta.brief === 'object' ? (meta.brief as JsonRecord) : undefined;
  if (typeof brief?.text === 'string') out.push(brief.text);
  const flow = meta.flow && typeof meta.flow === 'object' ? (meta.flow as JsonRecord) : undefined;
  const plan = flow?.plan && typeof flow.plan === 'object' ? (flow.plan as JsonRecord) : undefined;
  if (Array.isArray(plan?.screens)) {
    const screen = (plan.screens as JsonRecord[]).find((x) => x && x.id === flow?.screenId);
    if (typeof screen?.role === 'string') out.push(screen.role);
  }
  return out;
}
