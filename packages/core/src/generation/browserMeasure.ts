/// <reference lib="dom" />
// The kit's page measurement, run in the agent's own browser (openspec
// add-browser-measured-source). The hosted server can't open websites, but an
// agent with a browser tool (Claude in Chrome's javascript_tool) can run the
// same self-contained page functions the local extraction injects, and send
// the JSON back as a `measured` source. This module bundles those functions
// into one script with a version, and turns its output into the same
// evidence, draft and bundle as a local URL extraction.
//
// What a page script can't do, and what it does instead:
// - Forced :hover/:active/:focus-visible needs CDP: the matching rules are read
//   from same-origin stylesheets, so those values are `declared`.
// - Crops need a screenshot: the result carries element boxes, and the
//   agent attaches one viewport screenshot to cut them from.
// - Load animations ran before the script did: motion is what runs during
//   its scroll pass, plus the declared transitions.

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { hideConsentBanners, hiddenConsentSelectors, liveSlug, validateLiveUrls } from '../export/livePage';
import type { BrandComponents } from './brandKit';
import { captureBrandKitInBrowser, componentRects, componentSpecs, fontAvailability, voiceFacts, VOICE_MAX_CHARS, type CapturedKit } from './brandKitCapture';
import { draftTokensCss, evidenceToTokens, type DraftTokens, type PageEvidence, type SiteEvidence } from './evidenceToTokens';
import { MOTION_RECORDER, summariseMotion, type MotionObservation, type ObservedAnimation } from './motionCapture';
import { cropPng, SCREENSHOT_MAX_BYTES } from './screenshotPalette';
import { measurePageInBrowser, navLinksInBrowser, type CapturedBrandKit, type ExtractSiteResult, type MeasuredPage } from './siteExtraction';

/** Bumped when the result's shape changes; the content hash covers every other change. */
const SCRIPT_GENERATION = 1;
/** The inline script's size cap, so it can be pasted into a browser tool. */
export const BROWSER_MEASURE_MAX_BYTES = 60 * 1024;
/** The result's size cap: an agent copies it into a tool call. */
export const MEASURED_DATA_MAX_BYTES = 120 * 1024;
export const MAX_MEASURED_SOURCES = 4;

