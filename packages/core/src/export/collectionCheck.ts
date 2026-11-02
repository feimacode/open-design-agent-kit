// A collection as one design (openspec add-linked-flows): check every screen
// and the flow between them, write the flow map, and export the screens as one
// clickable prototype file.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { findCollectionArtifacts, latestFlowPlan, scanArtifactManifests, type CollectionScreen } from '../workspace/collectionScan';
import { SHARED_NAV_PATH, slugifyScreenId, type FlowPlan } from '../generation/flowPlan';
import { bundleStandaloneHtml } from '../vendored/standaloneHtml';
import { formatPreflight, type Finding } from '../poster/preflight';
import { checkArtifact, type CheckArtifactOptions, type CheckImage } from './checkArtifact';
import { analyzeFlow, storeRuleFindings, type FlowScreenSource } from './flowCheck';
import { FLOW_MAP_FILE, flowMapHtml } from './flowMap';
import { resolveIncludes } from './flowIncludes';
import { workspaceAssetReader } from './workspaceAssets';

/** Screenshots across the whole collection, shared between its screens. */
export const COLLECTION_MAX_IMAGES = 6;

export interface CollectionFlow {
  collectionId: string;
  collectionName: string;
  /** Workspace-relative directory of the collection's screens. */
  collectionDir: string;
  plan?: FlowPlan;
  screens: FlowScreenSource[];
  sharedNav?: string;
  /** The brief text recorded on the screens, for store rules. */
  brief?: string;
}

function screenIdOf(s: CollectionScreen): string {
  return s.flow?.screenId ?? (s.screenRole ? slugifyScreenId(s.screenRole) : path.posix.basename(s.entryPath, path.posix.extname(s.entryPath)));
}

/** Reads a collection's screens, plan and shared navigation; undefined when no screen is registered. */
export async function loadCollectionFlow(workspaceRoot: string, outputDir: string, collectionId: string): Promise<CollectionFlow | undefined> {
  const registered = await findCollectionArtifacts(workspaceRoot, outputDir, collectionId);
  if (registered.length === 0) return undefined;
  const plan = latestFlowPlan(registered);
  const collectionDir = path.posix.dirname(registered[0].entryPath);
  const manifests = new Map((await scanArtifactManifests(workspaceRoot, outputDir)).map((m) => [m.entryPath, m.manifest]));
  const screens: FlowScreenSource[] = [];
  let collectionName = collectionId;
  let brief: string | undefined;
  for (const s of registered) {
    let html: string | undefined;
    try {
      html = await fs.readFile(path.join(workspaceRoot, s.entryPath), 'utf8');
    } catch {
      html = undefined;
    }
    const manifest = manifests.get(s.entryPath);
    if (manifest && typeof manifest.collectionName === 'string') collectionName = manifest.collectionName;
    const b = (manifest?.metadata as { brief?: { text?: unknown } } | undefined)?.brief?.text;
    if (typeof b === 'string') brief = brief ? `${brief}\n${b}` : b;
    screens.push({ id: screenIdOf(s), title: s.title, entryPath: s.entryPath, html });
  }
  // Order screens as the plan does; unplanned ones after.
  if (plan) {
    const order = new Map(plan.screens.map((p, i) => [p.id, i]));
    screens.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  }
  let sharedNav: string | undefined;
  try {
    sharedNav = await fs.readFile(path.join(workspaceRoot, collectionDir, SHARED_NAV_PATH), 'utf8');
  } catch {
    sharedNav = undefined;
  }
  return { collectionId, collectionName, collectionDir, plan, screens, sharedNav, brief };
}

/** Writes <collection>/flow.html and returns its workspace-relative path with the flow analysis. */
export async function writeFlowMap(workspaceRoot: string, flow: CollectionFlow, frameWidth?: number): Promise<{ mapPath: string; analysis: ReturnType<typeof analyzeFlow> }> {
  const analysis = analyzeFlow({ screens: flow.screens, plan: flow.plan, sharedNav: flow.sharedNav, collectionDir: flow.collectionDir });
  const built = new Map(flow.screens.map((s) => [s.id, s]));
  const planned = flow.plan?.screens ?? [];
  const mapScreens = [
    ...planned.map((p) => {
      const s = built.get(p.id);
      return { id: p.id, title: s?.title ?? p.title, href: s?.html !== undefined ? path.posix.relative(flow.collectionDir, s.entryPath) : undefined };
    }),
    ...flow.screens.filter((s) => !planned.some((p) => p.id === s.id)).map((s) => ({ id: s.id, title: s.title, href: s.html !== undefined ? path.posix.relative(flow.collectionDir, s.entryPath) : undefined })),
  ];
  const html = flowMapHtml({ title: flow.collectionName, screens: mapScreens, links: analysis.links, plan: flow.plan, missingLinks: analysis.missingLinks, frameWidth });
  const mapPath = path.posix.join(flow.collectionDir, FLOW_MAP_FILE);
  await fs.writeFile(path.join(workspaceRoot, mapPath), html);
  return { mapPath, analysis };
}

