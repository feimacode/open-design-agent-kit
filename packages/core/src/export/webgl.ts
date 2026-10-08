// WebGL-aware rendering (openspec add-3d-object): software WebGL for
// artifacts that need it, the `window.odScene` ready contract, and the
// `webgl` finding for a canvas that couldn't render or rendered blank.
import { PNG } from 'pngjs';
import type { Page } from 'puppeteer-core';
import type { Finding } from '../poster/preflight';

/** Software WebGL (SwiftShader), so a canvas renders on machines without a GPU (CI, WSL, headless). */
export const SWIFTSHADER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export const WEBGL_SELECTOR = '[data-od-webgl]';

/** True when the entry marks a WebGL canvas or imports three.js (design D3). */
export function usesWebgl(html: string): boolean {
  if (/\sdata-od-webgl\b/i.test(html)) return true;
  // `import … from 'three'`, an import map entry, or a CDN build of three.
  return /from\s*["']three(?:\/[^"']*)?["']|["']three["']\s*:|\/three@[^"'/]*\/|\/three(?:\.module)?(?:\.min)?\.js\b/i.test(html);
}

/** Launch args for an artifact: SwiftShader only when it needs WebGL, default flags otherwise. */
export function webglLaunchArgs(html: string): string[] {
  return usesWebgl(html) ? SWIFTSHADER_ARGS : [];
}

/**
 * Waits for `window.odScene.ready` when the page defines it (design D2),
 * within `timeoutMs`; for still captures, then sets `odScene.rotate = false`
 * (the scene returns to its authored angle) and waits for two frames so the
 * capture shows it. Pages without `odScene` return at once.
 */
export async function waitForScene(page: Page, timeoutMs: number, warnings: string[], options: { still: boolean }): Promise<void> {
  // String form: this package compiles without DOM lib types.
  const has = await page.evaluate('!!(window.odScene && window.odScene.ready && typeof window.odScene.ready.then === "function")').catch(() => false);
  if (!has) return;
  // The timeout runs here, not in the page: motion export's virtual clock owns the page's timers.
  let timer: NodeJS.Timeout | undefined;
  const result = await Promise.race([
    page
      .evaluate(`Promise.resolve(window.odScene.ready).then(() => 'ready', (e) => 'failed: ' + (e && e.message ? e.message : String(e)))`)
      .catch((err: unknown) => `failed: ${err instanceof Error ? err.message : String(err)}`),
    new Promise<string>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), Math.max(0, timeoutMs));
    }),
  ]);
  clearTimeout(timer);
  if (result === 'timeout') warnings.push(`The 3D scene wasn't ready (window.odScene.ready) within ${timeoutMs}ms — captured anyway.`);
  else if (typeof result === 'string' && result.startsWith('failed')) warnings.push(`The 3D scene's ready promise rejected (${result.slice('failed: '.length)}) — captured anyway.`);
  if (options.still) {
    await page
      .evaluate(
        `(() => {
          if ('rotate' in window.odScene) window.odScene.rotate = false;
          const raf = (window.__odClock && window.__odClock.realRaf) || window.requestAnimationFrame.bind(window);
          return new Promise((r) => raf(() => raf(() => r(true))));
        })()`,
      )
      .catch(() => undefined);
  }
}

interface CanvasProbe {
  selector: string;
  /** False when no WebGL context exists or can be created for the canvas. */
  context: boolean;
  box: { x: number; y: number; width: number; height: number } | undefined;
}

/** The pinned three.js build the 3d-object skill uses, for messages that point at it. */
export const THREE_IMPORT_MAP_HINT =
  'Load the pinned module build through an import map: "three" → https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js and "three/addons/" → https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/, then `import * as THREE from "three"` in a <script type="module">.';

/**
 * An error for each three.js file the page failed to load (from loadPage's
 * "Failed to load" warnings). Agents often write script tags from memory for
 * builds that no longer exist: three.min.js was removed in r160 and the
 * examples/js folder in r148, so `THREE` is undefined and nothing renders.
 */