/** Pseudo-state styles of the primary control and the first text input, from same-origin stylesheet rules. In-page, self-contained. */
export function declaredStatesInBrowser(): { hover?: string; active?: string; focusRing?: string; inputFocusRing?: string; unreadable: number } {
  const doc = document;
  const out: { hover?: string; active?: string; focusRing?: string; inputFocusRing?: string; unreadable: number } = { unreadable: 0 };
  const primary = doc.querySelector('[data-od-extract-primary]');
  const input = Array.from(doc.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea')).find((el) => (el as HTMLElement).offsetWidth > 20);
  const root = getComputedStyle(doc.documentElement);
  const canvas = doc.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const resolveVars = (value: string, el: Element, depth = 0): string =>
    depth > 5
      ? value
      : value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_m, name: string, fallback?: string) => {
          const v = getComputedStyle(el).getPropertyValue(name).trim() || root.getPropertyValue(name).trim() || (fallback ?? '').trim();
          return resolveVars(v, el, depth + 1);
        });
  const toRgb = (value: string): string | undefined => {
    if (!ctx || !value || /^(transparent|none|inherit|initial|unset|currentcolor)$/i.test(value)) return undefined;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#010203';
    ctx.fillStyle = value;
    if (String(ctx.fillStyle) === '#010203' && !/^#010203$/i.test(value)) return undefined;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return d[3] === 0 ? undefined : `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
  };
  const colourIn = (value: string): string | undefined => {
    const direct = toRgb(value.trim());
    if (direct) return direct;
    const inner = /(?:#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\([^()]*\))/i.exec(value);
    return inner ? toRgb(inner[0]) : undefined;
  };
  const ringOf = (style: CSSStyleDeclaration, el: Element): string | undefined => {
    const shadow = resolveVars(style.getPropertyValue('box-shadow'), el).trim();
    if (shadow && shadow !== 'none') return shadow;
    const outline = resolveVars(style.getPropertyValue('outline'), el).trim();
    const width = /(\d+(?:\.\d+)?)px/.exec(outline)?.[1] ?? /(\d+(?:\.\d+)?)px/.exec(resolveVars(style.getPropertyValue('outline-width'), el))?.[1];
    const colour = colourIn(outline) ?? colourIn(resolveVars(style.getPropertyValue('outline-color'), el));
    if (width && colour && Number(width) > 0) return `0 0 0 ${width}px ${colour}`;
    return undefined;
  };
  const visit = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      const media = (rule as CSSMediaRule).media;
      if (media && (rule as CSSMediaRule).cssRules) {
        if (window.matchMedia(media.mediaText).matches) visit((rule as CSSMediaRule).cssRules);
        continue;
      }
      const grouped = (rule as CSSGroupingRule).cssRules;
      if (grouped && !(rule as CSSStyleRule).selectorText) {
        visit(grouped);
        continue;
      }
      const sel = (rule as CSSStyleRule).selectorText;
      const style = (rule as CSSStyleRule).style;
      if (!sel || !style) continue;
      for (const part of sel.split(',')) {
        const state = /:hover\b/.test(part) ? 'hover' : /:active\b/.test(part) ? 'active' : /:focus-visible\b/.test(part) ? 'focus' : /:focus\b/.test(part) ? 'focus' : undefined;
        if (!state) continue;
        const base = part.replace(/:(hover|active|focus-visible|focus-within|focus)\b/g, '').trim() || '*';
        const hits = (el: Element | null | undefined): boolean => {
          if (!el) return false;
          try {
            return el.matches(base);
          } catch {
            return false;
          }
        };
        if (hits(primary)) {
          if (state === 'focus') out.focusRing = ringOf(style, primary!) ?? out.focusRing;
          else {
            const bg = colourIn(resolveVars(style.getPropertyValue('background-color') || style.getPropertyValue('background'), primary!));
            if (bg) out[state] = bg;
          }
        }
        if (state === 'focus' && hits(input)) out.inputFocusRing = ringOf(style, input!) ?? out.inputFocusRing;
      }
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      out.unreadable += 1;
    }
  }
  return out;
}

export interface BrowserMeasureScript {
  /** `<generation>-<sha256 prefix>`: what a measured source must carry. */
  version: string;
  /** Full sha256 of the source, for a cache-forever URL. */
  hash: string;
  /** One expression; evaluating it resolves to the result as a JSON string. */
  source: string;
}

let cached: BrowserMeasureScript | undefined;

/**
 * Drops indentation, blank lines and whole-line `//` comments. Lines stay
 * lines, so semicolon insertion is unchanged; skipped when a template
 * literal spans lines, where indentation is content.
 */