export interface CheckCollectionOptions extends Omit<CheckArtifactOptions, 'entryPath'> {
  collectionId: string;
}

export type CheckCollectionResult =
  | {
      ok: true;
      collectionId: string;
      findings: Finding[];
      images: CheckImage[];
      omitted: string[];
      screens: Array<{ id: string; entryPath: string; checked: boolean }>;
      mapPath: string;
      warnings: string[];
      browserPath?: string;
    }
  | { ok: false; code: string; error: string };

/**
 * Checks every built screen of a collection (the image budget split across
 * them, findings tagged with the screen), adds the flow findings and
 * store-rules notes, and rewrites the flow map.
 */
export async function checkCollection(options: CheckCollectionOptions): Promise<CheckCollectionResult> {
  const outputDir = options.outputDir ?? '.open-design';
  const flow = await loadCollectionFlow(options.workspaceRoot, outputDir, options.collectionId);
  if (!flow) return { ok: false, code: 'not-found', error: `No screens are registered with collectionId "${options.collectionId}".` };
  const { mapPath, analysis } = await writeFlowMap(options.workspaceRoot, flow);
  const findings: Finding[] = [...analysis.findings, ...storeRuleFindings(flow.screens, flow.brief)];
  const images: CheckImage[] = [];
  const omitted: string[] = [];
  const warnings: string[] = [];
  const screens: Array<{ id: string; entryPath: string; checked: boolean }> = [];
  const built = flow.screens.filter((s) => s.html !== undefined);
  const budget = Math.min(options.maxImages ?? COLLECTION_MAX_IMAGES, COLLECTION_MAX_IMAGES);
  let browserPath: string | undefined;
  for (const [i, s] of built.entries()) {
    // One image per screen while the budget lasts, the earlier screens first.
    const share = Math.max(0, Math.floor(budget / built.length) + (i < budget % built.length ? 1 : 0));
    const result = await checkArtifact({ ...options, outputDir, entryPath: s.entryPath, maxImages: share });
    if (!result.ok) {
      screens.push({ id: s.id, entryPath: s.entryPath, checked: false });
      if (result.code === 'no-browser') return { ok: false, code: result.code, error: result.error };
      warnings.push(`${s.id}: ${result.error}`);
      continue;
    }
    browserPath = result.browserPath;
    screens.push({ id: s.id, entryPath: s.entryPath, checked: true });
    findings.push(...result.findings.map((f) => ({ ...f, screen: s.id })));
    images.push(...result.images.map((img) => ({ ...img, label: `${s.id}: ${img.label}` })));
    omitted.push(...result.omitted.map((o) => `${s.id}: ${o}`));
    warnings.push(...result.warnings.map((w) => `${s.id}: ${w}`));
  }
  return { ok: true, collectionId: options.collectionId, findings, images, omitted, screens, mapPath, warnings, browserPath };
}

const PROTOTYPE_NAV_SCRIPT = `<script data-od-prototype>(function(){document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('[data-od-goto],a[href]');if(!a)return;var id=a.getAttribute('data-od-goto');if(!id){var h=a.getAttribute('href')||'';var m=/^(?:\\.\\/)?([^/?#]+)\\.html?(?:[?#].*)?$/i.exec(h);if(!m)return;id=m[1]}e.preventDefault();parent.postMessage({odGoto:id},'*')},true)})();</script>`;

function withNavScript(html: string): string {
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${PROTOTYPE_NAV_SCRIPT}</body>`) : html + PROTOTYPE_NAV_SCRIPT;
}

export function prototypeShellHtml(title: string, screens: Array<{ id: string; title: string; html: string }>, start: string): string {
  const data = JSON.stringify(Object.fromEntries(screens.map((s) => [s.id, s.html]))).replace(/</g, '\\u003c');
  const titles = JSON.stringify(Object.fromEntries(screens.map((s) => [s.id, s.title]))).replace(/</g, '\\u003c');
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>html,body{margin:0;height:100%;background:#111}iframe{display:block;border:0;width:100%;height:100%;background:#fff}
#od-proto-bar{position:fixed;right:12px;bottom:12px;display:flex;gap:6px;font:12px system-ui,sans-serif;z-index:2}
#od-proto-bar button,#od-proto-bar select{font:inherit;padding:4px 8px;border-radius:6px;border:1px solid #888;background:#fff;color:#111}</style></head>
<body><iframe id="od-proto" title="${esc(title)}"></iframe>
<div id="od-proto-bar"><button type="button" id="od-proto-back" aria-label="Back">←</button><select id="od-proto-pick" aria-label="Screen"></select></div>
<script type="application/json" id="od-proto-screens">${data}</script>
<script>(function(){var screens=JSON.parse(document.getElementById('od-proto-screens').textContent);var titles=${titles};var frame=document.getElementById('od-proto');var pick=document.getElementById('od-proto-pick');var stack=[];var current=null;
Object.keys(screens).forEach(function(id){var o=document.createElement('option');o.value=id;o.textContent=titles[id]||id;pick.appendChild(o)});
function show(id,push){if(!screens[id])return;if(push&&current)stack.push(current);current=id;frame.srcdoc=screens[id];pick.value=id;try{if(location.hash!=='#'+id)window.history.replaceState(null,'','#'+id)}catch(err){}}
window.addEventListener('message',function(e){if(e.source===frame.contentWindow&&e.data&&typeof e.data.odGoto==='string')show(e.data.odGoto,true)});
pick.addEventListener('change',function(){show(pick.value,true)});document.getElementById('od-proto-back').addEventListener('click',function(){var prev=stack.pop();if(prev)show(prev,false)});
var first=location.hash.slice(1);show(screens[first]?first:${JSON.stringify(start)},false)})();</script>
</body></html>
`;
}