export function threeLoadFindings(warnings: string[]): Finding[] {
  const urls = warnings
    .filter((w) => w.startsWith('Failed to load: '))
    .map((w) => w.slice('Failed to load: '.length))
    .filter((w) => /\bthree(@|\/|\.min\.js|\.module\.js|\.js)/i.test(w));
  return [...new Set(urls.map((u) => u.replace(/ \(.*$/, '')))].map((url) => ({
    check: 'webgl',
    severity: 'error' as const,
    message: `three.js didn't load: ${url}. Nothing in the scene can render without it (builds since r160 have no three.min.js, and since r148 no examples/js). ${THREE_IMPORT_MAP_HINT}`,
  }));
}

// Self-contained page function (serialized into the page).
function probeCanvases(selector: string): CanvasProbe[] {
  const d = (globalThis as unknown as { document: { querySelectorAll(s: string): ArrayLike<unknown> } }).document;
  type El = {
    tagName: string;
    id: string;
    getAttribute(n: string): string | null;
    querySelector(s: string): El | null;
    getBoundingClientRect(): { left: number; top: number; width: number; height: number };
    getContext?(t: string): unknown;
  };
  const out: CanvasProbe[] = [];
  // A WebGL page that didn't mark its canvas: judge every canvas instead.
  let marked = Array.prototype.slice.call(d.querySelectorAll(selector)) as El[];
  const unmarked = marked.length === 0;
  if (unmarked) marked = Array.prototype.slice.call(d.querySelectorAll('canvas')) as El[];
  marked.forEach((el, i) => {
    const canvas = el.tagName === 'CANVAS' ? el : el.querySelector('canvas');
    const name = el.id ? `#${el.id}` : `${unmarked ? 'canvas' : selector}:nth-of-type(${i + 1})`;
    if (!canvas || !canvas.getContext) {
      out.push({ selector: name, context: false, box: undefined });
      return;
    }
    // Returns the context three.js made, or tries to make one; a canvas that
    // already has a 2D context isn't a WebGL failure, so count it as fine.
    let context = false;
    try {
      context = !!(canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('2d'));
    } catch {
      context = false;
    }
    const r = canvas.getBoundingClientRect();
    out.push({ selector: name, context, box: r.width >= 1 && r.height >= 1 ? { x: r.left, y: r.top, width: r.width, height: r.height } : undefined });
  });
  return out;
}

/** True when every sampled pixel (a grid over the image) is within `tolerance` of the first, on every channel. */
export function isUniformPng(png: Buffer, tolerance = 4): boolean {
  const img = PNG.sync.read(png);
  const steps = 24;
  const at = (x: number, y: number) => (y * img.width + x) * 4;
  const first = at(0, 0);
  for (let sy = 0; sy < steps; sy++) {
    for (let sx = 0; sx < steps; sx++) {
      const x = Math.min(img.width - 1, Math.floor(((sx + 0.5) * img.width) / steps));
      const y = Math.min(img.height - 1, Math.floor(((sy + 0.5) * img.height) / steps));
      const p = at(x, y);
      for (let c = 0; c < 4; c++) if (Math.abs(img.data[p + c] - img.data[first + c]) > tolerance) return false;
    }
  }
  return true;
}

/** True when the PNG has no pixel with alpha below 255 (sampled every few pixels). */
export function isFullyOpaquePng(png: Buffer): boolean {
  const img = PNG.sync.read(png);
  const stride = Math.max(1, Math.floor(Math.min(img.width, img.height) / 64));
  for (let y = 0; y < img.height; y += stride) {
    for (let x = 0; x < img.width; x += stride) if (img.data[(y * img.width + x) * 4 + 3] < 255) return false;
  }
  // The edges, where a cut-out's transparency usually is.
  for (let x = 0; x < img.width; x++) if (img.data[x * 4 + 3] < 255 || img.data[((img.height - 1) * img.width + x) * 4 + 3] < 255) return false;
  return true;
}

/**
 * The `webgl` findings (design D4): an error for a marked canvas with no WebGL
 * context, a warning for one whose pixels are uniform (a blank render).
 */
export async function webglFindings(page: Page, warnings: string[] = []): Promise<Finding[]> {
  const findings: Finding[] = threeLoadFindings(warnings);
  // three.js itself is missing: every canvas is blank for that one reason, so say only that.
  if (findings.length > 0) return findings;
  const probes = (await page.evaluate(probeCanvases, WEBGL_SELECTOR).catch(() => [])) as CanvasProbe[];
  if (probes.length === 0) {
    return [{ check: 'webgl', severity: 'error', message: `This page uses three.js but has no <canvas> once loaded, so nothing renders. Check the page's script errors in the warnings. ${THREE_IMPORT_MAP_HINT}` }];
  }
  // Judge each canvas by its own pixels: hide everything drawn over or behind
  // it (captions, the page background) while it's captured.
  const isolate = `(() => {
    const s = document.createElement('style');
    s.id = 'od-webgl-isolate';
    s.textContent = 'html, body { background: transparent !important; } body * { visibility: hidden !important; } ${WEBGL_SELECTOR}, ${WEBGL_SELECTOR} canvas, canvas { visibility: visible !important; }';
    document.head.appendChild(s);
    return new Promise((r) => requestAnimationFrame(() => r(true)));
  })()`;
  const restore = `document.getElementById('od-webgl-isolate')?.remove()`;
  let isolated = false;
  for (const probe of probes) {
    if (!probe.context) {
      findings.push({
        check: 'webgl',
        severity: 'error',
        selector: probe.selector,
        message: `${probe.selector}: no WebGL context could be created for this canvas, so the scene can't render. Check the browser supports WebGL (export enables software WebGL for marked canvases) and that the page's script ran.`,
      });
      continue;
    }
    if (!probe.box) continue;
    if (!isolated) isolated = (await page.evaluate(isolate).catch(() => false)) === true;
    const shot = Buffer.from(await page.screenshot({ type: 'png', clip: probe.box, omitBackground: true }).catch(() => new Uint8Array()));
    if (shot.length > 0 && isUniformPng(shot)) {
      findings.push({
        check: 'webgl',
        severity: 'warning',
        selector: probe.selector,
        message: `${probe.selector}: the canvas is one flat color — the scene rendered nothing. A model or texture may have failed to load (see broken-asset), the camera may be pointing away, or the render loop didn't run.`,
      });
    }
  }
  if (isolated) await page.evaluate(restore).catch(() => undefined);
  return findings;
}