export function compactScript(source: string): string {
  let open = false;
  for (const line of source.split('\n')) {
    if (open) return source;
    if ((line.match(/`/g) ?? []).length % 2 === 1) open = !open;
  }
  return source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .join('\n');
}

/** The script for the agent's browser, built from the same page functions the local extraction injects. */
export function browserMeasureScript(): BrowserMeasureScript {
  if (cached) return cached;
  let body = [
    'globalThis.__name = globalThis.__name || ((fn) => fn);',
    `const measure = ${measurePageInBrowser.toString()};`,
    `const kitOf = ${captureBrandKitInBrowser.toString()};`,
    `const navOf = ${navLinksInBrowser.toString()};`,
    `const declaredOf = ${declaredStatesInBrowser.toString()};`,
    `const hide = ${hideConsentBanners.toString()};`,
    `const hidden = ${hiddenConsentSelectors.toString()};`,
    `const LIMIT = ${MEASURED_DATA_MAX_BYTES};`,
    `try { ${MOTION_RECORDER} } catch (e) {}`,
    'const sleep = (ms) => new Promise((r) => setTimeout(r, ms));',
    'try { hide(); } catch (e) {}',
    'if (window.__odMotion) window.__odMotion.trigger = "scroll";',
    'const started = Date.now();',
    'for (let i = 0; i < 12 && Date.now() - started < 4000; i++) {',
    '  const before = window.scrollY; window.scrollBy(0, window.innerHeight); await sleep(160);',
    '  if (window.scrollY === before || window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) break;',
    '}',
    'await sleep(Math.max(0, 2000 - (Date.now() - started)));',
    'window.scrollTo(0, 0);',
    'const animations = (window.__odMotion ? window.__odMotion.list : []).filter((a) => a.duration > 0).slice(0, 120);',
    'for (const a of (document.getAnimations ? document.getAnimations() : [])) { try { a.finish(); } catch (e) {} }',
    'await sleep(250);',
    'try { hide(); } catch (e) {}',
    'const page = measure();',
    'let declared; try { declared = declaredOf(); } catch (e) {}',
    `let kit; try { kit = kitOf(${VOICE_MAX_CHARS}); } catch (e) {}`,
    'let nav = []; try { nav = navOf(); } catch (e) {}',
    'let overlays = []; try { overlays = hidden(); } catch (e) {}',
    'if (kit && kit.voice) kit.voice = kit.voice.slice(0, 24);',
    'const out = { scriptVersion: VERSION, url: location.href, title: document.title, measuredAt: new Date().toISOString(),',
    '  viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 },',
    '  page, declared, kit, nav: nav.slice(0, 60), overlays, motion: { animations } };',
    // Smaller first: only custom properties holding a colour or a length, at most 300 at the root and 80 per theme.
    'const keep = (o, n) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => /^(#|rgb|hsl|oklch|oklab|lab|lch|hwb|color\\(|-?[\\d.]+(px|rem|em|ms|s)?$)/i.test(String(v).trim())).slice(0, n));',
    'if (out.page.customProperties) { const cp = out.page.customProperties; out.page.customProperties = { root: keep(cp.root, 300), themes: Object.fromEntries(Object.entries(cp.themes || {}).slice(0, 4).map(([k, v]) => [k, keep(v, 80)])) }; }',
    'let text = JSON.stringify(out);',
    'if (text.length > LIMIT) { out.page.radiusRects = undefined; if (out.kit) out.kit.voice = out.kit.voice.slice(0, 8); out.motion.animations = out.motion.animations.slice(0, 30); text = JSON.stringify(out); }',
    'if (text.length > LIMIT) { out.page.customProperties = { root: {}, themes: {} }; text = JSON.stringify(out); }',
    'return text;',
  ].join('\n');
  body = compactScript(body);
  const hash = createHash('sha256').update(body).digest('hex');
  const version = `${SCRIPT_GENERATION}-${hash.slice(0, 12)}`;
  const source = `(async () => {\nconst VERSION = ${JSON.stringify(version)};\n${body}\n})()`;
  cached = { version, hash, source };
  return cached;
}

/** The route the gateway serves the script at. */
export const browserMeasurePath = (hash: string): string => `/measure/${hash}.js`;

/** A one-line loader for a browser tool: fetches the script from the gateway and runs it. */
export function browserMeasureLoader(scriptUrl: string): string {
  return `fetch(${JSON.stringify(scriptUrl)}).then((r) => r.text()).then((s) => (0, eval)(s))`;
}

// ── Server side ─────────────────────────────────────────────────────────

export interface MeasuredData {
  scriptVersion: string;
  url: string;
  title?: string;
  measuredAt?: string;
  viewport: { width: number; height: number; dpr: number };
  page: MeasuredPage;
  declared?: ReturnType<typeof declaredStatesInBrowser>;
  kit?: CapturedKit;
  nav?: string[];
  overlays?: string[];
  motion?: { animations: ObservedAnimation[] };
}

export interface MeasuredSourceInput {
  kind: 'measured';
  url: string;
  /** The script's result: the JSON string it returned, or that string parsed. */
  data: unknown;
  /** One viewport screenshot (PNG, base64) taken at the top of the page, for crops. */
  screenshot?: string;
  name?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Checks one measured source; the parsed data or why it was refused. */
export function validateMeasuredSource(raw: Record<string, unknown>, index: number): { ok: true; source: MeasuredSourceInput & { parsed: MeasuredData } } | { ok: false; error: string } {
  const at = `sources[${index}]`;
  if (typeof raw.url !== 'string' || !/^https?:\/\//i.test(raw.url)) return { ok: false, error: `${at}: a measured source needs url, the page the script ran on.` };
  let parsed: unknown = raw.data;
  if (typeof parsed === 'string') {
    if (parsed.length > MEASURED_DATA_MAX_BYTES * 1.5) return { ok: false, error: `${at}: data is over ${Math.round((MEASURED_DATA_MAX_BYTES * 1.5) / 1024)} KB.` };
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return { ok: false, error: `${at}: data must be the JSON the measurement script returned, unchanged.` };
    }
  }
  if (!isObj(parsed)) return { ok: false, error: `${at}: data must be the JSON the measurement script returned, unchanged.` };
  const current = browserMeasureScript().version;
  if (parsed.scriptVersion !== current) {
    return {
      ok: false,
      error: `${at}: the measurement came from script version ${typeof parsed.scriptVersion === 'string' ? parsed.scriptVersion : '(none)'}, and this server reads ${current}. Nothing was drafted. Call extract_open_design_design_system with the url again to get the current script, run it, and pass its result.`,
    };
  }
  const page = parsed.page;
  if (!isObj(page) || !isObj(page.roles) || !Array.isArray(page.textRoles) || !Array.isArray(page.radii) || !Array.isArray(page.spacing)) {
    return { ok: false, error: `${at}: data is missing the page measurement; pass the script's result unchanged.` };
  }
  const vp = parsed.viewport;
  if (!isObj(vp) || typeof vp.width !== 'number' || typeof vp.height !== 'number') return { ok: false, error: `${at}: data is missing the viewport; pass the script's result unchanged.` };
  if (raw.screenshot !== undefined) {
    if (typeof raw.screenshot !== 'string' || !raw.screenshot) return { ok: false, error: `${at}: screenshot must be a PNG as base64.` };
    if (Math.floor((raw.screenshot.length * 3) / 4) > SCREENSHOT_MAX_BYTES) return { ok: false, error: `${at}: screenshot is over ${SCREENSHOT_MAX_BYTES / 1024 / 1024} MB.` };
  }
  return {
    ok: true,
    source: { kind: 'measured', url: raw.url, data: raw.data, screenshot: raw.screenshot as string | undefined, name: typeof raw.name === 'string' ? raw.name : undefined, parsed: parsed as unknown as MeasuredData },
  };
}

/** One measured page as the extraction's PageEvidence. Pseudo-states come from declared rules. */
export function measuredToEvidence(data: MeasuredData, url: string, withMotion: boolean): PageEvidence {
  const m = data.page;
  const roles = { ...m.roles };
  const d = data.declared;
  if (roles.accent && d) {
    for (const state of ['hover', 'active'] as const) {
      const value = d[state];
      if (value && value !== roles.accent.value) roles[`accent-${state}`] = { value, selector: `${roles.accent.selector}:${state}`, count: 1 };
    }
  }
  const motion: MotionObservation | undefined = withMotion && data.motion?.animations?.length ? { animations: data.motion.animations.filter((a) => a && typeof a.duration === 'number').slice(0, 120) } : undefined;
  return {
    url,
    colorOriginals: m.colorOriginals,
    roles,
    textRoles: m.textRoles,
    fonts: m.fonts ?? [],
    customProperties: m.customProperties ?? { root: {}, themes: {} },
    radii: m.radii,
    spacing: m.spacing,
    containerMax: m.containerMax,
    transitions: m.transitions ?? { durations: [], easings: [] },
    cardShadow: m.cardShadow,
    focusRing: d?.focusRing,
    gradients: m.gradients,
    hero: m.hero,
    layout: m.layout,
    hiddenOverlays: data.overlays?.length ? data.overlays : undefined,
    accentCandidates: m.accentCandidates,
    accentConfidence: m.accentConfidence,
    motion,
  };
}

/** Tokens whose value came from a stylesheet rule rather than a rendered state. */
const DECLARED_STATE_TOKENS = ['--accent-hover', '--accent-active', '--focus-ring'];

export interface ExtractFromMeasuredInput {
  workspaceRoot: string;
  outputDir: string;
  sources: Array<MeasuredSourceInput & { parsed: MeasuredData }>;
  /** Hosts allowed despite being private (tests only). */
  allowHostsForTesting?: string[];
}

const isPng = (b: Buffer) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47;

/**
 * Measured sources into an evidence bundle and draft, the same shape a local
 * URL extraction returns, so accent candidates, coverage, components, motion
 * and nearest all come back.
 */
export async function extractFromMeasured(input: ExtractFromMeasuredInput): Promise<Extract<ExtractSiteResult, { bundleDir: string }>> {
  const [first] = input.sources;
  const valid = await validateLiveUrls(first.url, input.sources.slice(1).map((s) => s.url), async () => ['93.184.216.34'], input.allowHostsForTesting);
  if (!valid.ok) throw new Error(`The measured pages must be public pages on one site: ${valid.error}`);
  const main = valid.urls[0];
  const slug = liveSlug(main);
  const bundleRel = path.posix.join(input.outputDir.split(path.sep).join('/'), '.extract', slug);
  const bundleDir = path.join(input.workspaceRoot, bundleRel);
  await fs.rm(bundleDir, { recursive: true, force: true });
  await fs.mkdir(path.join(bundleDir, 'crops'), { recursive: true });
  const rel = (f: string) => path.posix.join(bundleRel, f);
  const notes: string[] = [`Measured in the user's browser by the Open Design measurement script (version ${first.parsed.scriptVersion}), not on the server. Hover, active and focus styles come from the site's stylesheet rules (declared), not from forcing the states.`];
  const screenshots: string[] = [];
  const pages: PageEvidence[] = [];
  let components: BrandComponents = {};
  let imagery: CapturedKit['imagery'] = {};
  let themeColor: string | undefined;
  const voice: CapturedKit['voice'] = [];
  const stylesheets = new Set<string>();
  let unreadableSheets = 0;

  for (const [i, src] of input.sources.entries()) {
    const data = src.parsed;
    const prefix = input.sources.length > 1 ? `page-${i + 1}-` : '';
    pages.push(measuredToEvidence(data, src.url, i === 0));
    unreadableSheets += data.declared?.unreadable ?? 0;
    if (data.kit) {
      voice.push(...(data.kit.voice ?? []));
      for (const s of data.kit.links?.stylesheets ?? []) stylesheets.add(s);
    }
    let png: Buffer | undefined;
    if (src.screenshot) {
      const bytes = Buffer.from(src.screenshot.replace(/^data:[^,]*;base64,/i, '').replace(/\s+/g, ''), 'base64');
      if (isPng(bytes)) png = bytes;
      else notes.push(`${src.url}: the screenshot isn't a PNG, so no crops were cut from it.`);
    }
    const crops: Record<string, string> = {};
    if (png) {
      const shot = `${prefix}desktop.png`;
      await fs.writeFile(path.join(bundleDir, shot), png);
      screenshots.push(rel(shot));
      // Boxes are document coordinates at the top of the page; the screenshot is the viewport, maybe at a device pixel ratio.
      const scale = png.readUInt32BE(16) / Math.max(1, data.viewport.width);
      const cut = async (key: string, box: { x: number; y: number; width: number; height: number } | undefined): Promise<void> => {
        if (!box || box.width < 2 || box.height < 2 || box.y + box.height > data.viewport.height || box.y < 0) return;
        const file = `crops/${prefix}${key}.png`;
        await fs.writeFile(path.join(bundleDir, file), cropPng(png!, { x: Math.round(box.x * scale), y: Math.round(box.y * scale), width: Math.round(box.width * scale), height: Math.round(box.height * scale) }));
        crops[key] = file;
      };
      for (const [role, box] of Object.entries(data.page.rects ?? {})) await cut(role, box);
      for (const [key, box] of Object.entries(data.page.candidateRects ?? {})) await cut(key, box);
      if (i === 0 && data.kit) for (const [key, box] of componentRects(data.kit.components)) await cut(`component-${key}`, box);
      const ev = pages[pages.length - 1];
      for (const [role, sample] of Object.entries(ev.roles)) {
        const crop = crops[role.replace(/-(hover|active)$/, '')];
        if (sample && crop) sample.crop = crop;
      }
      ev.accentCandidates?.forEach((c, n) => {
        const file = crops[`accent-candidate-${n + 1}`];
        if (file) c.crop = file;
      });
    }
    if (i === 0 && data.kit) {
      components = componentSpecs(data.kit.components, Object.fromEntries(Object.entries(crops).filter(([k]) => k.startsWith('component-')).map(([k, f]) => [k.slice('component-'.length), f])));
      imagery = data.kit.imagery ?? {};
      themeColor = data.kit.links?.themeColor;
      if (data.kit.logo?.svg) {
        await fs.writeFile(path.join(bundleDir, 'logo.svg'), data.kit.logo.svg);
      } else if (data.kit.logo?.src) {
        notes.push(`The logo is an image at ${data.kit.logo.src}; the server doesn't download it. Ask the user for the logo file if they want it in the design system.`);
      }
    }
  }
  if (!input.sources.some((s) => s.screenshot)) notes.push('No screenshot came with the measurement, so there are no crops and the review page has no picture of the site. Attach one viewport screenshot of the top of the page next time.');
  if (unreadableSheets > 0) notes.push(`${unreadableSheets} stylesheet(s) were on another domain and couldn't be read, so hover and focus styles from them are missing.`);

  const motion = pages[0].motion;
  const siteEvidence: SiteEvidence = { pages };
  const draft: DraftTokens = evidenceToTokens(siteEvidence);
  for (const [token, s] of Object.entries(draft.sources)) {
    draft.sources[token] = { ...s, confidence: DECLARED_STATE_TOKENS.includes(token) ? 'declared' : 'measured' };
  }
  notes.push(...draft.notes);
  if (draft.conflicts.length > 0) notes.push(`Pages disagree on ${[...new Set(draft.conflicts.map((c) => c.token))].join(', ')}: the draft takes the value most pages use (the first page's on a tie); see draft.conflicts.`);
  if (motion) notes.push('Motion is what ran while the script scrolled the page; animations that play on load had finished before it started.');
  const fonts = fontAvailability(pages.flatMap((p) => p.fonts), [...stylesheets]);
  const capped = voice.slice(0, 60);
  const brandKit: CapturedBrandKit = {
    marks: [],
    fonts,
    components,
    voice: { samples: capped, ...voiceFacts(capped) },
    imagery,
    themeColor,
    motion: motion ? summariseMotion(motion) : undefined,
  };
  const nav = (first.parsed.nav ?? []).filter((u) => typeof u === 'string').slice(0, 60);
  await fs.writeFile(
    path.join(bundleDir, 'evidence.json'),
    JSON.stringify({ version: 2, status: 'ok', url: main.toString(), theme: 'light', measuredAt: first.parsed.measuredAt ?? new Date().toISOString(), measuredBy: 'browser', scriptVersion: first.parsed.scriptVersion, pages, brandKit, components, nav, notes, draft }, null, 2) + '\n',
  );
  return {
    status: 'ok',
    slug,
    bundleDir: bundleRel,
    draft,
    draftCss: draftTokensCss(draft, `Draft measured from ${main.toString()} in the user's browser by extract_open_design_design_system`),
    screenshots,
    blocked: [],
    marks: [],
    brandKit,
    notes,
  };
}