export type CollectionPrototypeResult = { ok: true; output: string; screens: string[]; bytes: number; warnings: string[] } | { ok: false; code: string; error: string };

/** One self-contained HTML file where the collection's links switch screens. */
export async function exportCollectionPrototype(workspaceRoot: string, outputDir: string, collectionId: string): Promise<CollectionPrototypeResult> {
  const flow = await loadCollectionFlow(workspaceRoot, outputDir, collectionId);
  if (!flow) return { ok: false, code: 'not-found', error: `No screens are registered with collectionId "${collectionId}".` };
  const absRoot = path.resolve(workspaceRoot);
  const warnings: string[] = [];
  const out: Array<{ id: string; title: string; html: string }> = [];
  for (const s of flow.screens) {
    if (s.html === undefined) {
      warnings.push(`${s.id}: the file is missing, so it isn't in the prototype.`);
      continue;
    }
    const resolved = await resolveIncludes(s.html, path.join(absRoot, s.entryPath), absRoot);
    if (resolved.missing.length > 0) warnings.push(`${s.id}: couldn't include ${resolved.missing.join(', ')}.`);
    try {
      const bundled = await bundleStandaloneHtml({ entryPath: s.entryPath, html: resolved.html, readAsset: workspaceAssetReader(workspaceRoot) });
      out.push({ id: s.id, title: s.title, html: withNavScript(bundled.html) });
      for (const url of bundled.externalDependencies) warnings.push(`${s.id}: still loads ${url} at view time.`);
    } catch (err) {
      warnings.push(`${s.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (out.length === 0) return { ok: false, code: 'package-failed', error: 'No screen of the collection could be packaged.' };
  const html = prototypeShellHtml(flow.collectionName, out, out[0].id);
  const output = path.posix.join(flow.collectionDir, 'exports', `${collectionId}-prototype.html`);
  await fs.mkdir(path.join(workspaceRoot, path.posix.dirname(output)), { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, output), html);
  return { ok: true, output, screens: out.map((s) => s.id), bytes: Buffer.byteLength(html, 'utf8'), warnings };
}

export function formatCollectionCheckResult(result: CheckCollectionResult): string {
  if (!result.ok) return `Check failed (${result.code}): ${result.error}`;
  const checked = result.screens.filter((s) => s.checked).map((s) => s.id);
  const lines = [`Checked the collection "${result.collectionId}": ${checked.length} screen(s) (${checked.join(', ') || 'none'}) and the links between them. Findings name their screen.`];
  lines.push(...formatPreflight(result.findings, 're-check'));
  lines.push(`Flow map: ${result.mapPath} (each screen with its links; planned links not built are dashed red). Open it in the preview to show the user the whole flow.`);
  if (result.images.length > 0) lines.push(`Screenshots (${result.images.length}, attached in this order, shared across the screens): ${result.images.map((i) => `${i.label} ${i.width}×${i.height}`).join('; ')}.`);
  if (result.omitted.length > 0) lines.push(`Not attached: ${result.omitted.join('; ')}.`);
  const warnings = result.warnings.filter((w) => !/Failed to load: /.test(w));
  if (warnings.length > 0) lines.push('Warnings:', ...warnings.map((w) => `- ${w}`));
  return lines.join('\n');
}

export function formatCollectionPrototypeResult(result: CollectionPrototypeResult): string {
  if (!result.ok) return `Export failed (${result.code}): ${result.error}`;
  const lines = [`Wrote a clickable prototype of ${result.screens.length} screen(s) to ${result.output} (${(result.bytes / 1024).toFixed(0)} KB). It is one self-contained file: open it in a browser, offline too, and its links move between the screens (${result.screens.join(', ')}); the corner menu jumps to any screen.`];
  if (result.warnings.length > 0) lines.push('Warnings:', ...result.warnings.map((w) => `- ${w}`));
  return lines.join('\n');
}
